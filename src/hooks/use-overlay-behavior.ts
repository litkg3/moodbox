'use client';

import { useEffect, useRef } from 'react';

/**
 * 全屏浮层共用的行为：
 * - 锁定页面滚动；
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
 * 打开浮层时焦点该落在哪。
 *
 * **绝不能落在"第一个可聚焦元素"上** —— 卡片和弹窗的第一个 button 永远是右上角
 * 那个关闭按钮，焦点一到那儿，用户就会开始不自觉地按空格把它关掉。
 *
 * 顺序：显式标了 data-autofocus 的 > 第一个可见的文本输入框 > 浮层本身（tabIndex=-1）。
 * 确认类弹窗没有输入框，于是焦点停在容器上，不会误触「删除」。
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
    (node) => node.offsetParent !== null,
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
}: {
  open: boolean;
  onClose: () => void;
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

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    // 补偿滚动条宽度，避免打开浮层时页面横向跳动
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

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
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;

      const index = overlayStack.lastIndexOf(id);
      if (index !== -1) overlayStack.splice(index, 1);

      restoreFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return { containerRef };
}
