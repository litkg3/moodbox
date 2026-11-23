'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home } from 'lucide-react';
import { AudioPlayer } from '@/components/audio/audio-player';
import { MoodBoxMark } from '@/components/layout/moodbox-mark';
import { MoreMenu } from '@/components/layout/more-menu';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { TopToolBar } from '@/components/layout/top-tool-bar';
import { cn } from '@/lib/utils';

/**
 * 页头。
 *
 * - 桌面端：品牌 + 九项导航 + 主题/音乐，全部在同一行；
 * - 窄屏：右上角只有「主页」「更多」两个按钮，其余全部收进「更多」面板。
 *
 * 也就是说，整站只有一处功能入口 —— 页面顶部的这一行，不再有底部导航条。
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
        'fixed inset-x-0 top-0 z-50 flex min-h-[60px] items-center',
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

      <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-3 px-5 sm:px-8">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-full pr-2 focus-visible:outline-offset-4"
          aria-label="情绪盒子 MoodBox 首页"
        >
          {/* 卡通盒子站标：hover 时轻轻抬一下，像盒盖被顶起来一点 */}
          <MoodBoxMark className="h-10 w-10 shrink-0 drop-shadow-[0_5px_12px_rgba(142,118,184,0.35)] transition-transform duration-700 group-hover:-translate-y-[1px] group-hover:scale-[1.06]" />
          <span className="flex flex-col leading-none">
            <span className="font-display text-[14px] font-normal tracking-[0.26em] text-ink">
              情绪盒子
            </span>
            <span className="mt-[5px] text-[8.5px] uppercase tracking-[0.42em] text-ink-faint">
              MoodBox
            </span>
          </span>
        </Link>

        {/* 桌面：九项导航与右侧控件同一行 */}
        <TopToolBar />

        {/* 窄屏：只留「主页」「更多」 */}
        <div className="flex items-center gap-1.5 lg:hidden">
          <Link
            href="/"
            aria-current={pathname === '/' ? 'page' : undefined}
            className={cn(
              'mb-nav-item flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium tracking-[0.06em] transition-all duration-500 sm:h-9',
              pathname === '/'
                ? 'mb-pill-active'
                : 'mb-glass-nav hover:bg-white/60',
            )}
          >
            <Home size={14} strokeWidth={1.7} aria-hidden="true" />
            主页
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
