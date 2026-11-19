'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/**
 * 从主页走进树洞广场的那一下。
 *
 * 为什么要有：
 *
 * 广场是一个独立页面。点主页那颗「树洞广场」，在慢一点的网络下会先看到
 * 一片空白，再「啪」地出现一整页 —— 不像走进一个地方，像换了一张壁纸。
 * 这里给它一条门缝：
 *
 * 1. 点击时记下「正在进广场」，页面照常跳转（不拦导航，不会变慢）；
 * 2. 新页面首帧就蒙上一层底色 —— 它存在于 `layout` 里，跨页不卸载，
 *    所以不会闪一下白；
 * 3. 门缝从中间向两边拉开，露出一只手绘的信封 / 树洞口 + 一句话；
 * 4. 拉开之后幕布淡出，广场已经在下面了。
 *
 * 只在「从主页出发」时触发（见 `enterSquare`）。直接输网址、从别的页面
 * 进来都不放这段，不然每次刷新都得等一次动画。
 */

/** 点击时写进 sessionStorage 的键：只跳一次，刷新不受影响 */
const SIGNAL_KEY = 'moodbox:entering-square';

/** 标记「这一次导航是去广场的」。 */
export function enterSquare(): void {
  try {
    window.sessionStorage.setItem(SIGNAL_KEY, '1');
  } catch {
    // 无痕模式下写不进去，最多是没有这段动画，不影响跳转
  }
}

function consumeSignal(): boolean {
  try {
    const hit = window.sessionStorage.getItem(SIGNAL_KEY) === '1';
    if (hit) window.sessionStorage.removeItem(SIGNAL_KEY);
    return hit;
  } catch {
    return false;
  }
}

const STAGE_MS = 2100;

export function SquareEntrance() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (pathname !== '/square') return;
    if (!consumeSignal()) return;
    setPlaying(true);
    // 减少动态偏好下只留一个很短的淡出，不做门缝
    const timer = window.setTimeout(() => setPlaying(false), reduceMotion ? 500 : STAGE_MS);
    return () => window.clearTimeout(timer);
  }, [pathname, reduceMotion]);

  /*
   * 播放期间锁住滚动：幕布下面正在加载的广场如果已经在长，手指一动
   * 就会把它滚到一半的位置，揭开时人已经错过了开头。
   */
  useEffect(() => {
    if (!playing) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [playing]);

  return (
    <AnimatePresence>
      {playing ? (
        <motion.div
          key="square-entrance"
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden"
          role="presentation"
          aria-hidden="true"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* 两扇门：从左、从右朝中间合拢，再各自退回去 */}
          <motion.span
            className="mb-gate-panel absolute inset-y-0 left-0 w-1/2"
            initial={reduceMotion ? { x: 0 } : { x: '-100%' }}
            animate={{ x: 0 }}
            exit={reduceMotion ? { x: 0 } : { x: '-100%' }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.span
            className="mb-gate-panel absolute inset-y-0 right-0 w-1/2"
            initial={reduceMotion ? { x: 0 } : { x: '100%' }}
            animate={{ x: 0 }}
            exit={reduceMotion ? { x: 0 } : { x: '100%' }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* 门缝里的东西：淡入 → 停住 → 淡出 */}
          <motion.div
            className="relative z-10 flex flex-col items-center px-6 text-center"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
            animate={{ opacity: [0, 1, 1, 1, 0], y: 0 }}
            transition={{ duration: reduceMotion ? 0.5 : 2, times: [0, 0.22, 0.6, 0.82, 1] }}
          >
            <GateMark />
            <p className="mt-5 font-display text-[17px] font-light tracking-[0.22em] text-ink-soft">
              树洞广场
            </p>
            <p className="mt-2 text-[11px] leading-[2] tracking-[0.08em] text-ink-ghost">
              找一个树洞，把心事放进去
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * 门缝里的图形：一个树洞口，里面投进一小束光。
 *
 * 不用图片、不用外链字体，纯 SVG —— 它要在导航的那一帧就出现，
 * 多一个网络请求都是白等。
 */
function GateMark() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <ellipse cx="32" cy="52" rx="19" ry="4" fill="currentColor" opacity="0.07" />
      {/* 洞：上窄下宽，像一个自然的树洞 */}
      <path
        d="M20 46c0-13.2 5.4-24 12-24s12 10.8 12 24c0 2.2-1.1 3.6-3 3.6H23c-1.9 0-3-1.4-3-3.6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.55"
      />
      {/* 一束从洞口右侧斜进来的光 */}
      <path
        d="M37 25.5 44 17l2.4 1.6-6.2 9.6Z"
        fill="currentColor"
        opacity="0.14"
      />
      <circle cx="32" cy="43" r="2.6" fill="currentColor" opacity="0.4" />
      <path
        d="M13 42.5c2.6-1.2 5-1.2 7.4 0M43.6 42.5c2.4-1.2 4.8-1.2 7.4 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.28"
      />
    </svg>
  );
}
