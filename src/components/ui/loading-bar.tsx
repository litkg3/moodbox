'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface LoadingBarProps {
  /** 读屏播报的说明 */
  label?: string;
  className?: string;
}

/**
 * 列表加载时的进度条。
 *
 * 真实耗时不固定，所以不假装知道百分比：
 * 条子在「未知进度」状态下匀速往复，配合一句说明，
 * 与站内其它卡片共用同一套毛玻璃 / 圆角语言。
 */
export function LoadingBar({ label = '正在加载…', className }: LoadingBarProps) {
  const reduce = useReducedMotion();

  return (
    <div className={cn('mb-loading-card', className)} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[12px] tracking-[0.04em] text-ink-faint">{label}</span>
        <span className="mb-loading-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(141,133,152,0.16)]">
        <motion.span
          className="mb-loading-bar block h-full w-1/3 rounded-full"
          initial={{ x: '-110%' }}
          animate={reduce ? { x: '0%', scaleX: 1 } : { x: ['-110%', '330%'] }}
          transition={
            reduce
              ? { duration: 0.3 }
              : { duration: 1.35, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.15 }
          }
        />
      </div>
    </div>
  );
}
