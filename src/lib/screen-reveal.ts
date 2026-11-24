'use client';

/**
 * 「这一屏该入场了」的统一信号。
 *
 * 两种来源：
 * - 手机端由 CSS 吸附 + IntersectionObserver 决定（浏览器自己滚，JS 不介入）；
 * - 桌面端由 JS 翻页器在动画走到 60% 时广播，让新一屏的淡入和翻页节奏对齐。
 *
 * 用自定义事件而不是逐层传 props：ScrollScreen 在 HomeExperience 的子树里，
 * 但翻页器只管滚动，不该知道哪一屏叫什么、里面有什么。
 */
export const SCREEN_REVEAL_EVENT = 'moodbox:reveal-screen';

export function revealScreen(id: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>(SCREEN_REVEAL_EVENT, { detail: id }));
}
