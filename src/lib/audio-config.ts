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

/** 淡入淡出的时间（毫秒）：0.9s 够柔和，又不至于让人觉得「点了没反应」 */
export const FADE_DURATION = 900;
/** 点击播放后等待多久还没有成功出声，就认为音源不可用（毫秒）。5s 够慢网络缓冲，也不至于让人干等 */
export const PLAY_WATCHDOG_MS = 5000;
/**
 * `play()` 本身多久不 resolve 就放弃这一次（毫秒）。
 *
 * 这个值必须**短于** PLAY_WATCHDOG_MS：先由它把「永远不 resolve 的 play()」
 * 变成一个可处理的失败，watchdog 才有机会区分「超时」和「没有音源」。
 * 不设这一层的话，界面会一直停在「准备中」，也就是用户说的「卡住」。
 */
export const PLAY_ATTEMPT_TIMEOUT_MS = 3500;
/** 播放中进度停住后，等多久回头看一眼播放位置（毫秒） */
export const STALL_PROBE_MS = 4000;
/** 静默重连之后，隔多久让浏览器接着放（毫秒） */
export const STALL_RESUME_DELAY_MS = 240;
/** 判定「播放位置在动」的容差（秒）：小于它就算没动 */
export const STALL_JUMP_SECONDS = 0.05;
/** 音源加载失败时给用户看的说明（路径提示由播放器面板单独渲染） */
export const AUDIO_MISSING_MESSAGE = '这段音乐没能加载出来，检查一下网络，稍后再试。';
