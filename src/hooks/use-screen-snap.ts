'use client';

import { useEffect } from 'react';

/**
 * 首页整屏吸附。
 *
 * 需求是「一滑就整屏换页，不能卡在两屏中间」。纯 CSS 的
 * `scroll-snap-type: y mandatory` 在鼠标滚轮上其实很不可靠：滚轮的每一下
 * 被浏览器拆成若干次小滚动，强制吸附会在中途反复抢夺位置，滚两下还在原地
 * 抖；触控板上又常常因为惯性滚动而直接跳过一整屏。
 *
 * 所以这里自己接管：
 *
 * 1. 用户滚完一轮（wheel 停下 140ms / 手指离开 220ms），按总位移判断方向；
 * 2. 位移超过阈值（滚轮 12px、触摸 40px）才翻页，避免手抖也跳一屏；
 * 3. 翻到相邻那一屏，用 `scrollTo({ behavior: 'smooth' })` 走完，
 *    滚动期间（650ms）忽略新的翻页请求，防止连点飞出三屏；
 * 4. 键盘 PageUp / PageDown / Home / End / 空格也走同一套。
 *
 * 只在「首页且窗口够高」时启用：矮屏（手机横屏、分屏）里一屏装不下内容，
 * 强吸会把用户锁死在第一屏看不到转盘。`enabled` 由调用方按断点决定。
 */
const WHEEL_IDLE_MS = 140;
const TOUCH_IDLE_MS = 220;
/** 滚轮累计到这么多像素才算「想翻页」。 */
const WHEEL_THRESHOLD = 12;
/** 手指滑动超过这么多像素才算翻页。 */
const TOUCH_THRESHOLD = 40;
/** 一次翻页动画期间不接受新的请求。 */
const LOCK_MS = 650;

export function useScreenSnap(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    // 用户要求减少动态时别用平滑滚动，直接跳过去
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';

    /** 一屏的高度：用视口高度，而不是某个元素的 offsetHeight。 */
    const pageHeight = () =>
      Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight));

    const pageCount = () => Math.max(1, Math.round(document.documentElement.scrollHeight / pageHeight()));

    let animatingUntil = 0;

    const goToPage = (index: number) => {
      const total = pageCount();
      const target = Math.min(Math.max(index, 0), total - 1);
      const top = target * pageHeight();
      if (Math.abs(window.scrollY - top) < 2) return;
      animatingUntil = performance.now() + LOCK_MS;
      window.scrollTo({ top, behavior });
    };

    const currentPage = () => window.scrollY / pageHeight();

    /** 按方向翻一屏。`dir` 为 1 向下、-1 向上。 */
    const step = (dir: number) => {
      if (performance.now() < animatingUntil) return;
      // 已经偏离整屏（比如用锚点跳过来的），先回到最近的那一屏
      const exact = currentPage();
      const nearest = Math.round(exact);
      if (Math.abs(exact - nearest) > 0.02) {
        goToPage(nearest);
        return;
      }
      goToPage(nearest + dir);
    };

    /* ---------------- 滚轮 ---------------- */
    let wheelSum = 0;
    let wheelTimer = 0;
    let lastWheelDir = 0;

    const onWheel = (event: WheelEvent) => {
      // 横向手势、或者按住 ctrl（触控板缩放）不拦
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      /*
       * 只有一屏可滚时把自己当普通页面，别把事件吃掉。
       * 交还给浏览器默认行为：我们不做 preventDefault，只在下一次翻页前判断。
       */
      if (pageCount() < 2) return;

      if (performance.now() < animatingUntil) {
        event.preventDefault();
        return;
      }

      /*
       * 已经贴在页首/页尾还继续往外滚，交给浏览器（会触发回弹），
       * 不拦，否则页尾一点反应都没有，像卡死了。
       */
      const atTop = window.scrollY <= 1;
      const atBottom = window.scrollY + pageHeight() >= document.documentElement.scrollHeight - 2;
      if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0)) return;

      // 拦住浏览器自己的滚动，位置完全由我们决定
      event.preventDefault();

      if (Math.sign(event.deltaY) !== lastWheelDir) wheelSum = 0;
      lastWheelDir = Math.sign(event.deltaY);
      wheelSum += event.deltaY;

      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        const sum = wheelSum;
        wheelSum = 0;
        if (Math.abs(sum) < WHEEL_THRESHOLD) return;
        step(sum > 0 ? 1 : -1);
      }, WHEEL_IDLE_MS);
    };

    /* ---------------- 触摸 ---------------- */
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
      // 手指停下来才判断，跟着惯性一路滑过去不算翻页手势
      touchTimer = window.setTimeout(() => {
        if (Math.abs(touchSum) < TOUCH_THRESHOLD) return;
        step(touchSum > 0 ? 1 : -1);
        touchSum = 0;
      }, TOUCH_IDLE_MS);
    };

    /* ---------------- 键盘 ---------------- */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((event.target as HTMLElement | null)?.isContentEditable) return;

      if (event.key === 'PageDown') {
        event.preventDefault();
        step(1);
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        step(-1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        goToPage(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        goToPage(pageCount() - 1);
      }
    };

    /*
     * passive: false —— 滚轮与触摸都要能 preventDefault 才拦得住浏览器自己的滚动。
     * 触摸用 touchstart/touchmove 而不是 pointer 系列，是为了和 iOS 的滚动惯性对齐。
     */
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    /*
     * 进页面时如果带着 hash 或者上一次的滚动位置落在了半屏，
     * 立刻对齐到最近的一整屏 —— 否则第一眼就是「卡在中间」。
     */
    const onLoadAlign = () => {
      const exact = window.scrollY / pageHeight();
      if (Math.abs(exact - Math.round(exact)) > 0.05 && exact > 0.2) goToPage(Math.round(exact));
    };
    window.addEventListener('load', onLoadAlign);

    return () => {
      window.clearTimeout(wheelTimer);
      window.clearTimeout(touchTimer);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('load', onLoadAlign);
    };
  }, [enabled]);
}
