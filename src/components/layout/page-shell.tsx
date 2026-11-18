import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 页面统一外框：给内容留出足够的呼吸空间，并保持各页节奏一致。 */
export function PageShell({
  children,
  className,
  width = 'default',
}: {
  children: ReactNode;
  className?: string;
  width?: 'default' | 'wide' | 'narrow';
}) {
  const widths = {
    narrow: 'max-w-[720px]',
    default: 'max-w-[1080px]',
    wide: 'max-w-[1240px]',
  } as const;

  return (
    <main
      className={cn(
        // 顶部留白要避开固定页头；桌面端页头下面还多了一条九项导航
        'relative z-10 mx-auto w-full px-5 pb-20 pt-[92px] sm:px-8 lg:pt-[104px]',
        widths[width],
        className,
      )}
    >
      {children}
    </main>
  );
}

/** 每个内页顶部的标题区：一个安静的段落，而不是后台面板式标题。 */
export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-9 flex flex-col gap-5 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-[560px]">
        <p className="text-[11px] uppercase tracking-[0.42em] text-ink-ghost">{eyebrow}</p>
        <h1 className="mt-3 font-display text-[26px] font-light leading-tight tracking-[0.06em] text-ink sm:text-[34px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-[46ch] text-pretty text-[13.5px] leading-[1.9] text-ink-faint sm:text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
