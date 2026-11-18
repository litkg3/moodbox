'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/layout/theme-provider';
import { cn } from '@/lib/utils';

/**
 * 白日 / 星空切换。
 *
 * 图标由 CSS 根据 `html[data-theme]` 决定显示哪一个，
 * 所以首帧就是对的，也不存在水合前后 HTML 不一致的问题。
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { toggle, theme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'night' ? '切换到白日模式' : '切换到星空模式'}
      title={theme === 'night' ? '现在是星空，点一下回到白日' : '现在是白日，点一下进入星空'}
      className={cn(
        'mb-glass-soft group grid h-10 w-10 place-items-center rounded-full text-ink-faint',
        'transition-colors duration-500 hover:text-ink sm:h-11 sm:w-11',
        className,
      )}
    >
      <Sun
        size={15}
        strokeWidth={1.6}
        aria-hidden="true"
        className="mb-only-day transition-transform duration-700 group-hover:rotate-45"
      />
      <Moon
        size={15}
        strokeWidth={1.6}
        aria-hidden="true"
        className="mb-only-night transition-transform duration-700 group-hover:-rotate-12"
      />
    </button>
  );
}
