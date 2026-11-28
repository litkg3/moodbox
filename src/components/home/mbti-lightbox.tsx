'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useOverlayBehavior } from '@/hooks/use-overlay-behavior';
import { MBTI_SHEET } from '@/data/mbti';

const MIN_SCALE = 1;
const MAX_SCALE = 4;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * 整图灯箱。
 *
 * 手势是"三点式"：单指拖动看局部，双指捏合缩放，滚轮在桌面上等价于缩放；
 * 图片被放到 1 倍时自动回中，避免拖到屏幕外只剩一片底色。
 *
 * 保存用 `<a download>`：同源静态资源，不需要走 Blob，Safari 上也能直接存图。
 */
export function MbtiLightbox({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { containerRef } = useOverlayBehavior<HTMLDivElement>({ open, onClose });
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  /** 与渲染无关的手势数据放 ref 里，pointermove 里改它们不会触发重渲染。 */
  const gesture = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    startDistance: 0,
    startScale: 1,
    startOffset: { x: 0, y: 0 },
    last: { x: 0, y: 0 },
    moved: false,
  });

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  /** 把位移限制在"图片边缘不进到屏幕里"的范围内。 */
  const clampOffset = useCallback((next: { x: number; y: number }, nextScale: number) => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image) return next;
    const maxX = Math.max(0, (image.clientWidth * nextScale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (image.clientHeight * nextScale - stage.clientHeight) / 2);
    return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      setScale((current) => {
        const next = clamp(current * factor, MIN_SCALE, MAX_SCALE);
        setOffset((currentOffset) => (next === 1 ? { x: 0, y: 0 } : clampOffset(currentOffset, next)));
        return next;
      });
    },
    [clampOffset],
  );

  /* 滚轮缩放：必须用原生监听器，React 的 onWheel 是被动监听，拦不住页面滚动 */
  useEffect(() => {
    const stage = stageRef.current;
    if (!open || !stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      setScale((current) => {
        const next = clamp(current * factor, MIN_SCALE, MAX_SCALE);
        setOffset((currentOffset) => (next === 1 ? { x: 0, y: 0 } : clampOffset(currentOffset, next)));
        return next;
      });
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [open, clampOffset]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    g.moved = false;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

    if (g.pointers.size === 1) {
      g.last = { x: event.clientX, y: event.clientY };
      g.startOffset = { ...offset };
    }
    if (g.pointers.size === 2) {
      const [a, b] = Array.from(g.pointers.values());
      g.startDistance = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
      g.startScale = scale;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g.pointers.has(event.pointerId)) return;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (g.pointers.size >= 2) {
      const [a, b] = Array.from(g.pointers.values());
      if (!a || !b || g.startDistance === 0) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const next = clamp((distance / g.startDistance) * g.startScale, MIN_SCALE, MAX_SCALE);
      g.moved = true;
      setScale(next);
      setOffset((current) => clampOffset(current, next));
      return;
    }

    // 单指：只在放大后允许拖动（1 倍时拖动没有意义，还会让图跑偏）
    if (scale <= 1) return;
    const dx = event.clientX - g.last.x;
    const dy = event.clientY - g.last.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) g.moved = true;
    g.last = { x: event.clientX, y: event.clientY };
    const next = { x: g.startOffset.x + dx, y: g.startOffset.y + dy };
    setOffset(clampOffset(next, scale));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    g.pointers.delete(event.pointerId);
    if (g.pointers.size === 1) {
      const [only] = Array.from(g.pointers.values());
      if (only) {
        g.last = { ...only };
        g.startOffset = { ...offset };
      }
    }
    if (g.pointers.size === 0) g.startDistance = 0;
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="mb-lightbox" ref={containerRef} role="dialog" aria-modal="true" aria-label="MBTI 十六种人格类型 全图" tabIndex={-1}>
      <div className="mb-lightbox-bar">
        <p>
          MBTI 十六种人格类型 <span>全图 · 双指缩放</span>
        </p>
        <div className="mb-lightbox-tools">
          <button type="button" onClick={() => zoomBy(1 / 1.35)} aria-label="缩小">
            <ZoomOut size={16} strokeWidth={1.5} />
          </button>
          <span className="mb-lightbox-scale" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button type="button" onClick={() => zoomBy(1.35)} aria-label="放大">
            <ZoomIn size={16} strokeWidth={1.5} />
          </button>
          <button type="button" onClick={reset} aria-label="还原">
            <RotateCcw size={15} strokeWidth={1.5} />
          </button>
          <a href="/mbti/mbti-all.webp" download="MBTI-十六种人格类型.webp" aria-label="保存整图">
            <Download size={16} strokeWidth={1.5} />
          </a>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X size={17} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="mb-lightbox-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (scale > 1 ? reset() : zoomBy(2))}
      >
        <img
          ref={imageRef}
          src={MBTI_SHEET.src}
          width={MBTI_SHEET.width}
          height={MBTI_SHEET.height}
          alt="MBTI 十六种人格类型全图，四行四列排列"
          draggable={false}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            transition: gesture.current.pointers.size > 0 ? 'none' : 'transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}
        />
      </div>

      <div className="mb-lightbox-foot">
        <p className="mb-lightbox-hint">单指拖动 · 双指缩放 · 双击放大</p>
        <p className="mb-lightbox-note">MBTI 仅供自我探索参考，不具备心理评估或诊断功能。</p>
      </div>
    </div>,
    document.body,
  );
}
