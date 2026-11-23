'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronDown, MessageCircleHeart } from 'lucide-react';
import { EmotionPanel } from '@/components/emotion/emotion-panel';
import { enterSquare } from '@/components/layout/square-entrance';
import { EmotionSky } from '@/components/emotion/emotion-sky';
import { EmotionWheel } from '@/components/home/emotion-wheel';
import { MeteorShower } from '@/components/home/meteor-shower';
import { useToast } from '@/components/ui/toast';
import { HOME_BLESSING_LINES, SLOGAN } from '@/data/emotions';
import { useMoodBox } from '@/hooks/use-moodbox';
import { burstLine } from '@/lib/burst-lines';
import { getEmotion } from '@/lib/emotions';
import { moodBoxStore } from '@/lib/moodbox-store';
import { useScreenSnap } from '@/hooks/use-screen-snap';
import type { Emotion, EmotionId } from '@/types';

/** 球碎掉之后，过多久自己飘回来。用户要求：两秒。 */
const RETURN_DELAY_MS = 2000;

/**
 * 首页：一片漂浮着情绪球的天空。
 *
 * 文字只做背景音 —— 标题和寄语都压得很轻，主体让给球。
 * 功能入口全部在页头下方那条导航里（见 TopToolBar）。
 */
export function HomeExperience() {
  const [selectedEmotion, setSelectedEmotion] = useState<Emotion | null>(null);
  const [burstingId, setBurstingId] = useState<EmotionId | null>(null);
  const { bursts } = useMoodBox();
  const { showToast } = useToast();
  const reduceMotion = useReducedMotion();
  const timers = useRef(new Map<EmotionId, number>());

  // 组件卸载时把还没到点的「飞回」定时器清掉
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

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

  const fade = (delay: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  });

  /*
   * 整屏翻页：必须是「一滑就是一整屏」，不能停在两屏中间。
   *
   * enabled 用 JS 判断而不是纯 CSS 媒体查询，是因为 CSS 的 scroll-snap
   * 在鼠标滚轮上并不可靠（见 use-screen-snap 的注释），而且矮屏里
   * 一屏装不下内容，强吸会让人看不到转盘。
   */
  const [snapEnabled, setSnapEnabled] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-height: 620px)');
    const sync = () => setSnapEnabled(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useScreenSnap(snapEnabled);

  return (
    <main className="home-stage relative min-h-[100dvh] w-full overflow-hidden">
      <EmotionSky
        activeId={selectedEmotion?.id ?? null}
        bursts={bursts}
        burstingId={burstingId}
        onSelect={handleSelect}
        onBurstComplete={handleBurstComplete}
      />

      {/*
        深夜 + 星空模式时，偶尔划过一场流星雨。
        放在天空之上、文字之下：它是背景的一部分，不该压住任何字。
      */}
      <MeteorShower />

      <div className="home-screen pointer-events-none relative z-10 flex h-[100dvh] flex-col items-center justify-center px-5 pb-24 pt-[96px] lg:pb-28 lg:pt-[108px]">
        <div className="home-copy relative flex w-full max-w-[440px] flex-col items-center text-center">
          {/* 标题与寄语：刻意做轻，不跟球抢视线 */}
          <motion.h1 {...fade(0.2)} className="flex flex-col items-center">
            <span className="home-title-brand font-display text-[26px] font-light leading-none tracking-[0.2em] text-ink/85 sm:text-[32px]">
              MoodBox
            </span>
            <span className="home-title-invite mt-4 font-display text-[15px] font-light leading-[1.9] tracking-[0.16em] text-ink/70 sm:mt-5 sm:text-[17.5px] lg:mt-3.5">
              点开一颗情绪球！
            </span>
          </motion.h1>

          <motion.p
            {...fade(0.45)}
            className="mt-5 text-[10.5px] leading-[2.1] tracking-[0.05em] text-ink-faint/90 sm:text-[11px] lg:mt-4"
          >
            {HOME_BLESSING_LINES.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </motion.p>

          <motion.div {...fade(0.68)} className="pointer-events-auto mt-7 sm:mt-8 lg:mt-6">
            {/*
              点下去先留一个信号，广场页据此放一段「进门」的转场。
              导航照常走，不 preventDefault —— 该多快还是多快。
            */}
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
          </motion.div>
        </div>

        {/* 底部向下滑动箭头：只示意，不带文字 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-ink-ghost/70"
        >
          <ChevronDown
            size={26}
            strokeWidth={1.6}
            className="mb-scroll-hint"
          />
        </div>
      </div>

      {/*
        情绪转盘：往下滚就是一整屏。
        第一屏保持 100dvh，第二屏也做成 100dvh 并垂直居中 —— 这样
        PC 端滚到底时转盘正好落在屏幕正中，而不是吊在视口下半截。
      */}
      {/*
         * 高度锁死 100dvh，不再是 min-height。
         * 用 min-h 时只要内容比一屏高一点，整页高度就不是「2 × 一屏」，
         * 整屏翻页会算错、滚到底还会差几十像素 —— 那正是「卡在两屏中间」的来源。
         * 现在让内容在固定的一屏里自适应（见下面的 py），页面高度恒等于两屏。
         *
         * 宽屏单独放宽 max-w：卡片浮在转盘两肩，两块都要装得下。
         */}
      <div className="emotion-screen relative z-10 mx-auto flex h-[100dvh] w-full max-w-[1200px] flex-col items-center justify-center px-5 py-16 sm:px-8 xl:max-w-[1560px]">
        <p className="mb-1.5 text-center text-[10.5px] tracking-[0.28em] text-ink-faint/80 sm:text-[11.5px]">
          情绪的背后是需求
        </p>
        <h2 className="mb-4 text-center font-display text-[22px] font-light tracking-[0.12em] text-ink/85 sm:mb-6 sm:text-[26px]">
          情绪转盘
        </h2>
        <EmotionWheel className="w-full" />
      </div>

      <p className="sr-only">{SLOGAN}</p>

      <EmotionPanel emotion={selectedEmotion} onClose={closePanel} onBurst={handleBurst} />
    </main>
  );
}
