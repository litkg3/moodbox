import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AmbientBackground } from '@/components/layout/ambient-background';
import { ClearDataProvider } from '@/components/layout/clear-data-provider';
import { HydrationMarker } from '@/components/layout/hydration-marker';
import { MotionPreferences } from '@/components/layout/motion-preferences';
import { SiteHeader } from '@/components/layout/site-header';
import { SquareEntrance } from '@/components/layout/square-entrance';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { ToolOverlayProvider } from '@/components/layout/tool-overlay-provider';
import { ToastProvider } from '@/components/ui/toast';
import { THEME_COLORS, THEME_INIT_SCRIPT } from '@/lib/theme';

export const metadata: Metadata = {
  title: {
    default: '情绪盒子 Mood Box · 面向青年群体的轻量情绪陪伴服务平台',
    template: '%s · 情绪盒子 Mood Box',
  },
  description:
    '情绪盒子是一个安静的数字情绪空间：捏一颗漂浮的情绪球，得到一段温柔的陪伴；把生活里的开心小事收藏起来，在低落时重新遇见它们。所有记录仅保存在你的浏览器本地。',
  applicationName: 'Mood Box',
  authors: [{ name: 'MoodBox' }],
  keywords: ['情绪记录', '情绪管理', '快乐记忆', '情绪日历', '治愈系网站', 'MoodBox'],
  /*
   * 站点图标 = 页头左上角那只粉盒子（`MoodBoxMark`）。
   * 四种尺寸各给一份：SVG 给支持的浏览器（任意缩放都清楚），
   * 32 / 192 的 PNG 给只认位图的（Safari、部分安卓浏览器），
   * `apple` 那份给「添加到主屏幕」，不缩放会被裁圆角。
   */
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: '情绪盒子 Mood Box · 面向青年群体的轻量情绪陪伴服务平台',
    description: '让情绪有处安放，让快乐有迹可循。',
    type: 'website',
    locale: 'zh_CN',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: THEME_COLORS.day,
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="day" suppressHydrationWarning>
      <body className="antialiased">
        {/*
          首帧之前把主题写进 <html data-theme>。
          放在 body 最前面同步执行，早于任何内容绘制，
          因此不会出现「白底闪一下再进入星空」。
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-full focus:bg-white/90 focus:px-4 focus:py-2 focus:text-sm focus:text-ink focus:shadow-lg"
        >
          跳到主要内容
        </a>
        <AmbientBackground />
        <HydrationMarker />
        <ThemeProvider>
          <MotionPreferences>
            <ToastProvider>
              <ClearDataProvider>
                <ToolOverlayProvider>
                  <SiteHeader />
                  <SquareEntrance />
                  <div id="main-content" tabIndex={-1}>
                    {children}
                  </div>
                </ToolOverlayProvider>
              </ClearDataProvider>
            </ToastProvider>
          </MotionPreferences>
        </ThemeProvider>
      </body>
    </html>
  );
}
