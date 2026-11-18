/**
 * 背景音乐配置。
 *
 * 重要说明：
 * 本项目不内置、不下载、不分发任何受版权保护的音乐。
 * 请自行取得《Time Machine》相应版本的合法授权后，把音频文件放到 `public/audio/` 下，
 * 并在此处填写文件名。文件缺失时播放器会进入“音源缺失”状态并给出明确提示，
 * 不会影响网站其它任何功能。
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
  title: 'Time Machine',
  artist: '作者信息待填写',
  src: '/audio/time-machine.mp3',
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
