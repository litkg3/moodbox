'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, MoreHorizontal } from 'lucide-react';
import { AudioPlayer } from '@/components/audio/audio-player';
import { SettingsPanel } from '@/components/layout/settings-panel';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { TOOL_ICONS } from '@/components/layout/tool-icons';
import { useToolOverlay } from '@/components/layout/tool-overlay-provider';
import {
  MORE_MENU_COMMON,
  MORE_MENU_PRIMARY,
  MORE_MENU_SECONDARY,
  findTool,
  type ToolItem,
  type ToolKey,
} from '@/lib/tools';
import { cn } from '@/lib/utils';

/**
 * 窄屏的「更多」。
 *
 * 页头右上角只有三颗按钮，其余入口全部收进这张全宽下拉面板：
 * 遮罩把下面的内容压暗一点（白日是灰紫、星空是纯黑），面板本身不透明度
 * 都在 0.92 以上 —— 透出底下的字会立刻让菜单变成一团噪点。
 */
export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 面板从页头底边开始，高度随页头收缩变化，所以打开时量一次 */
  const [top, setTop] = useState(64);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { openTool } = useToolOverlay();

  useEffect(() => {
    if (!open) return;

    /*
     * 页面上不止一个 <header>（主页的 MBTI 区块也是），
     * 这里要的是站点头，按类名取。
     */
    const header = document.querySelector('header.mb-header');
    if (header) setTop(Math.round(header.getBoundingClientRect().bottom));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    setOpen(false);
  }

  function run(item: ToolItem) {
    setOpen(false);
    if (item.key === 'jar' || item.key === 'letters') {
      openTool(item.key);
      return;
    }
    if (item.key === 'settings') setSettingsOpen(true);
  }

  const pick = (key: ToolKey) => findTool(key);

  return (
    <div className="relative lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="更多功能"
        className={cn('mb-nav-btn mb-nav-btn--ghost', open && 'is-open')}
      >
        <MoreHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
        更多
      </button>

      <AnimatePresence>
        {open ? (
          <>
            {/* 遮罩：从页头底边开始，页头本身保持清晰、也还能点「更多」收起 */}
            <motion.button
              type="button"
              aria-label="关闭更多菜单"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={close}
              style={{ top }}
              className="mb-more-scrim fixed inset-x-0 bottom-0 z-[55] cursor-default"
            />

            <motion.div
              role="menu"
              aria-label="更多功能"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              style={{ top }}
              className="mb-panel mb-more-panel fixed inset-x-0 z-[60] rounded-b-[28px] border-x-0 border-t-0 px-5 pb-5 pt-3 shadow-[0_30px_70px_-40px_rgba(40,30,60,0.6)] sm:px-8"
            >
              <div className="mx-auto w-full max-w-[560px]">
                {/* 第一项：AI 陪聊，单独一行，权重高于其他入口 */}
                {MORE_MENU_PRIMARY.map((key) => {
                  const item = pick(key);
                  if (!item?.href) return null;
                  const Icon = TOOL_ICONS[item.key];
                  const active = item.href === pathname;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      prefetch={false}
                      role="menuitem"
                      aria-current={active ? 'page' : undefined}
                      onClick={close}
                      className={cn(
                        'mb-more-primary flex items-center gap-3 rounded-[18px] px-3.5 py-3 transition-colors',
                        active && 'is-active',
                      )}
                    >
                      <span className="mb-more-primary-icon grid h-9 w-9 shrink-0 place-items-center rounded-full">
                        <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] tracking-[0.04em]">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                          {item.hint}
                        </span>
                      </span>
                      <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden="true" />
                    </Link>
                  );
                })}

                {/* 常用入口直接接在 AI 陪聊下面，不再加一行小标题占位 */}
                <ul className="mt-2 grid grid-cols-2 gap-1">
                  {MORE_MENU_COMMON.map((key) => {
                    const item = pick(key);
                    if (!item) return null;
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
                      active ? 'mb-pill-active' : 'text-ink-soft hover:bg-white/55 hover:text-ink',
                    );

                    return (
                      <li key={item.key}>
                        {item.kind === 'route' && item.href ? (
                          <Link
                            href={item.href}
                            prefetch={false}
                            role="menuitem"
                            aria-current={active ? 'page' : undefined}
                            onClick={close}
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

                <div className="mb-more-divider mt-3 pt-3">
                  <ul className="grid grid-cols-2 gap-1">
                    {MORE_MENU_SECONDARY.map((key) => {
                      const item = pick(key);
                      if (!item) return null;
                      const Icon = TOOL_ICONS[item.key];
                      const active = item.href !== undefined && item.href === pathname;
                      const className = cn(
                        'flex h-9 w-full items-center gap-2 rounded-[13px] px-3 text-left text-[12px] tracking-[0.04em] transition-colors',
                        active ? 'mb-pill-active' : 'text-ink-faint hover:bg-white/50 hover:text-ink',
                      );

                      return (
                        <li key={item.key}>
                          {item.kind === 'route' && item.href ? (
                            <Link
                              href={item.href}
                              prefetch={false}
                              role="menuitem"
                              aria-current={active ? 'page' : undefined}
                              onClick={close}
                              className={className}
                            >
                              <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                              <span className="truncate">{item.label}</span>
                            </Link>
                          ) : (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => run(item)}
                              className={className}
                            >
                              <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                              <span className="truncate">{item.label}</span>
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/*
                  主题与音乐一起靠右排，主题在音乐左边。
                  两个都带文字标签（「星空」「音乐中」），开着的时候有明确的激活态。
                */}
                <div className="mb-more-divider mt-3 flex items-center justify-end gap-2 pt-3">
                  <ThemeToggle withLabel />
                  <AudioPlayer compact />
                </div>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
