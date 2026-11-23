'use client';

import { useEffect } from 'react';

/**
 * 首页整屏翻页：跟手拖拽 + 过半吸附。
 *
 * 之前是「滚轮一累计 12px 就整屏 scrollTo 过去」—— 页面完全不跟手，滚轮
 * 一动，画面直接顿到下一屏，像被人拽了一把。用户要的是苹果官网那种：
 * 滚多少，页就走多少，松手时如果过了半屏，就顺着这股劲儿吸到下一页。
 *
 * 所以这里不再"翻页"，改成**驱动滚动位置**：
 *
 * 1. wheel 里只做一件事：把位移累加进 target（乘以一点增益，让滚轮一格
 *    大约走三分之一屏，两格就能过半）；
 * 2. 每帧用 rAF 让 current 追 target（指数逼近），页面于是连续地滑，
 *    不是跳；追到 0.4px 以内就贴住，免得无限拖尾；
 * 3. 停手 120ms 后吸附：以「当前所在屏」为基准，越过半屏就去下一屏，
 *    否则回本屏。吸附同样走 rAF，所以是"顺过去"，不是"弹过去"。
 *
 * 为什么不用 CSS `scroll-snap-type: y mandatory`：Chrome 对鼠标滚轮的
 * snap 是"滚一下、结束后直接跳"，全程没有跟手感；而且我们这两屏是
 * 100dvh 硬切，snap 一旦算错就卡在半屏。自己驱动位置，行为完全可控，
 * 也能保证 scrollY 始终是真实值 —— fixed 导航、IntersectionObserver、
 * 无障碍的 focus 滚动全部照常。
 */

/** 滚轮位移的增益：一格（约 100~120px）走三分之一屏左右。 */
const WHEEL_GAIN = 2.4;
/** 停手多久开始吸附。 */
const IDLE_MS = 120;
/** 越过半屏就去下一页。 */
const SNAP_RATIO = 0.5;
/** 每帧向目标靠近的比例：越大越跟手，越小越飘。 */
const FOLLOW = 0.28;
/** 差值小于这个就认为到位了，停止 rAF。 */
const EPSILON = 0.4;

