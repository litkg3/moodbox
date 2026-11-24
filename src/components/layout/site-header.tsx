'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, MessageCircleMore } from 'lucide-react';
import { AudioPlayer } from '@/components/audio/audio-player';
import { MoodBoxMark } from '@/components/layout/moodbox-mark';
import { MoreMenu } from '@/components/layout/more-menu';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { TopToolBar } from '@/components/layout/top-tool-bar';
import { cn } from '@/lib/utils';

/**
 * 页头。
 *
 * - 桌面端：品牌 + 导航 + 主题/音乐，全部在同一行；
 * - 窄屏：右上角三颗按钮 —— 主页（纯图标）、陪聊（实心主按钮）、更多（描边）。
 *   其余入口全部收进「更多」面板。
 *
 * 375px 是最窄的目标宽度：品牌只留中文（英文副标在 <390px 隐藏），
 * 三颗按钮按 44 + 约 74 + 约 64 排开，加上左右 20px 留白刚好一行放得下。
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    /*
     * `items-center` + 固定最小高度：页头自己撑出一块确定的高度，
     * 底下的实底就不会比内容矮半截 —— 否则滚动时缩小了内边距，
     * 页头底部会露出一条能看见正文的缝。
     */
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-[var(--z-nav)] flex min-h-[60px] items-center',
        'transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
        scrolled ? 'py-2' : 'py-3 sm:py-3.5',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 -z-10 transition-opacity duration-700',
          scrolled ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden="true"
      >
        <div className="mb-header-veil h-full w-full backdrop-blur-[10px]" />
      </div>

      <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-2 px-5 sm:gap-3 sm:px-8">
        <Link
          href="/"
          className="group flex min-w-0 shrink items-center gap-2 rounded-full focus-visible:outline-offset-4"
          aria-label="情绪盒子 MoodBox 首页"
        >
          {/* 卡通盒子站标：hover 时轻轻抬一下，像盒盖被顶起来一点 */}
          <MoodBoxMark className="h-9 w-9 shrink-0 drop-shadow-[0_5px_12px_rgba(142,118,184,0.35)] transition-transform duration-700 group-hover:-translate-y-[1px] group-hover:scale-[1.06] sm:h-10 sm:w-10" />
          <span className="flex min-w-0 flex-col leading-none">
            <span className="whitespace-nowrap font-display text-[13px] font-normal tracking-[0.2em] text-ink sm:text-[14px] sm:tracking-[0.26em]">
              情绪盒子
            </span>
            {/* 375px 下这里没有位置，英文副标只在 ≥390px 出现 */}
            <span className="mt-[5px] hidden whitespace-nowrap text-[8.5px] uppercase tracking-[0.42em] text-ink-faint min-[390px]:block">
              MoodBox
            </span>
          </span>
        </Link>

        {/* 桌面：导航与右侧控件同一行 */}
        <TopToolBar />

        {/* 窄屏：主页（图标）、陪聊（主）、更多（次） */}
        <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
          <Link
            href="/"
            aria-current={pathname === '/' ? 'page' : undefined}
            aria-label="主页"
            title="主页"
            className={cn(
              'mb-home-icon grid h-11 w-11 place-items-center rounded-full transition-all duration-300',
              pathname === '/' ? 'mb-home-icon-active' : 'mb-home-icon-idle',
            )}
          >
            <Home size={18} strokeWidth={1.7} aria-hidden="true" />
          </Link>

          <Link
            href="/chat"
            prefetch={false}
            aria-current={pathname === '/chat' ? 'page' : undefined}
            /* 三颗控件的可访问名保持一致：站标 / 主页 / 陪聊 / 更多功能，读屏时不会忽然断档 */
            aria-label="陪聊"
            className="mb-chat-cta inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium tracking-[0.04em] transition-all duration-300 active:scale-[0.98]"
          >
            <MessageCircleMore size={15} strokeWidth={1.8} aria-hidden="true" />
            陪聊
          </Link>

          <MoreMenu />
        </div>

        {/* 桌面端：主题与音乐，与中间那条导航同一行 */}
        <div className="hidden items-center gap-2 sm:gap-3 lg:flex">
          <ThemeToggle />
          <AudioPlayer />
        </div>
      </div>

    </header>
  );
}
