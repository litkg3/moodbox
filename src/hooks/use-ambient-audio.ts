'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AUDIO_MISSING_MESSAGE,
  AUDIO_PREF_STORAGE_KEY,
  AUDIO_TRACK,
  DEFAULT_AUDIO_PREFERENCE,
  FADE_DURATION,
  PLAY_WATCHDOG_MS,
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

const RETRY_DELAY_MS = 160;

/**
 * 背景音乐控制。
 *
 * - 首次进入绝不自动播放（尊重浏览器 autoplay 策略与用户意愿）；
 * - 只记住「用户是否开过音乐」，刷新后仍需用户点击才会出声；
 * - 播放失败（例如音源尚未放置）进入 missing 状态并给出说明，不抛错、不阻塞界面；
 * - 音源缺失在 <audio> 预载元数据时就会暴露，不必等到用户点播放才发现。
 *
 * 这版针对「点了要等很久」「偶尔点了没反应」做了三件事：
 *
 * 1. **提前缓冲**：`<audio preload="auto">` + 首个用户手势补一次 `load()`。
 *    Safari 会无视 preload，等到手势才肯真的拉流，这一步把等待挪到点击之前；
 * 2. **不再互相打架**：播放与暂停各自持有一个「代次」，淡出结束时若代次已经变了
 *    （用户又点开了），那次 `pause()` 直接作废 —— 之前会出现「点了播放，
 *    1.4 秒后自己停住」；
 * 3. **失败重试一次**：`play()` 被 AbortError 打断是常见竞态，隔一帧再试；
 *    仍然失败才判定音源有问题。
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

  // 读取音量偏好（不自动开启播放）
  useEffect(() => {
    const preference = readPreference();
    setVolumeState(preference.volume);
    volumeRef.current = preference.volume;
    setPreferenceLoaded(true);
    const audio = audioRef.current;
    if (audio) audio.volume = 0;
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
    setStatus('missing');
    setEnabled(false);
    setMessage(AUDIO_MISSING_MESSAGE);
  }, []);

  /**
   * 尝试播放。返回是否真的开始播放，调用方据此决定要不要记住「音乐已开启」。
   */
  const startPlayback = useCallback(async (): Promise<boolean> => {
    const audio = audioRef.current;
    if (!audio) return false;

    const gen = ++generationRef.current;
    setMessage(null);
    /**
     * 已经缓冲够了就别闪「准备中」——
     * 这一下本来就是从点击到出声，多一个状态只会让人以为又要等。
     */
    if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) setStatus('loading');
    audio.volume = 0;

    // 上一次加载失败过（用户可能刚把文件放进来），先重置再试
    if (audio.error) audio.load();

    clearWatchdog();
    watchdogRef.current = window.setTimeout(() => {
      watchdogRef.current = null;
      if (gen !== generationRef.current) return;
      // 超时后区分「确实没有音源」和「网络慢还在缓冲」
      if (audio.error || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
        markMissing();
      } else {
        setStatus('error');
        setEnabled(false);
        setMessage('音乐加载得有点慢，稍后再点一次试试。');
      }
    }, PLAY_WATCHDOG_MS);

    try {
      await audio.play();
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      // NotAllowedError：浏览器拦截了自动播放（本设计里只会出现在用户手势之外）
      if (name === 'NotAllowedError') {
        clearWatchdog();
        if (gen === generationRef.current) {
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
          await audio.play();
        } catch {
          clearWatchdog();
          if (gen === generationRef.current) markMissing();
          return false;
        }
      } else {
        clearWatchdog();
        if (gen === generationRef.current) markMissing();
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
    setStatus('playing');
    setEnabled(true);
    fadeTo(volumeRef.current);
    return true;
  }, [clearWatchdog, fadeTo, markMissing]);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const gen = ++generationRef.current;
    wantsPlayRef.current = false;
    clearWatchdog();
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
  }, [clearWatchdog, fadeTo]);

  const toggle = useCallback(() => {
    // 以「用户上一次想要什么」为准：准备中点一下就是取消，而不是再开一次
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
    setStatus('playing');
    setMessage(null);
  }, []);

  const onAudioPause = useCallback(() => {
    setStatus((prev) => (prev === 'missing' ? prev : 'paused'));
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
  };
}
