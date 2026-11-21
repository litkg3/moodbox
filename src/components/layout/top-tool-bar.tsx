'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { TOOL_ICONS } from '@/components/layout/tool-icons';
import { SettingsPanel } from '@/components/layout/settings-panel';
import { useToolOverlay, type OverlayTool } from '@/components/layout/tool-overlay-provider';
import { TOOL_ITEMS, type ToolItem } from '@/lib/tools';
import { cn } from '@/lib/utils';

/**
 * 桌面端的顶部导航。
 *
 * 与主题、音乐按钮同处页头的一行：左侧品牌，中间这条玻璃条，右侧控件。
 * 宽度够（≥1280px）时显示「图标 + 文字」，1024–1279px 只留图标，
 * 靠 title 与 aria-label 提供名称 —— 这样九个入口不会把页头挤成两行。
 */
export function TopToolBar() {
  const pathname = usePathname();
  const { openTool } = useToolOverlay();
  const [settingsOpen, setSettingsOpen] = useState(false);

  function handle(item: ToolItem): (() => void) | undefined {
    if (item.key === 'jar' || item.key === 'letters') {
      const tool: OverlayTool = item.key;
      return () => openTool(tool);
    }
    if (item.key === 'settings') return () => setSettingsOpen(true);
    return undefined;
  }

  return (
    <>
      <nav
        aria-label="功能导航"
        className="hidden min-w-0 flex-1 justify-center px-2 lg:flex"
      >
        <ul className="mb-glass-soft mb-scroll-x flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full p-1">
          {TOOL_ITEMS.map((item) => {
            const Icon = TOOL_ICONS[item.key];
            const active = item.href !== undefined && item.href === pathname;
            const className = cn(
              'flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] tracking-[0.05em] transition-all duration-500',
              active ? 'mb-pill-active' : 'text-ink-faint hover:bg-white/45 hover:text-ink-soft',
            );
            const inner = (
              <>
                <Icon size={13} strokeWidth={1.6} aria-hidden="true" />
                <span className="hidden xl:inline">{item.label}</span>
            </>
          );

          if (item.kind === 'route' && item.href) {
            return (
              <li key={item.key} className="shrink-0">
                <Link
                  href={item.href}
                  prefetch={false}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  title={item.hint}
                  className={className}
                >
                  {inner}
                </Link>
              </li>
            );
          }

          return (
            <li key={item.key} className="shrink-0">
              <button
                type="button"
                onClick={handle(item)}
                aria-label={item.label}
                title={item.hint}
                className={className}
              >
                {inner}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
    <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
