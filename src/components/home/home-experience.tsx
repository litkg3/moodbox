'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, MessageCircleHeart, Wind } from 'lucide-react';
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
import { burstLine } from '@/lib/burst-lines';
import { getEmotion } from '@/lib/emotions';
import { moodBoxStore } from '@/lib/moodbox-store';
import type { Emotion, EmotionId } from '@/types';

/** 球碎掉之后，过多久自己飘回来。用户要求：两秒。 */
const RETURN_DELAY_MS = 2000;

/**
 * 首页 = 四整屏。
 *
 * 情绪天空 → 情绪转盘 → 人格详解 → 树洞广场。
 *
 * 翻页交给 CSS `scroll-snap-type: y mandatory`（html 上的 .mb-snap），
 * 不写 JS 拦截滚轮：浏览器的吸附本身就是"拖到一半、松手滑过去"的手感，
 * 而且滚动条、键盘、读屏、锚点全部免费拿到。
 *
 * 矮屏（< 560px 高，常见于横屏手机）不开吸附：那种高度里一屏装不下
 * 转盘，强吸会把人锁在半屏上，不如让它当普通长页面滚。
 */
const SCREENS = [
  { id: 'sky', label: '情绪天空' },
  { id: 'wheel', label: '情绪转盘' },
  { id: 'mbti', label: '人格详解' },
  { id: 'square', label: '树洞广场' },
] as const;

export function HomeExperience() {
  const [selectedEmotion, setSelectedEmotion] = useState<Emotion | null>(null);
  const [burstingId, setBurstingId] = useState<EmotionId | null>(null);
  const [activeScreen, setActiveScreen] = useState(0);
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

  /* ---------------- 整屏吸附 ---------------- */
  useEffect(() => {
    const query = window.matchMedia('(min-height: 560px)');
    const root = document.documentElement;
    const sync = () => root.classList.toggle('mb-snap', query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => {
      query.removeEventListener('change', sync);
      root.classList.remove('mb-snap');
    };
  }, []);

  /* 当前在哪一屏：比例最大的那一屏。只影响导航圆点的高亮。 */
  useEffect(() => {
    const nodes = SCREENS.map((screen) => document.getElementById(screen.id));
    const ratios = new Map<Element, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let best = -1;
        let bestRatio = 0.2;
        nodes.forEach((node, index) => {
          if (!node) return;
          const ratio = ratios.get(node) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = index;
          }
        });
        if (best >= 0) setActiveScreen(best);
      },
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    );

    nodes.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const goToScreen = useCallback((index: number) => {
    const target = SCREENS[index];
    if (!target) return;
    const el = document.getElementById(target.id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, []);

  /*
   * 某一屏内部自己还能滚（手机端的人格详解）时，先把整页的强制吸附摘掉。
   *
   * 不摘会怎样：滚轮滚到内层底部后会直接穿透到整页，一次滑过两三屏 ——
   * 因为 snap-stop 只约束"一个滚动容器之内"的位移。
   * 摘掉之后，内层滚到底、再滚一下才翻到下一屏；离开这一屏（或内层已经到底）
   * 就立刻挂回来，保住一滑一屏的手感。
   */
  useEffect(() => {
    const root = document.documentElement;
    const scrollers = Array.from(document.querySelectorAll<HTMLElement>('[data-screen-scroll]'));
    if (scrollers.length === 0) return;

    let detachTimer = 0;

    const canScroll = (el: HTMLElement) => el.scrollHeight - el.clientHeight > 4;

    const innerAtEdge = (el: HTMLElement) =>
      el.scrollTop <= 1 || el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

    /** 当前这一屏里还有没滚完的内层容器吗 */
    const blockedByInner = () => {
      const active = document.getElementById(SCREENS[activeScreen]?.id ?? '');
      const inner = active?.querySelector<HTMLElement>('[data-screen-scroll]');
      return Boolean(inner && canScroll(inner) && !innerAtEdge(inner));
    };

    const sync = () => {
      window.clearTimeout(detachTimer);
      const detach = blockedByInner();
      root.classList.toggle('mb-snap-inner', detach);
      /*
       * 离开内层边界后不要立刻挂回：滚轮还会继续派发一两次事件，
       * 那时吸附已经回来了，人会感觉"卡了一下"。等手停下来再挂。
       */
      if (!detach) {
        detachTimer = window.setTimeout(() => root.classList.remove('mb-snap-inner'), 260);
      }
    };

    const onInnerScroll = (event: Event) => {
      const el = event.currentTarget as HTMLElement;
      if (el.scrollHeight - el.clientHeight <= 4) return;
      sync();
    };

    scrollers.forEach((el) => el.addEventListener('scroll', onInnerScroll, { passive: true }));
    const observer = new IntersectionObserver(sync, { threshold: [0, 0.5, 1] });
    document.querySelectorAll('.mb-screen').forEach((node) => observer.observe(node));

    sync();
    return () => {
      window.clearTimeout(detachTimer);
      scrollers.forEach((el) => el.removeEventListener('scroll', onInnerScroll));
      observer.disconnect();
      root.classList.remove('mb-snap-inner');
    };
  }, [activeScreen]);

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

        <div className="pointer-events-none relative z-10 flex h-full flex-col items-center justify-center px-5 pb-24 pt-[96px] lg:pb-28 lg:pt-[108px]">
          <div className="home-copy pointer-events-auto relative flex w-full max-w-[440px] flex-col items-center text-center">
            <h1 className="mb-reveal flex flex-col items-center">
              <span className="home-title-brand font-display text-[26px] font-light leading-none tracking-[0.2em] text-ink/85 sm:text-[32px]">
                MoodBox
              </span>
              <span className="home-title-invite mt-4 font-display text-[15px] font-light leading-[1.9] tracking-[0.16em] text-ink/70 sm:mt-5 sm:text-[17.5px] lg:mt-3.5">
                点开一颗情绪球！
              </span>
            </h1>

            <p
              className="mb-reveal mt-5 text-[10.5px] leading-[2.1] tracking-[0.05em] text-ink-faint/90 sm:text-[11px] lg:mt-4"
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

      <ScrollScreen id="square" label="树洞广场" className="mb-closing">
        <div className="mb-closing-inner">
          <h2 className="mb-reveal mb-closing-title">
            有些话说不出口，
            <br />
            可以先放进树洞
          </h2>
          <p className="mb-reveal mb-closing-copy" data-delay="1">
            那里有人写下今天的一点小崩溃，也有人回一句「我也是」。
            <br />
            不必署名，也不必解释。
          </p>
          <div className="mb-reveal mb-closing-actions" data-delay="2">
            <Link href="/square" prefetch={false} onClick={enterSquare} className="mb-btn-warm">
              <MessageCircleHeart size={15} strokeWidth={1.6} aria-hidden="true" />
              去树洞广场
            </Link>
            <Link href="/breathe" className="mb-btn-ghost">
              <Wind size={15} strokeWidth={1.6} aria-hidden="true" />
              呼吸放松
            </Link>
          </div>
          <p className="mb-reveal mb-closing-note" data-delay="3">
            所有记录只保存在你的浏览器本地
          </p>
        </div>
      </ScrollScreen>

      <ScreenDots items={SCREENS} active={activeScreen} onSelect={goToScreen} />

      <p className="sr-only">{SLOGAN}</p>

      <EmotionPanel emotion={selectedEmotion} onClose={closePanel} onBurst={handleBurst} />
    </main>
  );
}