export function useScreenSnap(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** 一屏的高度：用视口高度，而不是某个元素的 offsetHeight。 */
    const pageHeight = () =>
      Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight));

    const maxScroll = () =>
      Math.max(0, document.documentElement.scrollHeight - pageHeight());

    const pageCount = () =>
      Math.max(1, Math.round(document.documentElement.scrollHeight / pageHeight()));

    const clamp = (value: number) => Math.min(Math.max(value, 0), maxScroll());

    /** 目标位置与当前渲染位置。两者分开，才有"追上去"的过程。 */
    let target = window.scrollY;
    let current = window.scrollY;
    let frame = 0;
    let idleTimer = 0;

    /** 我们自己调 scrollTo 时置位，避免 scroll 监听把自己的写入当成外部滚动。 */
    let selfScroll = false;

    const follow = () => {
      if (frame) return;
      const step = () => {
        const diff = target - current;
        if (Math.abs(diff) <= EPSILON) {
          current = target;
          selfScroll = true;
          window.scrollTo({ top: current, behavior: 'instant' });
          selfScroll = false;
          frame = 0;
          return;
        }
        current += diff * FOLLOW;
        selfScroll = true;
        window.scrollTo({ top: current, behavior: 'instant' });
        selfScroll = false;
        frame = window.requestAnimationFrame(step);
      };
      frame = window.requestAnimationFrame(step);
    };

    /**
     * 吸附到整屏。
     *
     * 基准取 floor：`from` 是"现在正看着哪一屏"，`offset` 是"已经拖出去多少"。
     * 拖出超过半屏就去下一页，否则回来。用 floor + 半屏判断，而不是 round，
     * 是为了让"刚好一半"也落在下一页 —— 用户心里那是"已经滑了一半了"。
     */
    const snap = () => {
      const height = pageHeight();
      const from = Math.floor(target / height + 0.0001);
      const offset = target - from * height;
      const dest = offset > height * SNAP_RATIO ? from + 1 : from;
      const next = clamp(dest * height);
      if (Math.abs(next - current) <= EPSILON) {
        target = next;
        return;
      }
      target = next;
      follow();
    };

    const scheduleSnap = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(snap, IDLE_MS);
    };

    /** 直接把页面送到某一屏（键盘、进页面归位用）。 */
    const goToPage = (index: number) => {
      const total = pageCount();
      const safe = Math.min(Math.max(index, 0), total - 1);
      target = clamp(safe * pageHeight());
      follow();
    };

    /* ---------------- 滚轮 / 触控板 ---------------- */
    const onWheel = (event: WheelEvent) => {
      // 横向手势、或者按住 ctrl（触控板缩放）不拦
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      // 只有一屏可滚时把自己当普通页面
      if (pageCount() < 2) return;

      const atTop = target <= 1 && event.deltaY < 0;
      const atBottom = target >= maxScroll() - 1 && event.deltaY > 0;
      // 顶到底还继续滚，交给浏览器（触控板会回弹），别把事件吃掉
      if (atTop || atBottom) return;

      event.preventDefault();

      /*
       * deltaMode：0 = 像素（触控板 / 大多数浏览器），1 = 行（部分 Firefox）。
       * 行模式直接乘 16 当像素，别让它只挪几像素。
       */
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;

      if (reduce) {
        // 关掉动画时退化成"一格一屏"，但仍然不用浏览器默认滚动
        target = clamp(target + delta);
        current = target;
        window.scrollTo({ top: target, behavior: 'instant' });
        scheduleSnap();
        return;
      }

      target = clamp(target + delta * WHEEL_GAIN);
      follow();
      scheduleSnap();
    };

    /* ---------------- 触摸 ---------------- */
    /*
     * 触摸保持"抬手判断"的老逻辑，不做 1:1 跟手。
     *
     * iOS 的滚动惯性由系统接管，一旦 preventDefault 接管 touchmove，
     * 惯性没了、橡皮筋没了，手感反而更差。手机上"滑一下翻一屏"本来就
     * 是系统级的手势预期，不需要跟手；PC 的滚轮才是这回要修的地方。
     */
    let touchStartY = 0;
    let touchSum = 0;
    let touchTimer = 0;

    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
      touchSum = 0;
      window.clearTimeout(touchTimer);
    };

    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchStartY;
      touchSum = touchStartY - y;
      window.clearTimeout(touchTimer);
      touchTimer = window.setTimeout(() => {
        if (Math.abs(touchSum) < 40) return;
        const dir = touchSum > 0 ? 1 : -1;
        goToPage(Math.round(target / pageHeight()) + dir);
        touchSum = 0;
      }, 220);
    };

    /* ---------------- 键盘 ---------------- */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (el?.isContentEditable) return;

      const page = Math.round(target / pageHeight());
      if (event.key === 'PageDown') {
        event.preventDefault();
        goToPage(page + 1);
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        goToPage(page - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        goToPage(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        goToPage(pageCount() - 1);
      }
    };

    /*
     * 外部滚动（锚点跳转、浏览器恢复位置、focus 带过来的滚动）要把
     * target/current 同步过去，否则下一次吸附会把用户拽回原处。
     */
    const onScroll = () => {
      if (selfScroll) return;
      if (Math.abs(window.scrollY - current) > 2) {
        current = window.scrollY;
        target = current;
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, { passive: true });

    /*
     * 进页面时如果带着 hash、或者上一次的滚动位置落在半屏，立刻对齐到
     * 最近的一整屏 —— 否则第一眼就是"卡在中间"。
     */
    const align = () => {
      const exact = window.scrollY / pageHeight();
      if (Math.abs(exact - Math.round(exact)) > 0.04 && pageCount() > 1) {
        goToPage(Math.round(exact));
      }
    };
    const alignTimer = window.setTimeout(align, 120);
    window.addEventListener('load', align);

    return () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(touchTimer);
      window.clearTimeout(alignTimer);
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('load', align);
    };
  }, [enabled]);
}
