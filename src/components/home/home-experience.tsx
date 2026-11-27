'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, MessageCircleHeart } from 'lucide-react';
import { EmotionPanel } from '@/components/emotion/emotion-panel';
import { enterSquare } from '@/components/layout/square-entrance';
import { EmotionSky } from '@/components/emotion/emotion-sky';
import { EmotionWheel } from '@/components/home/emotion-wheel';
import { MbtiSection } from '@/components/home/mbti-section';
import { MeteorShower } from '@/components/home/meteor-shower';
import { ScreenDots } from '@/components/home/screen-dots';
import { ScrollScreen } from '@/components/home/scroll-screen';
import { useToast } from '@/components/ui/toast';
import { HOME_BLESSING_LINES, SLOGAN } from '@/data/emotions';
import { useMoodBox } from '@/hooks/use-moodbox';
import { useScreenPager } from '@/hooks/use-screen-pager';
import { burstLine } from '@/lib/burst-lines';
import { getEmotion } from '@/lib/emotions';
import { moodBoxStore } from '@/lib/moodbox-store';
import type { Emotion, EmotionId } from '@/types';

/** 球碎掉之后，过多久自己飘回来。用户要求：两秒。 */
const RETURN_DELAY_MS = 2000;

/**
 * 首页 = 三整屏。
 *
 * 情绪天空 → 情绪转盘 → 人格详解。
 *
 * 翻页按宽度分两条路（见 use-screen-pager）：
 * - 桌面端（≥769px）关掉 CSS 吸附，由 JS 用 1s 的 easeInOutCubic 驱动 scrollTop。
 *   原生吸附是"拨一下、吸一下"，速度由浏览器定，做不到苹果官网那种慢起缓停；
 * - 手机端保留原生 scroll-snap —— 触摸的惯性和橡皮筋是系统给的，
 *   用 JS 接管反而会丢掉手感。
 *
 * 矮屏（< 560px 高，常见于横屏手机）两边都不开，当普通长页面滚。
 */
const SCREENS = [
  { id: 'sky', label: '情绪天空' },
  { id: 'wheel', label: '情绪转盘' },
  { id: 'mbti', label: '人格详解' },
] as const;

const SCREEN_IDS = SCREENS.map((screen) => screen.id);

