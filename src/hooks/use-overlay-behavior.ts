'use client';

import { useEffect, useRef } from 'react';

/**
 * 全屏浮层共用的行为：
 * - 锁定页面滚动（iOS Safari 能生效的那一套）；
 * - Esc 关闭、Tab 焦点留在浮层内；
 * - 关闭后把焦点还给原来的触发元素。
 *
 * Dialog 与 GlassSheet 都复用它，避免两处各写一遍导致行为不一致。
 */

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * 解锁用的两个临时标记（样式见 globals.css 同名规则）：
 *
 * - `mb-scroll-reset`：把 `scroll-behavior` 收成 auto。全站 `html` 上是 smooth，
 *   不收的话 `scrollTo` 会变成一段动画 —— 页面从 0 慢慢"滑"回原位。
 * - `mb-snap-hold`：按住吸附。`scroll-snap-type: y mandatory` 一旦先恢复，
 *   Safari 会先拿当时还在 0 的位置吸一次，再被 scrollTo 拉走，表现就是
 *   "关掉面板的瞬间整页抖一下"。
 */
const SCROLL_RESET_CLASS = 'mb-scroll-reset';
const SNAP_HOLD_CLASS = 'mb-snap-hold';

/**
 * 解锁轮次。
 *
 * 放开吸附要做在两帧之后（见下面的 cleanup），而这两帧里用户完全可能又把
 * 浮层打开。每次「打开 / 关闭」都把这个数 +1，回调里对不上号就什么都不做，
 * 免得上一轮的延迟清理把新一轮刚挂上的标记删掉。
 */
let unlockEpoch = 0;

/**
 * 打开浮层时焦点该落在哪。
 *
 * **绝不能落在"第一个可聚焦元素"上** —— 卡片和弹窗的第一个 button 永远是右上角
 * 那个关闭按钮，焦点一到那儿，用户就会开始不自觉地按空格把它关掉。
 *
 * 顺序：显式标了 data-autofocus 的 > 第一个可见的文本输入框 > 浮层本身（tabIndex=-1）。
 * 确认类弹窗没有输入框，于是焦点停在容器上，不会误触「删除」。
 *
 * 另有一类输入框要主动跳过：标了 `data-no-autofocus` 的。典型是情绪面板里
 * 那个「写一封心事」—— 面板只是给人看一段话，手机上一聚焦就弹键盘、
 * 输入框亮起一圈焦点边框，和卡片的边框叠成"双重边框"。
 */
const TEXT_ENTRY = [
  'input:not([type])',
  'input[type="text"]',
  'input[type="search"]',
  'input[type="email"]',
  'input[type="password"]',
  'input[type="url"]',
  'input[type="tel"]',
  'input[type="number"]',
  'textarea',
].join(', ');

function pickInitialFocus(container: HTMLElement): HTMLElement {
  const explicit = container.querySelector<HTMLElement>('[data-autofocus]');
  if (explicit && explicit.offsetParent !== null) return explicit;

  // 只认"能打字的"控件：文件选择框、勾选框、按钮都不该抢焦点
  const fields = Array.from(container.querySelectorAll<HTMLElement>(TEXT_ENTRY)).filter(
    (node) => node.offsetParent !== null && !node.hasAttribute('data-no-autofocus'),
  );

  const firstField = fields[0];
  if (firstField) return firstField;

  return container;
}

/**
 * 当前打开的浮层栈（只存 id，最后一项就是最上面那层）。
 *
 * 没有它的话，开心罐 / 心事信箱这种「卡片里再开一个弹窗」的结构会有两个
 * keydown 监听同时在跑：按一次 Esc 两层一起关，Tab 也会被两层各自纠正一次。
 */
const overlayStack: symbol[] = [];

