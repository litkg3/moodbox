'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { MoreHorizontal } from 'lucide-react';
import { AudioPlayer } from '@/components/audio/audio-player';
import { useClearData } from '@/components/layout/clear-data-provider';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { TOOL_ICONS } from '@/components/layout/tool-icons';
import { useToolOverlay } from '@/components/layout/tool-overlay-provider';
import { TOOL_ITEMS, type ToolItem } from '@/lib/tools';
import { cn } from '@/lib/utils';

/**
 * 窄屏的「更多」。
 *
 * 页头右上角只剩两个按钮：主页、更多。九个入口连同主题、音乐都收进这张
 * 玻璃面板里，所以页面上不会再出现第二条横向滚动导航。
 */
export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const requestClear = useClearData();
  const { openTool } = useToolOverlay();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function run(item: ToolItem) {
    setOpen(false);
    if (item.key === 'jar' || item.key === 'letters') {
      openTool(item.key);
      return;
    }
    if (item.key === 'clear') requestClear();
  }

  return (
    <div className="relative lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'mb-more-btn flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium tracking-[0.06em] transition-all duration-500 active:scale-[0.98] sm:h-9',
          open && 'brightness-[1.04]',
        )}
      >
        <MoreHorizontal size={15} strokeWidth={1.9} aria-hidden="true" />
        更多
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <div
              className="fixed inset-0 z-[55]"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              role="menu"
              aria-label="更多功能"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.985 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="mb-panel absolute right-0 top-[calc(100%+10px)] z-[60] w-[min(88vw,344px)] rounded-[26px] border border-white/70 p-3 shadow-[0_30px_70px_-40px_rgba(40,30,60,0.6)]"
            >
              <ul className="grid grid-cols-2 gap-1">
                {TOOL_ITEMS.map((item) => {
                  const Icon = TOOL_ICONS[item.key];
                  const active = item.href !== undefined && item.href === pathname;
                  const inner = (
                    <>
                      <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </>
                  );
                  const className = cn(
                    'flex h-10 w-full items-center gap-2 rounded-[14px] px-3 text-left text-[12.5px] tracking-[0.04em] transition-colors',
                    active
                      ? 'mb-pill-active'
                      : 'text-ink-soft hover:bg-white/55 hover:text-ink',
                  );

                  return (
                    <li key={item.key}>
                      {item.kind === 'route' && item.href ? (
                        <Link
                          href={item.href}
                          prefetch={false}
                          role="menuitem"
                          onClick={() => setOpen(false)}
                          className={className}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => run(item)}
                          className={className}
                        >
                          {inner}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/*
                主题与音乐一起靠右排，主题在音乐左边。
                原来这里用 justify-between 把两者顶到两端，主题单独落在左边，
                看起来像是「这一行的标题」。现在它们是一组工具，靠右、挨着。
              */}
              <div className="mt-2 flex items-center justify-end gap-2 border-t border-[rgba(141,133,152,0.16)] px-1 pt-3">
                <ThemeToggle />
                <AudioPlayer />
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
