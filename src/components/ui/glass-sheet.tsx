'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useOverlayBehavior } from '@/hooks/use-overlay-behavior';
import { cn } from '@/lib/utils';

export type GlassSheetTone = 'deep' | 'glass';

interface GlassSheetProps {
  open: boolean;
  onClose: () => void;
  /** 读屏与视觉标题；不传则完全交给 children 自己排版 */
  title?: string;
  /** 当 children 自己渲染标题时，用这个 id 关联 aria-labelledby */
  labelledBy?: string;
  tone?: GlassSheetTone;
  width?: 'sm' | 'md' | 'lg';
  /** 卡片顶部那圈光晕的颜色（通常是当前情绪的浅色） */
  glowColor?: string;
  /** 卡片底部固定的操作区 */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

const WIDTH: Record<NonNullable<GlassSheetProps['width']>, string> = {
  sm: 'sm:max-w-[420px]',
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[680px]',
};

/**
 * 统一的浮层卡片。
 *
 * 三种东西共用它：点开小球后的情绪面板、开心罐、心事信箱。
 * 外观语言是一致的 —— 一层被模糊掉的毛玻璃、后面透出来的彩色光晕、
 * 中间一张大圆角的卡片、很轻的投影。只有卡片本身的材质有两种：
 * - `deep`：深灰紫，用于情绪面板（文字为白色，居中）；
 * - `glass`：跟随主题的磨砂玻璃，用于里面还有表单和列表的卡片。
 */
export function GlassSheet({
  open,
  onClose,
  title,
  labelledBy,
  tone = 'deep',
  width = 'md',
  glowColor,
  footer,
  children,
  className,
}: GlassSheetProps) {
  return (
    <AnimatePresence>
      {open ? (
        <SheetBody
          onClose={onClose}
          title={title}
          labelledBy={labelledBy}
          tone={tone}
          width={width}
          glowColor={glowColor}
          footer={footer}
          className={className}
        >
          {children}
        </SheetBody>
      ) : null}
    </AnimatePresence>
  );
}

function SheetBody({
  onClose,
  title,
  labelledBy,
  tone,
  width,
  glowColor,
  footer,
  children,
  className,
}: Omit<GlassSheetProps, 'open'>) {
  const { containerRef } = useOverlayBehavior<HTMLDivElement>({ open: true, onClose });
  const reduce = useReducedMotion();
  const deep = tone === 'deep';

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6">
      {/* 毛玻璃：整片页面被糊掉，而不是压黑 */}
      <motion.div
        className="absolute inset-0 bg-[rgba(26,22,38,0.34)] backdrop-blur-[16px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.55 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 卡片背后那团模糊的光 */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[64vmin] w-[64vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"
        style={{ background: glowColor ?? 'rgba(168, 148, 220, 0.55)', opacity: 0.42 }}
        initial={{ scale: 0.62, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.44 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />

      <motion.div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : title}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[30px] outline-none sm:rounded-[32px]',
          WIDTH[width ?? 'md'],
          deep
            ? 'mb-deep-card'
            : 'mb-panel border border-white/60 shadow-[0_30px_90px_-50px_rgba(40,30,60,0.7)]',
          className,
        )}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 42, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.988 }}
        transition={{ type: 'spring', stiffness: 250, damping: 28 }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭这张卡片"
          className={cn(
            'absolute right-3.5 top-3.5 z-20 grid h-9 w-9 place-items-center rounded-full transition-colors sm:right-5 sm:top-5',
            deep
              ? 'text-[#c9c2de] hover:bg-white/10 hover:text-[#fff]'
              : 'text-ink-faint hover:bg-white/60 hover:text-ink',
          )}
        >
          <X size={17} strokeWidth={1.6} />
        </button>

        {title ? (
          <header className="shrink-0 px-6 pb-1 pt-7 sm:px-9">
            <h2
              className={cn(
                'font-display text-[20px] font-normal tracking-[0.12em] sm:text-[22px]',
                deep ? 'text-[#fff]' : 'text-ink',
              )}
            >
              {title}
            </h2>
          </header>
        ) : null}

        <div
          className={cn(
            'mb-scroll-x min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5 sm:px-9 sm:pb-8',
            title ? 'pt-4' : 'pt-8',
          )}
        >
          {children}
        </div>

        {footer ? (
          <div
            className={cn(
              'shrink-0 border-t px-6 py-4 sm:px-9',
              deep ? 'border-white/10' : 'border-[rgba(141,133,152,0.16)]',
            )}
          >
            {footer}
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
