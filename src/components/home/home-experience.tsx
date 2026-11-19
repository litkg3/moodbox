'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { MessageCircleHeart } from 'lucide-react';
import { EmotionPanel } from '@/components/emotion/emotion-panel';
import { enterSquare } from '@/components/layout/square-entrance';
import { EmotionSky } from '@/components/emotion/emotion-sky';
import { useToast } from '@/components/ui/toast';
import { HOME_BLESSING_LINES, SLOGAN } from '@/data/emotions';
import { useMoodBox } from '@/hooks/use-moodbox';
import { burstLine } from '@/lib/burst-lines';
import { getEmotion } from '@/lib/emotions';
import { moodBoxStore } from '@/lib/moodbox-store';
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

  return (
    <main className="home-stage relative min-h-[100dvh] w-full overflow-hidden">
      <EmotionSky
        activeId={selectedEmotion?.id ?? null}
        bursts={bursts}
        burstingId={burstingId}
        onSelect={handleSelect}
        onBurstComplete={handleBurstComplete}
      />

      <div className="pointer-events-none relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-5 pb-24 pt-[96px] lg:pb-28 lg:pt-[108px]">
        <div className="home-copy flex w-full max-w-[440px] flex-col items-center text-center">
          {/* 标题与寄语：刻意做轻，不跟球抢视线 */}
          <motion.h1
            {...fade(0.2)}
            className="font-display text-[19px] font-light leading-[1.9] tracking-[0.16em] text-ink/55 sm:text-[23px] sm:leading-[1.85]"
          >
            让情绪有处安放
            <br />
            <span className="text-ink/40">让快乐有迹可循。</span>
          </motion.h1>

          <motion.p
            {...fade(0.45)}
            className="mt-5 text-[10.5px] leading-[2.1] tracking-[0.05em] text-ink-ghost/75 sm:text-[11px]"
          >
            {HOME_BLESSING_LINES.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </motion.p>

          <motion.div {...fade(0.68)} className="pointer-events-auto mt-7 sm:mt-8">
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
      </div>

      <p className="sr-only">{SLOGAN}</p>

      <EmotionPanel emotion={selectedEmotion} onClose={closePanel} onBurst={handleBurst} />
    </main>
  );
}
