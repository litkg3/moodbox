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
 * 三颗按钮按 34 + 约 76 + 约 76 排开（总宽约 204），加上左右 20px 留白
 * 刚好一行放得下 —— 而且是和左边 36px 的站标同一个量级，不抢戏。
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
     * 高度固定 64px（`.mb-header` 里写死，滚动时也不再缩）。
     * 以前滚动前后是 68 / 60 两档，页头一缩底下的内容就跟着挪，
     * 眼睛看到的是"页面被推了一下"；现在只有实底在淡入淡出。
     */
    <header className="mb-header fixed inset-x-0 top-0 z-[var(--z-nav)] flex items-center">
      <div
        className={cn(
          'pointer-events-none absolute inset-0 -z-10 transition-opacity duration-700',
          scrolled ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden="true"
      >
        <div className="mb-header-veil h-full w-full backdrop-blur-[10px]" />
      </div>

      <div className="mb-header-inner">
        <Link
          href="/"
          className="group mb-brand flex shrink-0 items-center gap-2.5 rounded-full focus-visible:outline-offset-4"
          aria-label="情绪盒子 MoodBox 首页"
        >
          {/* 站标 36×36，与文字之间 10px（gap-2.5）；hover 时轻轻抬一下，像盒盖被顶起来一点 */}
          <MoodBoxMark className="h-9 w-9 shrink-0 drop-shadow-[0_5px_12px_rgba(142,118,184,0.35)] transition-transform duration-700 group-hover:-translate-y-[1px] group-hover:scale-[1.06]" />
          <span className="mb-brand-text flex min-w-0 flex-col justify-center leading-none max-[359px]:hidden">
            {/*
              375px 的宽度预算：三颗按钮按规范占约 204px，品牌剩 131px，
              图标 36 + 间距 10 之后，四个字有 85px 可用 ——
              13px 配 0.1em 字距只要 57px，够。400px 以上把字距放开。
            */}
            <span className="whitespace-nowrap font-display text-[13px] font-normal tracking-[0.1em] text-ink min-[400px]:tracking-[0.14em] sm:text-[14px] sm:tracking-[0.24em]">
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

        {/* 窄屏：主页（图标）、陪聊（主）、更多（次）—— 三颗同高 40px。显隐由 .mb-header-actions 的媒体查询管 */}
        <div className="mb-header-actions">
          <Link
            href="/"
            aria-current={pathname === '/' ? 'page' : undefined}
            aria-label="主页"
            title="主页"
            className="mb-nav-btn mb-nav-btn--icon"
          >
            <Home size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>

          <Link
            href="/chat"
            prefetch={false}
            aria-current={pathname === '/chat' ? 'page' : undefined}
            /* 三颗控件的可访问名保持一致：站标 / 主页 / 陪聊 / 更多功能，读屏时不会忽然断档 */
            aria-label="陪聊"
            className="mb-nav-btn mb-nav-btn--primary"
          >
            <MessageCircleMore size={20} strokeWidth={1.75} aria-hidden="true" />
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
