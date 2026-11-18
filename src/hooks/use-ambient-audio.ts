'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AUDIO_MISSING_MESSAGE,
  AUDIO_PREF_STORAGE_KEY,
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

/**
 * 背景音乐控制。
 *
 * - 首次进入绝不自动播放（尊重浏览器 autoplay 策略与用户意愿）；
 * - 只记住“用户是否开过音乐”，刷新后仍需用户点击才会出声；
 * - 播放失败（例如音源尚未放置）进入 missing 状态并给出说明，不抛错、不阻塞界面；
 * - 真源缺失在 <audio> 预载元数据时就会暴露，不必等到用户点播放才发现。
 */
export function useAmbientAudio(): AmbientAudioControls {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const [status, setStatus] = useState<AudioStatus>('idle');
  const [volume, setVolumeState] = useState<number>(DEFAULT_AUDIO_PREFERENCE.volume);
  const [enabled, setEnabled] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);

  // 读取音量偏好（不自动开启播放）
  useEffect(() => {
    const preference = readPreference();
    setVolumeState(preference.volume);
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
   * 尝试播放。返回是否真的开始播放，调用方据此决定要不要记住“音乐已开启”。
   */
  const startPlayback = useCallback(async (): Promise<boolean> => {
    const audio = audioRef.current;
    if (!audio) return false;
    setMessage(null);
    setStatus('loading');
    audio.volume = 0;

    // 上一次加载失败过（用户可能刚把文件放进来），先重置再试
    if (audio.error) audio.load();

    let settled = false;
    clearWatchdog();
    watchdogRef.current = window.setTimeout(() => {
      watchdogRef.current = null;
      if (settled) return;
      settled = true;
      // 超时后区分“确实没有音源”和“网络慢还在缓冲”
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
      settled = true;
      clearWatchdog();
      setStatus('playing');
      setEnabled(true);
      fadeTo(volume);
      return true;
    } catch (error) {
      settled = true;
      clearWatchdog();
      const name = error instanceof Error ? error.name : '';
      // NotAllowedError：浏览器拦截了自动播放（本设计里只会出现在用户手势之外）
      if (name === 'NotAllowedError') {
        setStatus('paused');
        setEnabled(false);
        setMessage('浏览器拦截了这次播放，请再点一次音乐按钮。');
      } else {
        markMissing();
      }
      return false;
    }
  }, [clearWatchdog, fadeTo, markMissing, volume]);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    clearWatchdog();
    setEnabled(false);
    fadeTo(0, () => {
      audio.pause();
      setStatus((prev) => (prev === 'missing' ? prev : 'paused'));
    });
  }, [clearWatchdog, fadeTo]);

  const toggle = useCallback(() => {
    if (enabled || status === 'playing') {
      stopPlayback();
      writePreference({ enabled: false, volume });
      return;
    }
    void startPlayback().then((started) => {
      // 只有真的出声了才记住“音乐已开启”，否则下次打开会是静音的诚实状态
      writePreference({ enabled: started, volume });
    });
  }, [enabled, status, startPlayback, stopPlayback, volume]);

  const setVolume = useCallback(
    (value: number) => {
      const next = Math.min(1, Math.max(0, value));
      setVolumeState(next);
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
   * 音源可用性探测。
   *
   * SSR 输出的 <audio preload="metadata"> 会在页面脚本执行前就发起请求，
   * 若文件不存在，error 事件在 React 挂上监听之前就已经发过了。
   * 因此这里先补查 audio.error，再用原生监听兜住“仍在请求中”的情况，
   * 这样用户还没点播放就知道音源缺失，而不是点了才发现。
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.error) {
      markMissing();
      return;
    }
    const handleError = () => markMissing();
    audio.addEventListener('error', handleError);
    return () => audio.removeEventListener('error', handleError);
  }, [markMissing]);

  // 卸载时释放音频资源
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
      }
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
