/**
 * 背景音乐配置。
 *
 * 当前曲目：《Long Day》——PurrpleCat（Pixabay）。
 * 音频文件位于 `public/audio/long-day.mp3`，随站点一起分发。
 * 若需要更换曲目，把音频放到 `public/audio/` 下并修改下面的 `src` 即可；
 * 文件缺失时播放器会进入“音源缺失”状态并给出明确提示，不影响其它任何功能。
 */
export interface AudioTrackConfig {
  title: string;
  artist: string;
  /** 站点根路径下的音频地址 */
  src: string;
  /** 建议音量（0-1），用户的实际偏好会被单独记住 */
  defaultVolume: number;
  /** 循环播放 */
  loop: boolean;
}

export const AUDIO_TRACK: AudioTrackConfig = {
  title: 'Long Day',
  artist: 'PurrpleCat · Pixabay',
  src: '/audio/long-day.mp3',
  defaultVolume: 0.35,
  loop: true,
};

export const AUDIO_PREF_STORAGE_KEY = 'moodbox:audio-preference';

export interface AudioPreference {
  enabled: boolean;
  volume: number;
}

export const DEFAULT_AUDIO_PREFERENCE: AudioPreference = {
  enabled: false,
  volume: AUDIO_TRACK.defaultVolume,
};

/** 淡入淡出的时间（毫秒） */
export const FADE_DURATION = 1400;
/** 点击播放后等待多久还没有成功出声，就认为音源不可用（毫秒） */
export const PLAY_WATCHDOG_MS = 8000;
/** 音源缺失时给用户看的说明（路径提示由播放器面板单独渲染） */
export const AUDIO_MISSING_MESSAGE = '这段音乐还没有被放进站点里，所以暂时听不到。';
