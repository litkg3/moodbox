'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AUDIO_MISSING_MESSAGE,
  AUDIO_PREF_STORAGE_KEY,
  AUDIO_TRACK,
  DEFAULT_AUDIO_PREFERENCE,
  FADE_DURATION,
  PLAY_ATTEMPT_TIMEOUT_MS,
  PLAY_WATCHDOG_MS,
  STALL_JUMP_SECONDS,
  STALL_PROBE_MS,
  STALL_RESUME_DELAY_MS,
  type AudioPreference,
} from '@/lib/audio-config';

export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'missing' | 'error';

export interface AmbientAudioControls {
  status: AudioStatus;
  volume: number;
  enabled: boolean;
  message: string | null;
  toggle: () => void;
  setVolume: (value: number) => void;
  /** 提供给 <audio> 元素的 ref 与事件处理 */
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onAudioError: () => void;
  onAudioPlaying: () => void;
  onAudioPause: () => void;
  onAudioStalled: () => void;
  onAudioEnded: () => void;
}

function readPreference(): AudioPreference {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_PREFERENCE;
  try {
    const raw = window.localStorage.getItem(AUDIO_PREF_STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_PREFERENCE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_AUDIO_PREFERENCE;
    const record = parsed as Partial<AudioPreference>;
    const volume =
      typeof record.volume === 'number' && Number.isFinite(record.volume)
        ? Math.min(1, Math.max(0, record.volume))
        : DEFAULT_AUDIO_PREFERENCE.volume;
    return { enabled: record.enabled === true, volume };
  } catch {
    return DEFAULT_AUDIO_PREFERENCE;
  }
}

function writePreference(preference: AudioPreference): void {
  try {
    window.localStorage.setItem(AUDIO_PREF_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // 隐私模式下写入失败不应影响播放
  }
}

/** `play()` 被这两个原因拒掉时值得再试一次：多半是被上一轮暂停 / 重置打断的 */
function isTransientPlaybackError(name: string): boolean {
  return name === 'AbortError' || name === 'NotSupportedError' || name === '';
}

/** `play()` 永远不 settle 时用来打破等待的假错误，只在本模块内部使用 */
const GIVE_UP = 'MoodBoxGaveUp';

const RETRY_DELAY_MS = 160;

/** 把 promise 与超时赛跑：`play()` 偶发不 resolve，不做这层兜底会永远停在「准备中」 */
function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(GIVE_UP)), ms);
    task.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * 背景音乐控制。
 *
 * - 首次进入绝不自动播放（尊重浏览器 autoplay 策略与用户意愿）；
 * - 只记住「用户是否开过音乐」，刷新后仍需用户点击才会出声；
 * - 播放失败（例如音源尚未放置）进入 missing 状态并给出说明，不抛错、不阻塞界面；
 * - 音源缺失在 <audio> 预载元数据时就会暴露，不必等到用户点播放才发现。
 *
 * ## 为什么「点了会卡住」
 *
 * 卡住指的是：点了播放，徽标一直停在「准备中」，没有声音也没有报错。
 * `play()` 返回的是一个可能**永远不 resolve** 的 promise —— 网络半途断了、
 * 浏览器决定再等等、或者它被上一轮收尾挂住，都会这样，而 `play()` 不 resolve
 * 就不会走到 catch。原来的实现只有「超时 5 秒」一条兜底，且只在自增代次
 * 匹配时才生效，于是连点几次就能让它彻底哑掉。
 *
 * 现在按四层兜住，每一层都保证「一定会走到一个终态」：
 *
 * 1. **锁住重复点击**：一次尝试没结束之前，再点只当作「再催一下」，
 *    不并发开第二条 `play()`；
 * 2. **play() 本身带超时**（`PLAY_ATTEMPT_TIMEOUT_MS`）：不 resolve 就当失败，
 *    并记下这一次是「超时」而不是「没有音源」；
 * 3. **超时就重置元素再试**：`load()` 一次把半死的连接扔掉，
 *    但**只在真的超时时才这么做** —— 上次的写法是「只要 error 存在就 load()」，
 *    它会在正常播放中反复打断自己；
 * 4. **判断缺失要看证据**：只有 `error.code` 是媒体级错误（MEDIA_ERR_*）
 *    才算「音源不可用」。超时、被拦、被上一次打断一律不当成没有文件。
 *
 * 播放中还有两个卡点：进度停住（stalled / waiting 超过 `STALL_PROBE_MS`）
 * 会先试一次重连，播放位置没动过且已经又过了一个探测窗口，就提示可以直接停掉；
 * `loop` 偶尔不生效时，`ended` 会自己回过头重播。
 */
