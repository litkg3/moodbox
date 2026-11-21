'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/layout/theme-provider';
import { cn } from '@/lib/utils';

/**
 * 白日 / 星空切换。
 *
 * 图标由 CSS 根据 `html[data-theme]` 决定显示哪一个，
 * 所以首帧就是对的，也不存在水合前后 HTML 不一致的问题。
 *
 * `withLabel`：窄屏「更多」面板里这两个工具只剩图标，光看图标分不清
 * 现在是哪个模式、开着还是关着。带上这组参数后会长出一个文字标签
 * （「白日」/「星空」），并在星空下给出明确的激活态。
 */
export function ThemeToggle({
  className,
  withLabel = false,
}: {
  className?: string;
  withLabel?: boolean;
}) {
  const { toggle, theme } = useTheme();
  const night = theme === 'night';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={night ? '切换到白日模式' : '切换到星空模式'}
      aria-pressed={night}
      title={night ? '现在是星空，点一下回到白日' : '现在是白日，点一下进入星空'}
      className={cn(
        'mb-glass-soft group grid h-10 w-10 place-items-center rounded-full text-ink-faint',
        'transition-colors duration-500 hover:text-ink sm:h-11 sm:w-11',
        /*
         * 带标签时把 grid 换成 inline-flex：`grid` 会让每个子元素各占一格，
         * 太阳/月亮两个图标 + 两段文字叠成两行，「星空」被折成「星」和「空」。
         * 这里显式 inline-flex + whitespace-nowrap，一行排开不换行。
         */
        withLabel &&
          'inline-flex h-9 w-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[11.5px] tracking-[0.04em]',
        /*
         * 激活态：进星空之后按钮整体换成一层偏紫的实底 + 描边，
         * 月光图标本身也提亮 —— 即便不看文字，也能一眼分出
         * 「这个被按下了」和「这个没按」。
         */
        withLabel && night && 'mb-tool-on text-lavender-deep',
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
        className={cn(
          'mb-only-night transition-transform duration-700 group-hover:-rotate-12',
          withLabel && night && 'drop-shadow-[0_0_6px_rgba(201,180,239,0.55)]',
        )}
      />
      {withLabel ? (
        <>
          <span className="mb-only-day whitespace-nowrap">白日</span>
          <span className="mb-only-night whitespace-nowrap">星空</span>
        </>
      ) : null}
    </button>
  );
}