export function useOverlayBehavior<T extends HTMLElement = HTMLDivElement>({
  open,
  onClose,
  returnFocusTo = null,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * 关闭后焦点回到谁。
   *
   * 不传就退回 `document.activeElement` —— 桌面端够用。但 iOS Safari 点按
   * `<button>` **不会**让它获得焦点，那时 activeElement 还是 body，焦点就
   * 丢了。所以卡片这类"由按钮打开"的浮层要把元素显式传进来。
   */
  returnFocusTo?: HTMLElement | null;
}) {
  const containerRef = useRef<T | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  /**
   * 只同步回调，不让它进依赖数组。
   *
   * ⚠️ 这里以前把 `onClose` 直接写进了 effect 依赖，而调用方几乎都是
   * `onClose={() => setX(false)}` 这种内联箭头函数 —— 每次渲染都是新引用。
   * 结果：在输入框敲一个字母 → 状态更新 → 重渲染 → effect 重跑 →
   * 清理阶段先把焦点还给触发元素，80ms 后新 effect 又把焦点抢到容器里
   * 第一个可聚焦元素（也就是右上角的 ×）。表现就是"每打一个字就跳到叉"；
   * 中文输入法在组词阶段也会重渲染，等于完全没法输入。
   *
   * 换成 ref 之后，effect 只在 open 真正变化时跑一次。
   */
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const id = Symbol('overlay');
    overlayStack.push(id);

    /*
     * 新的打开动作：作废上一轮还没执行的"放开吸附"，
     * 并立刻把上一轮可能残留的临时标记摘掉 —— 否则会 hold 到这一轮关闭。
     */
    unlockEpoch += 1;
    const root = document.documentElement;
    root.classList.remove(SNAP_HOLD_CLASS, SCROLL_RESET_CLASS);

    restoreFocusRef.current =
      returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    /*
     * 锁背景滚动。
     *
     * 只写 `body { overflow: hidden }` 在 iOS Safari 上是**无效**的：滚动条
     * 挂在 html 上，页面照样滚，工具栏跟着收放，固定定位的面板就会被"顶"得
     * 忽上忽下；关掉之后落点也变了。所以这里用业界通用的那套：
     * 记下 scrollY → body 变 fixed 顶到 -scrollY → 关闭时还原并滚回原位。
     *
     * 顺序很重要：先打标记（让翻页器立刻停手），再改布局。
     */
    const unmarkPaused = markOverlayOpen();

    const scrollY = window.scrollY;
    const body = document.body;
    const original = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    // 补偿滚动条宽度，避免打开浮层时页面横向跳动
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';

    const focusTimer = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      // 用户已经自己点进某个输入框了，就不要抢
      if (container.contains(document.activeElement)) return;
      pickInitialFocus(container).focus({ preventScroll: true });
    }, 80);

    const onKeyDown = (event: KeyboardEvent) => {
      // 只让最上面那一层响应
      if (overlayStack[overlayStack.length - 1] !== id) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;
      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null,
      );
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);

      /*
       * 解锁。顺序是踩过坑之后定下来的，别随手调：
       *
       * 1. 先按住吸附 + 切成瞬时滚动（此时 `mb-overlay-open` 还在，两者效果重叠，
       *    但这个先后关系是必须的）；
       * 2. 再把 body 从 fixed 放回文档流 —— 视觉位置暂时没变，因为刚才 body
       *    是靠 `top: -scrollY` 顶上去的；
       * 3. 同一帧里 scrollTo 回原位。收掉 `mb-overlay-open` 之后文档才重新
       *    有高度，这一步必须紧跟着做，中间不能留一帧 —— 留了就会看到页面
       *    先闪回第一屏、再跳回原处，也就是"关掉面板整页抖一下"；
       * 4. 两帧之后才放开吸附与 smooth：那时位置已经落在吸附点上，
       *    snap 恢复不会再把页面吸走一次。
       */
      root.classList.add(SNAP_HOLD_CLASS, SCROLL_RESET_CLASS);

      body.style.overflow = original.overflow;
      body.style.paddingRight = original.paddingRight;
      body.style.position = original.position;
      body.style.top = original.top;
      body.style.left = original.left;
      body.style.right = original.right;
      body.style.width = original.width;

      unmarkPaused();

      window.scrollTo(0, scrollY);
      // 读一次布局，确认这次滚动已经落地，而不是排在下一帧
      void root.offsetHeight;

      const epoch = ++unlockEpoch;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (epoch !== unlockEpoch) return;
          /*
           * 兜底：有的浏览器（Safari 尤其）会在解锁这一帧先按"body 刚回到文档流"
           * 的样子布一次版，把我们刚写的滚动位置抹回 0。这里趁平滑与吸附还按着，
           * 瞬时拉回一次，再放开 —— 用户看到的仍然只有一帧。
           */
          if (Math.abs(window.scrollY - scrollY) > 1) {
            window.scrollTo(0, scrollY);
            void root.offsetHeight;
          }
          root.classList.remove(SNAP_HOLD_CLASS, SCROLL_RESET_CLASS);
        });
      });

      const index = overlayStack.lastIndexOf(id);
      if (index !== -1) overlayStack.splice(index, 1);

      restoreFocusRef.current?.focus?.({ preventScroll: true });
    };
    // 故意只跟 open：returnFocusTo 是调用方渲染时读 ref 得到的，值在"打开那一刻"
    // 就已经定下来，把它写进依赖只会在无关重渲染时重跑一次锁/解锁，反而抖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { containerRef };
}

/**
 * 有弹层在场时给根节点打一个标记，让背后的漂浮球暂停动画。
 *
 * 只处理「当前有没有弹层」这件事：多个弹层叠在一起（卡片里再开表单、确认框）时，
 * 关掉上面那层不应当把球重新放出来，所以用一个计数器而不是单一布尔。
 */
const MOTION_PAUSE_CLASS = 'mb-motion-paused';
/** 浮层开着：翻页器据此停手（比去读 body 的内联样式稳） */
const OVERLAY_OPEN_CLASS = 'mb-overlay-open';
let overlayDepth = 0;

export function markOverlayOpen(): () => void {
  overlayDepth += 1;
  document.documentElement.classList.add(MOTION_PAUSE_CLASS, OVERLAY_OPEN_CLASS);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    overlayDepth = Math.max(0, overlayDepth - 1);
    if (overlayDepth === 0) {
      document.documentElement.classList.remove(MOTION_PAUSE_CLASS, OVERLAY_OPEN_CLASS);
    }
  };
}