export function useAmbientAudio(): AmbientAudioControls {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  /**
   * 播放代次。每次「开始播放 / 停止播放」都 +1，
   * 异步回调（淡出结束、重试、watchdog）先比一次代次，过期就作废。
   */
  const generationRef = useRef(0);
  const [status, setStatus] = useState<AudioStatus>('idle');
  const [volume, setVolumeState] = useState<number>(DEFAULT_AUDIO_PREFERENCE.volume);
  const [enabled, setEnabled] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);

  /** 音量的最新值：淡入要读它，但不能因为 volume 变了就重建回调 */
  const volumeRef = useRef(volume);
  /**
   * 「用户想要的是开着还是关着」。
   *
   * 不能拿 `status === 'playing'` 判断 —— 点下去到真的出声之间有一段 `loading`，
   * 这期间再点一下会被当成「还没开，再开一次」，于是永远停不下来（实测连点 5 次
   * 最后仍在播放）。这份意图以用户最后一次点击为准，异步结果只负责跟上。
   */
  const wantsPlayRef = useRef(false);
  /**
   * 正在进行的这次尝试。
   *
   * `pendingRef` 防重复进入（React 状态更新是异步的，连点两下会读到同一个 false）；
   * `resumeAtRef` 是进度位置，用来判断「卡住之后是不是真的一动不动」。
   */
  const pendingRef = useRef(false);
  const resumeAtRef = useRef<number | null>(null);
  /** 上一次点播放被我们自己按超时打断了：下一次先重置元素再播 */
  const needReloadRef = useRef(false);
  /** 卡顿探测：有没有已经派出去的那一次 */
  const stallProbeRef = useRef<number | null>(null);
  /** 这一次播放有没有走过「静默重连」；重连只做一次，第二次直接提示用户 */
  const reconnectedRef = useRef(false);
  /** 正在 `load()` 重连：这期间进来的 stalled 不理，否则会把自己取消掉 */
  const reconnectingRef = useRef(false);

  // 读取音量偏好（不自动开启播放）
  useEffect(() => {
    const preference = readPreference();
    setVolumeState(preference.volume);
    volumeRef.current = preference.volume;
    setPreferenceLoaded(true);
    const audio = audioRef.current;
    if (audio) audio.volume = 0;
  }, []);

  const clearStallProbe = useCallback(() => {
    if (stallProbeRef.current !== null) {
      window.clearTimeout(stallProbeRef.current);
      stallProbeRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) {
        window.clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      if (watchdogRef.current !== null) {
        window.clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      if (stallProbeRef.current !== null) {
        window.clearTimeout(stallProbeRef.current);
        stallProbeRef.current = null;
      }
    };
  }, []);

  const fadeTo = useCallback((target: number, onDone?: () => void) => {
    const audio = audioRef.current;
    if (!audio) {
      onDone?.();
      return;
    }
    if (fadeTimerRef.current !== null) {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    const start = audio.volume;
    const startedAt = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const progress = Math.min(1, elapsed / FADE_DURATION);
      // easeOutCubic 让音量变化更自然
      const eased = 1 - (1 - progress) ** 3;
      audio.volume = Math.min(1, Math.max(0, start + (target - start) * eased));
      if (progress >= 1) {
        if (fadeTimerRef.current !== null) {
          window.clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
        }
        onDone?.();
      }
    };
    // 先把音量推一档，避免第一帧看起来没变化
    tick();
    fadeTimerRef.current = window.setInterval(tick, 60);
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const markMissing = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) audio.pause();
    clearStallProbe();
    pendingRef.current = false;
    setStatus('missing');
    setEnabled(false);
    setMessage(AUDIO_MISSING_MESSAGE);
  }, [clearStallProbe]);

  /**
   * 音源是不是**真的**不可用。
   *
   * 只认 `error.code`：断网或超时之后 `audio.error` 可能还挂着上一次的旧值，
   * 拿它当判据会误报「没有文件」。NETWORK_NO_SOURCE 作为补充 —— 那是
   * 浏览器确定「这个 src 找不到可播放的资源」。
   */
  const isSourceBroken = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return false;
    // MEDIA_ERR_SRC_NOT_SUPPORTED = 4（TS 的 lib 里只声明了 NETWORK_* 常量，这里写字面量并注明）
    const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;
    const code = audio.error?.code ?? 0;
    return (
      code === MEDIA_ERR_SRC_NOT_SUPPORTED ||
      audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE
    );
  }, []);

  /**
   * 尝试播放。返回是否真的开始播放，调用方据此决定要不要记住「音乐已开启」。
   */
  const startPlayback = useCallback(async (): Promise<boolean> => {
    const audio = audioRef.current;
    if (!audio) return false;

    const gen = ++generationRef.current;
    pendingRef.current = true;
    reconnectedRef.current = false;
    setMessage(null);
    /**
     * 已经缓冲够了就别闪「准备中」——
     * 这一下本来就是从点击到出声，多一个状态只会让人以为又要等。
     */
    if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) setStatus('loading');
    resumeAtRef.current = audio.currentTime;
    audio.volume = 0;

    // 上一次是被我们自己按超时打断的：连接多半已经半死，重置一次再播
    if (needReloadRef.current) {
      needReloadRef.current = false;
      try {
        audio.load();
      } catch {
        // 重置失败就直接播，下面还有超时兜着
      }
    }

    clearWatchdog();
    watchdogRef.current = window.setTimeout(() => {
      watchdogRef.current = null;
      if (gen !== generationRef.current) return;
      // 超时后区分「确实没有音源」和「网络慢还在缓冲」
      clearStallProbe();
      pendingRef.current = false;
      if (isSourceBroken()) {
        markMissing();
      } else {
        needReloadRef.current = true;
        setStatus('error');
        setEnabled(false);
        setMessage('音乐加载得有点慢，稍后再点一次试试。');
      }
    }, PLAY_WATCHDOG_MS);

    try {
      await withTimeout(audio.play(), PLAY_ATTEMPT_TIMEOUT_MS);
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      // NotAllowedError：浏览器拦截了自动播放（本设计里只会出现在用户手势之外）
      if (name === 'NotAllowedError') {
        clearWatchdog();
        if (gen === generationRef.current) {
          pendingRef.current = false;
              setStatus('paused');
          setEnabled(false);
          setMessage('浏览器拦截了这次播放，请再点一次音乐按钮。');
        }
        return false;
      }
      /*
       * AbortError 是浏览器的老毛病：上一次 pause()/load() 的收尾晚于这一次 play()，
       * 新的一次就被打断。音源没问题，隔一帧再来一次即可。
       */
      if (isTransientPlaybackError(name) && gen === generationRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS));
        if (gen !== generationRef.current) return false;
        try {
          await withTimeout(audio.play(), PLAY_ATTEMPT_TIMEOUT_MS);
        } catch (retryError) {
          clearWatchdog();
          if (gen === generationRef.current) {
            const retryName = retryError instanceof Error ? retryError.name : '';
            pendingRef.current = false;
                  if (isSourceBroken()) {
              markMissing();
            } else {
              // 包括我们自己的超时：给一句「再点一次」，而不是假装还在准备
              needReloadRef.current = retryName === GIVE_UP;
              setStatus('error');
              setEnabled(false);
              setMessage('音乐没能开始播放，再点一次试试。');
            }
          }
          return false;
        }
      } else {
        clearWatchdog();
        if (gen === generationRef.current) {
          pendingRef.current = false;
          if (isSourceBroken()) {
            markMissing();
          } else {
            /*
             * 走到这里说明「文件是好的，只是这一次没播起来」——
             * 可能是我们的 play() 超时，也可能是浏览器自己拒了。
             * 一律说「再点一次」，绝不说「没能加载」：后者会把一次网络抖动
             * 说成文件不存在，用户会以为音乐坏了，再也不会去点第二次。
             */
            needReloadRef.current = name === GIVE_UP;
            setStatus('error');
            setEnabled(false);
            setMessage('音乐没能开始播放，再点一次试试。');
          }
        }
        return false;
      }
    }

    /*
     * 这期间用户又点了暂停：这条 play() 已经真的出声了，得自己收回来。
     * 只 return 不管它的话，界面显示「已暂停」而音乐还在响。
     */
    if (gen !== generationRef.current) {
      audio.pause();
      audio.volume = 0;
      return false;
    }

    clearWatchdog();
    pendingRef.current = false;
    setStatus('playing');
    setEnabled(true);
    setMessage(null);
    fadeTo(volumeRef.current);
    return true;
  }, [clearStallProbe, clearWatchdog, fadeTo, isSourceBroken, markMissing]);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const gen = ++generationRef.current;
    wantsPlayRef.current = false;
    reconnectedRef.current = false;
    clearWatchdog();
    clearStallProbe();
    pendingRef.current = false;
    setEnabled(false);

    // 还没出声（点播放后仍在准备中）：直接回到暂停，不用等淡出
    if (audio.paused) {
      audio.volume = 0;
      setStatus((prev) => (prev === 'missing' ? prev : 'paused'));
      return;
    }

    fadeTo(0, () => {
      // 淡出的这一秒里用户又点开了：这次 pause 作废
      if (gen !== generationRef.current) return;
      audio.pause();
      audio.volume = 0;
      setStatus((prev) => (prev === 'missing' ? prev : 'paused'));
    });
  }, [clearStallProbe, clearWatchdog, fadeTo]);

  const toggle = useCallback(() => {
    /*
     * 准备中再点一下 = 取消（用户想要什么以上一次点击为准），
     * 但不能并发开第二条 play()：那正是「卡住」的来源之一。
     */
    if (pendingRef.current) {
      stopPlayback();
      writePreference({ enabled: false, volume: volumeRef.current });
      return;
    }
    if (wantsPlayRef.current) {
      stopPlayback();
      writePreference({ enabled: false, volume: volumeRef.current });
      return;
    }
    wantsPlayRef.current = true;
    void startPlayback().then((started) => {
      if (!started) wantsPlayRef.current = false;
      // 只有真的出声了才记住「音乐已开启」，否则下次打开会是静音的诚实状态
      writePreference({ enabled: started, volume: volumeRef.current });
    });
  }, [startPlayback, stopPlayback]);

  const setVolume = useCallback(
    (value: number) => {
      const next = Math.min(1, Math.max(0, value));
      setVolumeState(next);
      volumeRef.current = next;
      writePreference({ enabled, volume: next });
      const audio = audioRef.current;
      if (audio && status === 'playing' && fadeTimerRef.current === null) {
        audio.volume = next;
      }
    },
    [enabled, status],
  );

  const onAudioError = useCallback(() => {
    markMissing();
  }, [markMissing]);

  const onAudioPlaying = useCallback(() => {
    clearStallProbe();
    reconnectedRef.current = false;
    pendingRef.current = false;
    setStatus('playing');
    setMessage(null);
  }, [clearStallProbe]);

  const onAudioPause = useCallback(() => {
    setStatus((prev) => (prev === 'missing' ? prev : 'paused'));
  }, []);

  /**
   * 播放中进度停住了。
   *
   * `stalled` / `waiting` 在切后台、切网络、休眠唤醒之后都会来一发，
   * 多数时候浏览器自己会接上。所以这里不立刻报警，而是过 `STALL_PROBE_MS`
   * 看一眼播放位置：
   *
   * 1. 位置不动的**第一次** —— 先**静默**重连一次：`load()` 掉半死的连接，
   *    把播放位置放回去再 play。这一步不打扰用户，多数情况下就恢复了；
   * 2. 还不动 —— 之后每过一个窗口再看一眼，位置始终不动就提示
   *    「卡住了，点一下音乐按钮可以关掉重开」。
   *
   * 注意这里**不看 `audio.paused`**：见过最难查的一种卡住，是 paused 已经是
   * true 而界面还挂着「播放中」—— 拿 paused 当判据会让这条路径永远不触发。
   * 只认「进度有没有往前走」这一件事实。
   *
   * 关键是**永远给用户一条明确的出路**，而不是让徽标一直挂着「播放中」却没声音。
   */
  const onAudioStalled = useCallback(() => {
    /*
     * 重连过程中 `load()` 会同步派发 `stalled`，那一次不该被当成「又卡了一次」
     * 去取消探测 —— 否则重连之后就再也没有下文。
     */
    if (reconnectingRef.current) return;
    clearStallProbe();
    if (!wantsPlayRef.current) return;

    /** 一轮探测：位置没动就重连一次，还不动就提示用户 */
    const probe = () => {
      stallProbeRef.current = null;
      const audio = audioRef.current;
      if (!audio || !wantsPlayRef.current) return;

      const at = audio.currentTime;
      const anchor = resumeAtRef.current;
      // 位置在往前走：缓冲慢了一下而已，把锚点挪到现在，结束这一轮
      if (anchor !== null && at > anchor + STALL_JUMP_SECONDS) {
        resumeAtRef.current = at;
        reconnectedRef.current = false;
        return;
      }

      if (reconnectedRef.current) {
        // 重连过还是不动：明确说一句，用户知道该点哪里
        needReloadRef.current = true;
        setStatus('error');
        setMessage('音乐卡住了，点一下音乐按钮可以关掉重开。');
        return;
      }

      // 第一次发现停住：静默重连，不告诉用户，再等一个窗口回来确认
      reconnectedRef.current = true;
      resumeAtRef.current = at;
      reconnectingRef.current = true;
      try {
        audio.load();
        audio.currentTime = at;
        audio.volume = volumeRef.current;
        void withTimeout(audio.play(), PLAY_ATTEMPT_TIMEOUT_MS).catch(() => {
          // 失败就等下一轮探测，这里不打扰用户
        });
      } catch {
        // 重连失败：下一轮探测会给出提示
      } finally {
        // 下一轮在重连**之后**排，`load()` 期间进来的 stalled 已经被上面的开关挡掉
        reconnectingRef.current = false;
        stallProbeRef.current = window.setTimeout(probe, STALL_PROBE_MS);
      }
    };

    stallProbeRef.current = window.setTimeout(probe, STALL_PROBE_MS);
  }, [clearStallProbe]);

  /** `loop` 偶发不生效（尤其切过标签页之后）：自己回过头重播，别让音乐停在结尾 */
  const onAudioEnded = useCallback(() => {
    if (!wantsPlayRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    window.setTimeout(() => {
      if (audio.paused && wantsPlayRef.current) {
        audio.currentTime = 0;
        void withTimeout(audio.play(), PLAY_ATTEMPT_TIMEOUT_MS).catch(() => {
          // 失败就停在这里，用户下次点播放时会走完整的重试
        });
      }
    }, STALL_RESUME_DELAY_MS);
  }, []);

  /**
   * 音源可用性探测 + 提前拉流。
   *
   * SSR 输出的 <audio preload="auto"> 会在脚本执行前就开始请求；若文件不存在，
   * error 事件在 React 挂上监听之前就已经发过了。因此这里先补查 audio.error，
   * 再用原生监听兜住「仍在请求中」的情况 —— 用户还没点播放就知道音源缺失。
   *
   * 另外补一次「首个手势时拉流」：手机 Safari 会无视 preload，直到用户碰一下
   * 屏幕才真的去下载。把这一步提到点击音乐按钮之前，等待就藏进了浏览页面的时间里。
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // StrictMode 下 effect 会跑两遍，上一遍的清理把 src 清空过就补回来
    if (!audio.getAttribute('src')) audio.setAttribute('src', AUDIO_TRACK.src);

    if (audio.error) {
      markMissing();
      return;
    }

    const handleError = () => markMissing();
    audio.addEventListener('error', handleError);

    const warm = () => {
      // NETWORK_EMPTY 才说明浏览器根本没开始拉；已经在下载就别打断它
      if (audio.readyState === 0 && audio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
        try {
          audio.load();
        } catch {
          // 拉不起来就算了，点播放时还会再试
        }
      }
    };
    window.addEventListener('pointerdown', warm, { once: true, passive: true });
    window.addEventListener('keydown', warm, { once: true });
    window.addEventListener('touchstart', warm, { once: true, passive: true });

    return () => {
      audio.removeEventListener('error', handleError);
      window.removeEventListener('pointerdown', warm);
      window.removeEventListener('keydown', warm);
      window.removeEventListener('touchstart', warm);
    };
  }, [markMissing]);

  /**
   * 卸载时只暂停，**不要清空 src**。
   *
   * 原来这里写了 `audio.src = ''`：dev 下 StrictMode 会「挂载 → 卸载 → 再挂载」，
   * 那一次清空之后 React 不会重设 src（prop 没变），于是整个会话里点播放都失败。
   */
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) audio.pause();
    };
  }, []);

  return {
    status,
    volume,
    enabled: enabled && preferenceLoaded,
    message,
    toggle,
    setVolume,
    audioRef,
    onAudioError,
    onAudioPlaying,
    onAudioPause,
    onAudioStalled,
    onAudioEnded,
  };
}
