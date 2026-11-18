'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useOverlayBehavior } from '@/hooks/use-overlay-behavior';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** 桌面端最大宽度 */
  width?: 'sm' | 'md' | 'lg';
}

const WIDTHS = {
  sm: 'sm:max-w-[420px]',
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[720px]',
} as const;

/** 移动端从底部升起、桌面端居中的无障碍弹层。 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const { containerRef } = useOverlayBehavior<HTMLDivElement>({ open, onClose });
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        // z-index 要高于 GlassSheet（z-90）：卡片内部还会再开表单、确认框
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            key="backdrop"
            className="absolute inset-0 bg-[rgba(26,22,38,0.32)] backdrop-blur-[14px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="panel"
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={cn(
              'relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden outline-none',
              'rounded-t-[30px] mb-panel',
              'border border-white/80 shadow-[0_30px_90px_-50px_rgba(40,30,60,0.7)] sm:rounded-[32px]',
              WIDTHS[width],
            )}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 44, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          >
            <div className="flex items-start justify-between gap-6 px-6 pt-7 sm:px-9 sm:pt-8">
              <div className="min-w-0">
                <h2 className="font-display text-[19px] font-normal tracking-[0.06em] text-ink sm:text-[21px]">
                  {title}
                </h2>
                {description ? (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-faint">{description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/70 hover:text-ink"
              >
                <X size={17} strokeWidth={1.6} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5 sm:px-9 sm:pb-8">
              {children}
            </div>

            {footer ? (
              <div className="border-t border-[rgba(141,133,152,0.14)] bg-white/45 px-6 py-4 sm:px-9">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
