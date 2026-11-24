'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getPagerMode } from '@/hooks/use-screen-pager';
import { SCREEN_REVEAL_EVENT } from '@/lib/screen-reveal';
import { cn } from '@/lib/utils';

interface ScrollScreenProps {
  id: string;
  /** 圆点导航与读屏用的名字 */
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * 一整屏。
 *
 * 三件事：
 * 1. 高度钉在 100dvh（`dvh` 会跟着手机地址栏收放，`vh` 不会）；
 * 2. 作为吸附点交给 CSS（见 globals.css 的 .mb-screen）；
 * 3. 进场时给内部带 .mb-reveal 的元素放行动画 —— 用 IntersectionObserver
 *    而不是 scroll 事件，滚动期间不跑任何 JS。
 *
 * 只播放一次：来回翻页时每屏都重演一遍淡入，会让人觉得页面在"闪"。
 *
 * 桌面端（JS 翻页）多一条通道：翻页器在动画走到 60% 时广播，这里收到就放行。
 * 观察器仍然保留，但阈值提到 0.92 —— 只在"几乎整屏都在视野里"时兜底触发，
 * 覆盖直接改 scrollTop、锚点跳转这类不经过翻页器的路径。
 */
export function ScrollScreen({ id, label, className, children }: ScrollScreenProps) {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 关掉动画偏好时直接给终态，不注册观察器
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }

    const pager = getPagerMode() === 'js';
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      pager
        ? { threshold: 0.92 }
        : // 见到四分之一屏就开始，别等整屏停稳 —— 动画要和翻页同时发生
          { threshold: 0.24, rootMargin: '0px 0px -6% 0px' },
    );
    observer.observe(el);

    const onReveal = (event: Event) => {
      if ((event as CustomEvent<string>).detail === id) {
        setRevealed(true);
        observer.disconnect();
      }
    };
    window.addEventListener(SCREEN_REVEAL_EVENT, onReveal);

    return () => {
      observer.disconnect();
      window.removeEventListener(SCREEN_REVEAL_EVENT, onReveal);
    };
  }, [id]);

  return (
    <section
      id={id}
      ref={ref}
      aria-label={label}
      data-screen={id}
      data-revealed={revealed ? 'true' : 'false'}
      className={cn('mb-screen', className)}
    >
      {children}
    </section>
  );
}