export function HomeExperience() {
  const [selectedEmotion, setSelectedEmotion] = useState<Emotion | null>(null);
  const [burstingId, setBurstingId] = useState<EmotionId | null>(null);
  const { bursts } = useMoodBox();
  const { showToast } = useToast();
  const timers = useRef(new Map<EmotionId, number>());

  // 组件卸载时把还没到点的「飞回」定时器清掉
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  /* ---------------- 翻页 ---------------- */

  const { mode, active: activeScreen, goToSection } = useScreenPager(SCREEN_IDS);

  /*
   * 两种翻页方式互斥：
   * - 桌面端挂 .mb-js-pager：关掉 CSS 吸附，并且把 scroll-behavior 收成 auto
   *   （rAF 每帧写一次 scrollTop，smooth 会让每一帧都变成一段动画）；
   * - 手机端挂 .mb-snap：原生吸附，一滑一屏由浏览器负责。
   *
   * 矮屏两边都不挂，页面就是普通长文档。
   */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('mb-js-pager', mode === 'js');
    root.classList.toggle('mb-snap', mode === 'snap');
    return () => {
      root.classList.remove('mb-js-pager');
      root.classList.remove('mb-snap');
    };
  }, [mode]);

  /*
   * 其他入口（页头「主页」、将来任何"回到第 N 屏"的按钮）都往这个事件上挂，
   * 不必知道翻页是 JS 还是原生吸附 —— 这里统一转交给 goToSection。
   */
  useEffect(() => {
    const onGoto = (event: Event) => {
      const index = (event as CustomEvent<number>).detail;
      if (typeof index === 'number') goToSection(index);
    };
    window.addEventListener('moodbox:goto-section', onGoto);
    return () => window.removeEventListener('moodbox:goto-section', onGoto);
  }, [goToSection]);

  /* ---------------- 情绪球 ---------------- */

  const handleSelect = useCallback((emotion: Emotion) => {
    setSelectedEmotion(emotion);
  }, []);

  const closePanel = useCallback(() => {
    setSelectedEmotion(null);
  }, []);

  /** 用户按下「捏爆它」：先收面板，再让球在主页碎掉。 */
  const handleBurst = useCallback((emotion: Emotion) => {
    setSelectedEmotion(null);
    setBurstingId(emotion.id);
  }, []);

  const handleBurstComplete = useCallback(
    (emotionId: EmotionId) => {
      setBurstingId(null);
      const label = getEmotion(emotionId).label;
      void moodBoxStore
        .burst(emotionId)
        .then(() => {
          showToast(burstLine(emotionId, label));
          const timer = window.setTimeout(() => {
            timers.current.delete(emotionId);
            void moodBoxStore.restoreBurst(emotionId);
          }, RETURN_DELAY_MS);
          timers.current.set(emotionId, timer);
        })
        .catch((error: unknown) => {
          showToast(error instanceof Error ? error.message : '这一步没能完成，再试一次？', 'caution');
        });
    },
    [showToast],
  );

  return (
    <main className="home-stage relative w-full overflow-x-clip">
      <MeteorShower />

      <ScrollScreen id="sky" label="情绪天空" className="home-screen">
        <EmotionSky
          activeId={selectedEmotion?.id ?? null}
          bursts={bursts}
          burstingId={burstingId}
          onSelect={handleSelect}
          onBurstComplete={handleBurstComplete}
        />

        {/*
          这一层只放文案，必须整块让点击穿过去 —— 它是一块 350×200 的矩形，
          正好压住右侧的「烦躁」「委屈」两颗球：球在漂移，压进矩形里就点不动，
          位置又随屏高变化，表现就是"有概率点不到"。
          所以：容器和文字都不吃指针事件，只有「树洞广场」按钮那一条恢复。
        */}
        <div className="pointer-events-none relative z-10 flex h-full flex-col items-center justify-center px-5 pb-24 pt-[96px] lg:pb-28 lg:pt-[108px]">
          <div className="home-copy relative flex w-full max-w-[440px] flex-col items-center text-center">
            {/*
              四行字的深浅按层级排：品牌最深，邀请次之，寄语再用 ink-soft。
              原来是 85% / 70% / faint 90%，压在漂动的彩球和天空渐变上会飘 ——
              彩球从字底下过的时候，字的边缘就跟没了似的。这里统一提到不透明
              或更高一档，保证任何一颗球飘过来都读得清。
            */}
            <h1 className="mb-reveal flex flex-col items-center">
              <span className="home-title-brand font-display text-[26px] font-light leading-none tracking-[0.2em] text-ink sm:text-[32px]">
                MoodBox
              </span>
              <span className="home-title-invite mt-4 font-display text-[15px] font-light leading-[1.9] tracking-[0.16em] text-ink/90 sm:mt-5 sm:text-[17.5px] lg:mt-3.5">
                点开一颗情绪球！
              </span>
            </h1>

            <p
              className="mb-reveal mt-5 text-[10.5px] leading-[2.1] tracking-[0.05em] text-ink-soft sm:text-[11px] lg:mt-4"
              data-delay="1"
            >
              {HOME_BLESSING_LINES.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>

            <div className="mb-reveal pointer-events-auto mt-7 sm:mt-8 lg:mt-6" data-delay="2">
              {/* 点下去先留一个信号，广场页据此放一段「进门」的转场 */}
              <Link
                href="/square"
                prefetch={false}
                onClick={enterSquare}
                className="group mb-btn-warm inline-flex h-10 items-center gap-2 rounded-full px-5 text-[12.5px] tracking-[0.06em] transition-all duration-500 hover:brightness-[1.02] sm:h-11 sm:px-6"
              >
                <MessageCircleHeart
                  size={15}
                  strokeWidth={1.7}
                  aria-hidden="true"
                  className="transition-transform duration-500 group-hover:scale-110"
                />
                树洞广场
              </Link>
            </div>
          </div>

          {/* 底部向下滑动箭头：只示意，不带文字 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-ink-ghost/70"
          >
            <ChevronDown size={26} strokeWidth={1.6} className="mb-scroll-hint" />
          </div>
        </div>
      </ScrollScreen>

      <ScrollScreen id="wheel" label="情绪转盘" className="emotion-screen">
        <div className="emotion-screen-inner">
          {/*
            这两行标题允许上移淡入；转盘本身只能用透明度 ——
            transform 会让内部的 fixed 卡片以它为准定位（手机端卡片会跳到屏幕外）。
          */}
          <p className="mb-reveal text-center text-[10.5px] tracking-[0.28em] text-ink-faint/80 sm:text-[11.5px]">
            情绪的背后是需求
          </p>
          <h2
            className="mb-reveal mb-4 text-center font-display text-[22px] font-light tracking-[0.12em] text-ink/85 sm:mb-6 sm:text-[26px]"
            data-delay="1"
          >
            情绪转盘
          </h2>
          <div className="mb-reveal-fade w-full">
            <EmotionWheel />
          </div>
        </div>
      </ScrollScreen>

      <MbtiSection />

      <ScreenDots items={SCREENS} active={activeScreen} onSelect={goToSection} />

      <p className="sr-only">{SLOGAN}</p>

      <EmotionPanel emotion={selectedEmotion} onClose={closePanel} onBurst={handleBurst} />
    </main>
  );
}
