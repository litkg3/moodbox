'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useOverlayBehavior } from '@/hooks/use-overlay-behavior';
import { mbtiToken, type MbtiType } from '@/data/mbti';
import { cn } from '@/lib/utils';

/** 往下拖多少像素就松手关闭 */
const DISMISS_AT = 88;

interface MbtiDetailSheetProps {
  type: MbtiType | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * 人格详情面板。
 *
 * 手机：从底部升起的 bottom sheet（最高 70dvh），抓住顶部握把往下拖就能关。
 * 桌面：同一个组件的居中弹层版本 —— 结构一样，只换对齐方式和圆角。
 *
 * 文案不截断：正文完整显示，超出时**面板内部**滚动（`overscroll-contain`），
 * 不会把背后的整页带着一起动。
 */
export function MbtiDetailSheet({
  type,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: MbtiDetailSheetProps) {
  const [mounted, setMounted] = useState(false);
  const { containerRef } = useOverlayBehavior<HTMLDivElement>({ open: type !== null, onClose });
  const reduceMotion = useReducedMotion();

  const [dragY, setDragY] = useState(0);
  const dragRef = useRef(0);
  const dragging = useRef(false);
  const startY = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 换一个类型、或重新打开时，把手势状态清干净
  useEffect(() => {
    setDragY(0);
    dragRef.current = 0;
    dragging.current = false;
  }, [type?.code]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    startY.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    // 只允许往下拖：往上拉没有对应动作，手一碰就会"抖一下"
    const next = Math.max(0, event.clientY - startY.current);
    dragRef.current = next;
    setDragY(next);
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const distance = dragRef.current;
    dragRef.current = 0;
    setDragY(0);
    if (distance > DISMISS_AT) onClose();
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {type ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            key="backdrop"
            className="absolute inset-0 bg-[rgba(26,22,38,0.32)] backdrop-blur-[14px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            key="wrap"
            className="relative z-10 w-full sm:max-w-[480px]"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
          >
            <div
              ref={containerRef}
              role="dialog"
              aria-modal="true"
              aria-label={`${type.code} ${type.name}`}
              tabIndex={-1}
              className={cn('mb-sheet', mbtiToken(type))}
              style={{
                transform: `translateY(${dragY}px)`,
                transition: dragging.current ? 'none' : 'transform 0.3s cubic-bezier(0.22,0.61,0.36,1)',
              }}
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
                    src={type.image}
                    width={480}
                    height={480}
                    alt={`${type.code} ${type.name} 人物插画`}
                  />
                  <div className="mb-sheet-id">
                    <p className="mb-sheet-code">{type.code}</p>
                    <p className="mb-sheet-name">{type.name}</p>
                    <p className="mb-sheet-tagline">{type.tagline}</p>
                  </div>
                </div>

                <ul className="mb-sheet-tags">
                  {type.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>

                <p className="mb-sheet-desc">{type.desc}</p>
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
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
