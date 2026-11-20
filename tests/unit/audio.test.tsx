import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayer } from '@/components/audio/audio-player';
import {
  AUDIO_MISSING_MESSAGE,
  AUDIO_PREF_STORAGE_KEY,
  PLAY_ATTEMPT_TIMEOUT_MS,
} from '@/lib/audio-config';

/**
 * 背景音乐的「卡住」。
 *
 * 用户看到的卡住只有一种样子：点了播放，徽标停在「播放中」或「准备中」，
 * 既没有声音、也没有任何说法。成因却有四种，这里逐一钉住：
 *
 * 1. `play()` 返回的 promise 永不 resolve（断网、连接半死）——
 *    必须有超时把它变成一句「再点一次」；
 * 2. 音源真的没有（404）—— 这话要说清楚是文件的事，不是网络；
 * 3. 播放中进度停住（切后台、休眠唤醒）—— 能自己恢复就别打扰用户；
 * 4. `loop` 没生效停在结尾 —— 自己回头重播。
 *
 * jsdom 的 `<audio>` 不会真的播放，`play()` 直接抛「未实现」。这里只把
 * 那几个与「卡住」相关的方法换成可控版本，元素本身仍是真的 audio，
 * 所以 React 的事件绑定、原生监听都能照常工作。
 */

type PlayBehaviour = 'ok' | 'hang' | 'reject';

let behaviour: PlayBehaviour = 'ok';
/** 造出来的 audio 元素，用例直接拿来拨动播放器状态 */
let audio: HTMLAudioElement;

function installFakeMedia(audioElement: HTMLAudioElement) {
  Object.defineProperty(audioElement, 'play', {
    configurable: true,
    writable: true,
    value: () => {
      if (behaviour === 'hang') return new Promise<void>(() => {});
      if (behaviour === 'reject') {
        Object.defineProperty(audioElement, 'paused', { configurable: true, get: () => true });
        const error = new Error('no source');
        error.name = 'NotSupportedError';
        return Promise.reject(error);
      }
      Object.defineProperty(audioElement, 'paused', { configurable: true, get: () => false });
      (audioElement as unknown as { __markBuffered: () => void }).__markBuffered();
      audioElement.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    },
  });
  Object.defineProperty(audioElement, 'pause', {
    configurable: true,
    writable: true,
    value: () => {
      Object.defineProperty(audioElement, 'paused', { configurable: true, get: () => true });
      audioElement.dispatchEvent(new Event('pause'));
    },
  });
  // 真实浏览器 load() 会同步派发 emptied / stalled，这正是要复现的坑
  Object.defineProperty(audioElement, 'load', {
    configurable: true,
    writable: true,
    value: () => {
      audioElement.dispatchEvent(new Event('emptied'));
      audioElement.dispatchEvent(new Event('stalled'));
    },
  });
  Object.defineProperty(audioElement, 'paused', { configurable: true, get: () => true });
  /*
   * 刚开始是「还没缓冲」（readyState 0）：
   * 播放器据此显示「准备中」—— 这正是用户会盯着看的那几秒。
   * 出声之后才算缓冲够，所以 OK 分支里把它抬到 4。
   */
  let buffered = false;
  Object.defineProperty(audioElement, 'readyState', {
    configurable: true,
    get: () => (buffered ? 4 : 0),
  });
  Object.defineProperty(audioElement, 'networkState', { configurable: true, get: () => 2 });
  Object.defineProperty(audioElement, 'duration', { configurable: true, get: () => 180 });
  Object.defineProperty(audioElement, 'volume', {
    configurable: true,
    get: () => 0,
    set: () => {},
  });
  Object.defineProperty(audioElement, 'error', { configurable: true, get: () => null });
  // OK 分支：标记已缓冲，供上面那个 getter 读
  Object.defineProperty(audioElement, '__markBuffered', {
    configurable: true,
    value: () => {
      buffered = true;
    },
  });
}

const originalCreate = document.createElement.bind(document);

