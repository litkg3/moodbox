'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { revealScreen } from '@/lib/screen-reveal';

/* ============================================================
   翻页配置：只有这一处，改这里就够了
   ------------------------------------------------------------
   PAGE_DURATION  一屏滚多久（ms）。800 像"啪"地一下，1200 偏慢；
                  1000 与苹果官网产品页接近：慢起、中间快、缓缓停。
   THRESHOLD      滚轮/触控板累计多少像素才算一次翻页意图。
                  调小 → 轻轻一拨就翻（灵敏但容易误触）；
                  调大 → 要滚得更多才动（更保守）。
   IDLE_RESET     停手多久清零累计值（ms）。连点滚轮时每次都从 0 开始累，
                  所以 120 意味着"连续两下滚轮算两次"。
   COOLDOWN       动画结束后再吞多久的输入（ms）。触控板惯性尾巴一般 100~200ms。
   EASING         缓动曲线：easeInOutCubic / easeInOutQuart 可切换。
   REVEAL_AT      滚动走到多少比例时放行新一屏的进场动画（0~1）。
                  注意是按**位移**算：缓动下 60% 的位移落在约 49% 的时长上，
                  所以新一屏会在还剩小半段路时开始淡入，落位时刚好停稳。
   MIN_WIDTH      桌面端判定宽度：≥ 它由 JS 接管，小于它保留原生吸附。
   MIN_HEIGHT     太矮（横屏手机）连原生吸附也不开，当普通长页面滚。
   ============================================================ */
export type EasingName = 'easeInOutCubic' | 'easeInOutQuart';

export const PAGE_SCROLL = {
  PAGE_DURATION: 1000,
  THRESHOLD: 40,
  IDLE_RESET: 120,
  COOLDOWN: 150,
  EASING: 'easeInOutCubic' as EasingName,
  REVEAL_AT: 0.6,
  MIN_WIDTH: 769,
  MIN_HEIGHT: 560,
} as const;

const EASINGS: Record<EasingName, (t: number) => number> = {
  // 两端导数都为 0：起步不"顿"，收尾不"撞墙"
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
};

/**
 * 当前的翻页方式。
 *
 * - `js`    : 桌面端。关掉 CSS 吸附，滚轮/键盘由 JS 驱动，带 1s 缓动。
 * - `snap`  : 手机与竖屏平板。保留原生 scroll-snap，一滑一屏由浏览器保证。
 * - `plain` : 矮屏（横屏手机、分屏）。既不吸也不接管，当普通长页面。
 */
export type PagerMode = 'js' | 'snap' | 'plain';

export function getPagerMode(): PagerMode {
  if (typeof window === 'undefined') return 'snap';
  const { innerWidth, innerHeight } = window;
  if (innerHeight < PAGE_SCROLL.MIN_HEIGHT) return 'plain';
  return innerWidth >= PAGE_SCROLL.MIN_WIDTH ? 'js' : 'snap';
}

const ease = EASINGS[PAGE_SCROLL.EASING];

/**
 * 弹层 / 灯箱开着时暂停翻页：它们自己要占着滚轮和方向键。
 *
 * `mb-overlay-open` 由 useOverlayBehavior 在锁滚动的同时打上，比读 body 的
 * 内联样式可靠 —— 锁滚动用的是 `position: fixed`，overflow 只是顺带写的。
 */
export function isPagerPaused() {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.classList.contains('mb-overlay-open') ||
    document.body.style.overflow === 'hidden' ||
    document.documentElement.classList.contains('mb-motion-paused') ||
    document.querySelector('.mb-lightbox') !== null
  );
}

const isPaused = isPagerPaused;

const TYPING = 'input, textarea, select, [contenteditable="true"]';

/**
 * 从事件目标向上找"还没滚到边界"的可滚区域。
 *
 * 找到就说明这一下该由内层消化（详情面板里的长文案、灯箱），页面不翻。
 * 只在方向上还有余量时才算 —— 内层滚到底之后，继续滚应当交给页面翻页。
 */
