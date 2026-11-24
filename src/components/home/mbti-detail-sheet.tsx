'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useOverlayBehavior } from '@/hooks/use-overlay-behavior';
import { mbtiToken, type MbtiType } from '@/data/mbti';
import { cn } from '@/lib/utils';

/** 往下拖多少像素就松手关闭 */
const DISMISS_AT = 88;
/** 与 CSS 里的入场/退场时长保持一致 */
const SLIDE_MS = 280;
/** 刚打开这一小段时间内忽略遮罩点击：双击卡片时第一下已经打开，第二下不该立刻关掉 */
const OPEN_GUARD_MS = 420;

type Phase = 'closed' | 'opening' | 'open' | 'closing';

interface MbtiDetailSheetProps {
  type: MbtiType | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  /** 关闭后焦点回到哪张卡片（iOS 上点按不会聚焦 button，只能由调用方显式给） */
  returnFocusTo?: HTMLElement | null;
}

/**
 * 人格详情面板。
 *
 * 手机：从底部升起的 bottom sheet（最高 70dvh）。
 * 桌面：同一个面板居中。
 *
 * 三条硬约束，都是为了 iOS Safari（底部有工具栏）不出现"面板浮起来"：
 *
 * 1. **挂到 body，且祖先链上没有任何 transform / filter / backdrop-filter**。
 *    这类属性会把 `position: fixed` 的包含块从视口改成那个祖先，面板就会
 *    跟着页面滚动漂移。所以这里不套 motion 的动画包裹层，入场动画直接写在
 *    面板自己的 transform 上。
 * 2. **`inset: auto 0 0 0` + 70dvh + safe-area**：面板贴着视口底边，
 *    高度跟着 dvh 走（会随工具栏收放变化，不会顶到工具栏后面）。
 * 3. **只动画 transform 与 opacity**：不碰 height / top / bottom，
 *    避免每帧触发布局，也就不会在工具栏收放时抖。
 */
export function MbtiDetailSheet({
  type,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  returnFocusTo = null,
}: MbtiDetailSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>('closed');
  /** 关闭动画期间还要继续渲染旧内容，所以单独留一份 */
  const [shown, setShown] = useState<MbtiType | null>(null);

  const openedAt = useRef(0);

  const [dragY, setDragY] = useState(0);
  /** 只管样式（拖动时关掉过渡）；判定一律读 draggingRef，见下面的说明 */
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const dragRef = useRef(0);
  const startY = useRef(0);

  const { containerRef } = useOverlayBehavior<HTMLDivElement>({
    // 退场动画期间仍然锁着背景，否则面板还在往下滑，后面的页面已经跳了一下
    open: phase !== 'closed',
    onClose,
    returnFocusTo,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  /* ---------------- 开关时序 ---------------- */

  useEffect(() => {
    if (type) {
      setShown(type);
      setPhase((current) => (current === 'closed' || current === 'closing' ? 'opening' : 'open'));
      return;
    }
    setPhase((current) => (current === 'closed' ? 'closed' : 'closing'));
  }, [type]);

  useEffect(() => {
    if (phase !== 'opening') return;
    // 先以"滑出屏幕"的状态挂到 DOM 上，下一帧再切到 open，过渡才会真的跑
    openedAt.current = performance.now();
    const raf = requestAnimationFrame(() => setPhase('open'));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'closing') return;
    const timer = window.setTimeout(() => {
      setPhase('closed');
      setShown(null);
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  /* ---------------- 换一个类型时把手势状态清干净 ---------------- */

  useEffect(() => {
    dragRef.current = 0;
    draggingRef.current = false;
    setDragY(0);
    setDragging(false);
  }, [shown?.code]);

  /*
   * iOS 的工具栏会吃掉底部一截：`bottom: 0` 是**布局视口**的底边，
   * 而布局视口不随工具栏伸缩。可视视口比它矮多少，就把面板抬多少，
   * 这样面板始终贴在"看得见"的底边上，不再被工具栏压住、也不会因为
   * 工具栏收起而突然往下跳一截。
   */
  useEffect(() => {
    if (phase === 'closed') return;
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const gap = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
      containerRef.current?.style.setProperty('--mb-sheet-bottom', `${gap}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, [phase, containerRef]);

  /* ---------------- 手势 ---------------- */

  /*
   * 拖动状态用 ref 判定，不用 state。
   *
   * 一次快扫（pointerdown → 若干 pointermove → pointerup）可能整个发生在同一帧里，
   * React 还没来得及把 `setDragging(true)` 渲染出来，pointerup 的闭包里读到的
   * 还是 false —— 手一快就"拖了没反应"。state 只用来切样式。
   */
  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    startY.current = event.clientY;
    dragRef.current = 0;
    draggingRef.current = true;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    // 只允许往下拖：往上拉没有对应动作，手一碰就会"抖一下"
    const next = Math.max(0, event.clientY - startY.current);
    dragRef.current = next;
    setDragY(next);
  }, []);

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const distance = dragRef.current;
    dragRef.current = 0;
    setDragging(false);

    if (distance <= DISMISS_AT) {
      setDragY(0);
      return;
    }

    // 越过阈值：顺着已经拖出来的距离继续滑到屏幕外，再走正常的关闭流程
    setDragY(containerRef.current?.offsetHeight ?? 640);
    onClose();
  }, [onClose, containerRef]);

  const onScrimClick = useCallback(() => {
    // 打开后的一瞬间挡掉"双击的第二下"，否则刚开就被关上
    if (performance.now() - openedAt.current < OPEN_GUARD_MS) return;
    onClose();
  }, [onClose]);

  if (!mounted || !shown) return null;

  const state = phase === 'open' ? 'open' : 'closed';
  const style =
    dragY === 0
      ? undefined
      : ({
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : undefined,
        } as CSSProperties);

  return createPortal(
    <>
      <div
        className="mb-sheet-scrim"
        data-state={state}
        onClick={onScrimClick}
        aria-hidden="true"
      />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${shown.code} ${shown.name}`}
        tabIndex={-1}
        data-state={state}
        className={cn('mb-sheet', mbtiToken(shown))}
        style={style}
      >
        {/* 握把：手机上唯一的拖拽区，正文区域不接管手势，滚动照旧 */}
        <div
          className="mb-sheet-grip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden="true"
        >
          <span />
        </div>

        <button type="button" onClick={onClose} aria-label="关闭" className="mb-sheet-close">
          <X size={17} strokeWidth={1.6} />
        </button>

        <div className="mb-sheet-body">
          <div className="mb-sheet-head">
            <img
              className="mb-sheet-art"
              src={shown.image}
              width={480}
              height={480}
              alt={`${shown.code} ${shown.name} 人物插画`}
            />
            <div className="mb-sheet-id">
              <p className="mb-sheet-code">{shown.code}</p>
              <p className="mb-sheet-name">{shown.name}</p>
              <p className="mb-sheet-tagline">{shown.tagline}</p>
            </div>
          </div>

          <ul className="mb-sheet-tags">
            {shown.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>

          <p className="mb-sheet-desc">{shown.desc}</p>
        </div>

        <div className="mb-sheet-foot">
          <button type="button" onClick={onPrev} disabled={!hasPrev} className="mb-sheet-step">
            <ArrowLeft size={15} strokeWidth={1.6} aria-hidden="true" />
            上一型
          </button>
          <button type="button" onClick={onNext} disabled={!hasNext} className="mb-sheet-step">
            下一型
            <ArrowRight size={15} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>

        <p className="mb-sheet-note">MBTI 仅供自我探索参考，不具备心理评估或诊断功能。</p>
      </div>
    </>,
    document.body,
  );
}