beforeEach(() => {
  behaviour = 'ok';
  window.localStorage.setItem(
    AUDIO_PREF_STORAGE_KEY,
    JSON.stringify({ enabled: false, volume: 0.4 }),
  );

  vi.spyOn(document, 'createElement').mockImplementation(((
    tag: string,
    options?: ElementCreationOptions,
  ) => {
    const element = originalCreate(tag, options);
    if (tag === 'audio') {
      audio = element as HTMLAudioElement;
      // currentTime 要可写可读：进度探测全靠它
      let time = 0;
      Object.defineProperty(element, 'currentTime', {
        configurable: true,
        get: () => time,
        set: (value: number) => {
          time = value;
        },
      });
      installFakeMedia(element as HTMLAudioElement);
    }
    return element;
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const badgeText = () => document.body.textContent ?? '';

async function openAndPlay() {
  render(<AudioPlayer />);
  act(() => screen.getByRole('button', { name: /背景音乐|打开背景音乐/ }).click());
  const play = await screen.findByRole('button', { name: '播放背景音乐' });
  act(() => play.click());
  return play;
}

describe('背景音乐不会卡住', () => {
  it('play() 永不 resolve 时，超时后给出「再点一次」而不是一直停在准备中', async () => {
    behaviour = 'hang';
    await openAndPlay();

    // 超时之前：准备中（给用户一个「在努力」的信号）
    await waitFor(() => expect(badgeText()).toContain('准备中'), { timeout: 2000 });

    // 超时之后：明确一句，可以再点
    await waitFor(() => expect(badgeText()).toContain('再点一次'), {
      timeout: PLAY_ATTEMPT_TIMEOUT_MS + 3000,
    });
    expect(badgeText()).not.toContain(AUDIO_MISSING_MESSAGE);
  }, 15000);

  it('音源真的 404 时，说清楚是文件缺失', async () => {
    Object.defineProperty(audio ?? {}, 'error', { configurable: true, get: () => null });
    render(<AudioPlayer />);
    act(() => screen.getByRole('button', { name: /背景音乐|打开背景音乐/ }).click());
    const play = await screen.findByRole('button', { name: '播放背景音乐' });

    // 把元素伪装成「文件不存在」：媒体级错误码 4 + NETWORK_NO_SOURCE
    Object.defineProperty(audio, 'error', { configurable: true, get: () => ({ code: 4 }) });
    Object.defineProperty(audio, 'networkState', { configurable: true, get: () => 3 });
    behaviour = 'reject';
    act(() => play.click());

    await waitFor(() => expect(badgeText()).toContain('没能加载'));
    expect(badgeText()).toContain(AUDIO_MISSING_MESSAGE);
  });

  it('正常播放后，进度停住会自己接回来，不打扰用户', async () => {
    await openAndPlay();
    await waitFor(() => expect(badgeText()).toContain('播放中'));

    audio.currentTime = 12;
    // 冻结进度：模拟「声音停了、时间不走」
    Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => 12, set: () => {} });
    audio.dispatchEvent(new Event('stalled'));

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 4600));
    });
    // 静默重连过，但没惊动用户
    expect(badgeText()).toContain('播放中');
    expect(badgeText()).not.toContain('卡住');
  }, 15000);

  it('停在结尾时自己回头重播（loop 兜底）', async () => {
    await openAndPlay();
    await waitFor(() => expect(badgeText()).toContain('播放中'));

    // loop 失效的样子：audio 自己停了，界面上还是播放中
    Object.defineProperty(audio, 'paused', { configurable: true, get: () => true });
    audio.currentTime = 180;
    audio.dispatchEvent(new Event('ended'));

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 600));
    });
    expect(audio.paused).toBe(false);
    expect(audio.currentTime).toBe(0);
  });

  it('点了还没出声时再点一下就是取消，不会并发开第二条 play()', async () => {
    behaviour = 'hang';
    const play = await openAndPlay();
    await waitFor(() => expect(badgeText()).toContain('准备中'), { timeout: 2000 });

    const spy = vi.spyOn(audio, 'play');
    act(() => play.click());

    expect(spy).toHaveBeenCalledTimes(0);
    await waitFor(() => expect(badgeText()).toContain('已暂停'));
  }, 15000);
});