function innerScroller(target: EventTarget | null, deltaY: number): HTMLElement | null {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight - node.clientHeight > 2
    ) {
      const atTop = node.scrollTop <= 0;
      const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
      if (deltaY > 0 ? !atBottom : !atTop) return node as HTMLElement;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * 首页整屏翻页。
 *
 * 桌面端：滚轮 / 触控板 / 键盘 → 同一套缓动，一次只翻一屏。
 * 手机端：什么都不做，交给原生 scroll-snap（只负责回报当前是第几屏）。
 */
export function useScreenPager(ids: readonly string[]) {
  const [mode, setMode] = useState<PagerMode>('snap');
  const [active, setActive] = useState(0);

  const idsRef = useRef(ids);
  idsRef.current = ids;

  const activeRef = useRef(0);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const accRef = useRef(0);
  const lastWheelRef = useRef(0);
  const cooldownRef = useRef(0);
  const pointerDownRef = useRef(false);

  /* ---------------- 位置 ---------------- */

  const offsetOf = useCallback((index: number) => {
    const el = document.getElementById(idsRef.current[index] ?? '');
    return el ? el.getBoundingClientRect().top + window.scrollY : 0;
  }, []);

  const commit = useCallback((index: number) => {
    if (activeRef.current === index) return;
    activeRef.current = index;
    setActive(index);
  }, []);

  /* ---------------- 翻到某一屏 ---------------- */

  const goToSection = useCallback(
    (index: number) => {
      const list = idsRef.current;
      const target = Math.min(Math.max(index, 0), list.length - 1);
      const id = list[target];
      if (!id) return;

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // 手机端：原生吸附，位置由 CSS 决定，这里只负责"滚过去"
      if (getPagerMode() !== 'js') {
        document.getElementById(id)?.scrollIntoView({
          behavior: reduce ? 'auto' : 'smooth',
          block: 'start',
        });
        commit(target);
        return;
      }

      window.cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      document
        .querySelectorAll('[data-leaving]')
        .forEach((node) => node.removeAttribute('data-leaving'));

      const from = window.scrollY;
      const to = offsetOf(target);
      const leaving = document.getElementById(list[activeRef.current] ?? '');

      // 圆点立刻高亮：先给反馈，再慢慢滚过去
      commit(target);

      const duration = reduce ? 0 : PAGE_SCROLL.PAGE_DURATION;
      if (duration === 0 || Math.abs(to - from) < 1) {
        window.scrollTo(0, to);
        revealScreen(id);
        cooldownRef.current = performance.now() + PAGE_SCROLL.COOLDOWN;
        return;
      }

      leaving?.setAttribute('data-leaving', 'true');
      runningRef.current = true;
      const startedAt = performance.now();
      let revealed = false;

      const frame = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = ease(progress);
        window.scrollTo(0, from + (to - from) * eased);

        // 进场动画与翻页咬合：滚动走过 60% 的位移时，新一屏才开始淡入上移
        if (!revealed && eased >= PAGE_SCROLL.REVEAL_AT) {
          revealed = true;
          revealScreen(id);
        }

        if (progress < 1) {
          rafRef.current = window.requestAnimationFrame(frame);
          return;
        }

        // 收尾对齐到整数像素，避免停在 1799.4 这种位置
        window.scrollTo(0, to);
        runningRef.current = false;
        leaving?.removeAttribute('data-leaving');
        cooldownRef.current = performance.now() + PAGE_SCROLL.COOLDOWN;
      };

      rafRef.current = window.requestAnimationFrame(frame);
    },
    [commit, offsetOf],
  );

  /* ---------------- 模式 ---------------- */

  useEffect(() => {
    const sync = () => setMode(getPagerMode());
    sync();
    window.addEventListener('resize', sync, { passive: true });
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  /* ---------------- 当前屏（手机端用；桌面端由翻页器维护） ---------------- */

  useEffect(() => {
    if (mode === 'js') return;
    const compute = () => {
      // 浮层开着时 body 是 fixed，每屏的位置全变成 0，算出来的"当前屏"是假的
      if (isPaused()) return;
      const vh = window.innerHeight;
      let best = 0;
      let bestScore = 0.35;
      idsRef.current.forEach((id, index) => {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
        const score = visible / Math.max(1, Math.min(rect.height, vh));
        if (score > bestScore) {
          bestScore = score;
          best = index;
        }
      });
      commit(best);
    };

    compute();
    const observer = new IntersectionObserver(compute, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    idsRef.current.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [mode, commit]);

  /* ---------------- 桌面端：接管滚轮与键盘 ---------------- */

  useEffect(() => {
    if (mode !== 'js') return;

    const step = (direction: number) => {
      const next = Math.min(
        Math.max(activeRef.current + direction, 0),
        idsRef.current.length - 1,
      );
      if (next !== activeRef.current) goToSection(next);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return; // 触控板捏合缩放，不归我们管
      if (isPaused()) return;
      if (pointerDownRef.current) return; // 正在拖转盘/划卡片
      if (innerScroller(event.target, event.deltaY)) return;

      // 从这里开始，页面自己不再跟着滚
      event.preventDefault();

      if (runningRef.current) return; // 动画进行中，所有输入都丢掉

      const now = performance.now();
      if (now < cooldownRef.current) return; // 惯性尾巴

      if (now - lastWheelRef.current > PAGE_SCROLL.IDLE_RESET) accRef.current = 0;
      lastWheelRef.current = now;

      // 行模式（Firefox）要换算成像素，否则一格只有 3px
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      const delta = event.deltaY * unit;
      if (delta === 0) return;

      // 反向的第一次事件通常是惯性回弹，不计入累计
      if (accRef.current !== 0 && Math.sign(delta) !== Math.sign(accRef.current)) accRef.current = 0;
      accRef.current += delta;

      if (Math.abs(accRef.current) < PAGE_SCROLL.THRESHOLD) return;
      const direction = accRef.current > 0 ? 1 : -1;
      accRef.current = 0;
      step(direction);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isPaused()) return;
      const target = event.target;
      if (target instanceof Element && target.closest(TYPING)) return;
      if (runningRef.current) {
        // 动画中按方向键：吞掉，别让它变成页面自带的滚动
        if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
        }
        return;
      }

      let direction = 0;
      let absolute: number | null = null;
      switch (event.key) {
        case 'ArrowDown':
        case 'PageDown':
          direction = 1;
          break;
        case 'ArrowUp':
        case 'PageUp':
          direction = -1;
          break;
        case ' ':
          // 空格落在按钮/链接上时应该"按下它"，不是翻页
          if (target instanceof Element && target.closest('button, a, [role="button"], [role="tab"]')) {
            return;
          }
          direction = event.shiftKey ? -1 : 1;
          break;
        case 'Home':
          absolute = 0;
          break;
        case 'End':
          absolute = idsRef.current.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      if (absolute !== null) goToSection(absolute);
      else step(direction);
    };

    // 拖拽中不翻页：转盘是 pointer 拖的，滚轮事件在这期间一律让路
    const onPointerDown = () => {
      pointerDownRef.current = true;
    };
    const onPointerUp = () => {
      pointerDownRef.current = false;
    };

    /*
     * 外部滚动（拖滚动条、浏览器恢复上次位置、锚点）时，把"当前是第几屏"
     * 重新对一遍 —— 否则 activeRef 会停在旧值，下一次滚轮会从错的那一屏算起。
     */
    const nearestIndex = () => {
      const y = window.scrollY;
      let best = 0;
      let bestDistance = Infinity;
      idsRef.current.forEach((id, index) => {
        const distance = Math.abs(offsetOf(index) - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      return best;
    };

    const onScroll = () => {
      if (isPaused()) return;
      if (runningRef.current || performance.now() < cooldownRef.current) return;
      const index = nearestIndex();
      if (index !== activeRef.current) commit(index);
    };

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        // 屏幕变了，位置全变：停掉动画、对齐到当前屏
        window.cancelAnimationFrame(rafRef.current);
        runningRef.current = false;
        window.scrollTo(0, offsetOf(activeRef.current));
      }, 140);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
    window.addEventListener('resize', onResize, { passive: true });

    // 进来先对齐一次：刷新时浏览器可能恢复了半屏位置
    const align = window.setTimeout(() => {
      window.scrollTo(0, offsetOf(activeRef.current));
    }, 0);

    return () => {
      window.clearTimeout(resizeTimer);
      window.clearTimeout(align);
      window.cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      window.removeEventListener('resize', onResize);
      document
        .querySelectorAll('[data-leaving]')
        .forEach((node) => node.removeAttribute('data-leaving'));
    };
  }, [mode, goToSection, offsetOf]);

  return { mode, active, goToSection };
}
