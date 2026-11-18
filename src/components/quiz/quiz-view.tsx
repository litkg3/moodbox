'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import { useToolOverlay } from '@/components/layout/tool-overlay-provider';
import { Button } from '@/components/ui/button';
import { EMOTION_MAP, pickMessage } from '@/lib/emotions';
import type { EmotionId } from '@/types';
import { cn } from '@/lib/utils';

interface QuizOption {
  text: string;
  emotion: EmotionId;
}

interface QuizQuestion {
  id: string;
  question: string;
  options: QuizOption[];
}

/**
 * 六个问题。
 *
 * 这不是任何一份量表 —— 没有计分标准，没有临床分级，也不产出"你有 X 分"。
 * 它只做一件事：把你说不清的那种感觉，落回到一颗具体的球上。
 */
const QUESTIONS: readonly QuizQuestion[] = [
  {
    id: 'wake',
    question: '这两天睁开眼，第一个感觉更接近哪一种？',
    options: [
      { text: '有点提不起劲，像被按住了', emotion: 'exhaustion' },
      { text: '心里悬着，好像有事没做完', emotion: 'anxiety' },
      { text: '空落落的，说不上来', emotion: 'loneliness' },
      { text: '还行，甚至有点期待今天', emotion: 'joy' },
    ],
  },
  {
    id: 'tired',
    question: '最近最消耗你的，是下面哪一类？',
    options: [
      { text: '事情太多，一直做不完', emotion: 'exam' },
      { text: '和人的相处，说不上哪里不对', emotion: 'irritation' },
      { text: '说不清，就是累', emotion: 'exhaustion' },
      { text: '其实还好，没什么特别磨人的', emotion: 'joy' },
    ],
  },
  {
    id: 'hour',
    question: '如果现在多出一小时，完全属于你，你想做什么？',
    options: [
      { text: '睡一觉，什么都不想', emotion: 'exhaustion' },
      { text: '找个人说说话', emotion: 'loneliness' },
      { text: '一个人待着，谁也不理', emotion: 'numbness' },
      { text: '出门走走，看看外面', emotion: 'joy' },
    ],
  },
  {
    id: 'laugh',
    question: '最近一次真的笑出来，是什么时候？',
    options: [
      { text: '今天就有', emotion: 'joy' },
      { text: '记不太清了', emotion: 'lost' },
      { text: '笑过，但心里没跟上', emotion: 'sadness' },
      { text: '不想笑，笑不出来', emotion: 'pain' },
    ],
  },
  {
    id: 'words',
    question: '如果现在有人在旁边，你最想听到哪一句话？',
    options: [
      { text: '你已经做得很好了', emotion: 'exhaustion' },
      { text: '我在，你不用一个人', emotion: 'loneliness' },
      { text: '会过去的，我知道现在很难', emotion: 'sadness' },
      { text: '想他的时候，就好好想一会儿', emotion: 'parting' },
    ],
  },
  {
    id: 'drop',
    question: '如果今晚可以丢掉一样东西，你想丢哪个？',
    options: [
      { text: '那种一直悬着的感觉', emotion: 'anxiety' },
      { text: '脑子里翻来覆去的念头', emotion: 'irritation' },
      { text: '身体里那股沉甸甸的累', emotion: 'exhaustion' },
      { text: '暂时不想丢什么', emotion: 'joy' },
    ],
  },
];

type Suggestion = { label: string; href?: string; tool?: 'jar' | 'letters' };

const SUGGESTIONS: Record<EmotionId, Suggestion[]> = {
  anxiety: [
    { label: '呼吸放松', href: '/breathe' },
    { label: '心事信箱', tool: 'letters' },
  ],
  sadness: [
    { label: '树洞广场', href: '/square' },
    { label: '开心罐', tool: 'jar' },
  ],
  loneliness: [
    { label: '树洞广场', href: '/square' },
    { label: '心事信箱', tool: 'letters' },
  ],
  joy: [
    { label: '开心罐', tool: 'jar' },
    { label: '情绪周报', href: '/calendar' },
  ],
  pain: [
    { label: '树洞广场', href: '/square' },
    { label: '心事信箱', tool: 'letters' },
  ],
  exam: [
    { label: '呼吸放松', href: '/breathe' },
    { label: '情绪周报', href: '/calendar' },
  ],
  irritation: [
    { label: '回主页捏爆一颗球', href: '/' },
    { label: '呼吸放松', href: '/breathe' },
  ],
  exhaustion: [
    { label: '呼吸放松', href: '/breathe' },
    { label: '心事信箱', tool: 'letters' },
  ],
  lost: [
    { label: '树洞广场', href: '/square' },
    { label: '情绪周报', href: '/calendar' },
  ],
  wronged: [
    { label: '心事信箱', tool: 'letters' },
    { label: '树洞广场', href: '/square' },
  ],
  numbness: [
    { label: '呼吸放松', href: '/breathe' },
    { label: '心事信箱', tool: 'letters' },
  ],
  parting: [
    { label: '心事信箱', tool: 'letters' },
    { label: '树洞广场', href: '/square' },
  ],
};

/** 平票时的优先级：越"需要被照看"的越靠前 */
const TIE_BREAK: readonly EmotionId[] = [
  'pain',
  'sadness',
  'parting',
  'loneliness',
  'anxiety',
  'exhaustion',
  'numbness',
  'exam',
  'irritation',
  'joy',
];

export function QuizView() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, EmotionId>>({});
  const [finished, setFinished] = useState(false);
  const { openTool } = useToolOverlay();

  const total = QUESTIONS.length;
  const question = QUESTIONS[step];

  const result = useMemo(() => {
    if (!finished) return null;
    const counts = new Map<EmotionId, number>();
    for (const emotion of Object.values(answers)) {
      counts.set(emotion, (counts.get(emotion) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return TIE_BREAK.indexOf(a[0]) - TIE_BREAK.indexOf(b[0]);
    });
    const top = ranked[0];
    if (!top) return null;
    const emotion = EMOTION_MAP[top[0]];
    return {
      emotion,
      score: top[1],
      runnersUp: ranked.slice(1, 3).map(([id]) => EMOTION_MAP[id]),
      message: pickMessage(emotion.messages).message,
    };
  }, [answers, finished]);

  function choose(emotion: EmotionId) {
    if (!question) return;
    const nextAnswers = { ...answers, [question.id]: emotion };
    setAnswers(nextAnswers);
    if (step + 1 >= total) {
      setFinished(true);
    } else {
      setStep(step + 1);
    }
  }

  function restart() {
    setStep(0);
    setAnswers({});
    setFinished(false);
  }

  if (finished && result) {
    return (
      <div className="mx-auto max-w-[640px]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-[11px] uppercase tracking-[0.42em] text-ink-ghost">Result</p>
          <h1 className="mt-3 font-display text-[26px] font-light leading-tight tracking-[0.06em] text-ink sm:text-[32px]">
            此刻更接近「{result.emotion.label}」
          </h1>

          <div className="mt-6 flex items-center gap-4">
            <span
              aria-hidden="true"
              className="h-14 w-14 shrink-0 rounded-full shadow-[0_14px_30px_-18px_rgba(70,55,92,0.9)]"
              style={{
                background: `radial-gradient(120% 120% at 30% 22%, #ffffff 0%, ${result.emotion.palette.mid} 55%, ${result.emotion.palette.deep} 100%)`,
              }}
            />
            <p className="text-[13px] leading-[1.9] text-ink-faint">{result.emotion.whisper}</p>
          </div>

          <div className="mb-surface mt-7 rounded-[24px] p-6 sm:p-7">
            <p className="text-pretty font-display text-[15px] font-light leading-[2.15] text-ink sm:text-[16px]">
              {result.message}
            </p>
          </div>

          {result.runnersUp.length > 0 ? (
            <p className="mt-4 text-[11.5px] text-ink-ghost">
              另外也有一点
              {result.runnersUp.map((emotion) => `「${emotion.label}」`).join('和')}
              的意思 —— 情绪本来就不止一种。
            </p>
          ) : null}

          <div className="mt-7 flex flex-wrap gap-2">
            {SUGGESTIONS[result.emotion.id].map((item) => {
              const className =
                'mb-btn-primary inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] transition-all duration-500';
              const inner = (
                <>
                  {item.label}
                  <ArrowRight size={13} strokeWidth={1.7} aria-hidden="true" />
                </>
              );

              if (item.tool) {
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => openTool(item.tool!)}
                    className={className}
                  >
                    {inner}
                  </button>
                );
              }

              return (
                <Link key={item.label} href={item.href ?? '/'} className={className}>
                  {inner}
                </Link>
              );
            })}
            <Button variant="glass" size="sm" onClick={restart}>
              <RefreshCw size={13} strokeWidth={1.7} />
              重新做一次
            </Button>
          </div>

          <p className="mt-8 rounded-2xl border border-white/60 bg-white/40 px-4 py-3.5 text-[11.5px] leading-[1.9] text-ink-faint">
            这只是六个问题凑出来的一个猜测，不是心理测评，也不构成任何诊断。
            如果你觉得它说得不对，那就不对 —— 你比这六个问题更了解自己。
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px]">
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.42em] text-ink-ghost">A Small Quiz</p>
        <h1 className="mt-3 font-display text-[26px] font-light leading-tight tracking-[0.06em] text-ink sm:text-[34px]">
          情绪测试
        </h1>
        <p className="mt-3 max-w-[46ch] text-pretty text-[13.5px] leading-[1.9] text-ink-faint sm:text-sm">
          六个问题，帮你把此刻的感觉说得更清楚一点。没有对错，选最像的那个就好。
        </p>
      </header>

      {/* 进度 */}
      <div className="mb-7 flex items-center gap-2" aria-hidden="true">
        {QUESTIONS.map((item, index) => (
          <span
            key={item.id}
            className={cn(
              'h-[3px] flex-1 rounded-full transition-colors duration-500',
              index < step || (finished && index === total - 1)
                ? 'bg-[rgba(142,118,184,0.65)]'
                : index === step
                  ? 'bg-[rgba(201,182,232,0.7)]'
                  : 'bg-[rgba(141,133,152,0.18)]',
            )}
          />
        ))}
      </div>

      <div className="mb-4 flex items-baseline justify-between">
        <span className="text-[11px] tracking-[0.16em] text-ink-ghost">
          第 {step + 1} / {total} 题
        </span>
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="inline-flex items-center gap-1 text-[11.5px] text-ink-faint transition-colors hover:text-ink"
          >
            <ArrowLeft size={12} strokeWidth={1.7} aria-hidden="true" />
            上一题
          </button>
        ) : null}
      </div>

      <AnimatePresence mode="wait">
        {question ? (
          <motion.div
            key={question.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="font-display text-[19px] font-light leading-[1.8] tracking-[0.04em] text-ink sm:text-[22px]">
              {question.question}
            </h2>

            <ul className="mt-6 space-y-2.5">
              {question.options.map((option) => (
                <li key={option.text}>
                  <button
                    type="button"
                    onClick={() => choose(option.emotion)}
                    className="group flex w-full items-center justify-between gap-4 rounded-[18px] border border-white/65 bg-white/45 px-5 py-4 text-left transition-all duration-400 hover:-translate-y-0.5 hover:border-[rgba(201,182,232,0.6)] hover:bg-white/70"
                  >
                    <span className="text-[13.5px] leading-[1.8] text-ink-soft group-hover:text-ink">
                      {option.text}
                    </span>
                    <ArrowRight
                      size={14}
                      strokeWidth={1.6}
                      aria-hidden="true"
                      className="shrink-0 text-ink-ghost transition-transform duration-400 group-hover:translate-x-0.5 group-hover:text-lavender-deep"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p className="mt-9 flex items-center gap-2 text-[11.5px] leading-[1.9] text-ink-ghost">
        <Sparkles size={12} strokeWidth={1.6} aria-hidden="true" />
        结果只保存在当前页面，不会写入你的任何记录。
      </p>
    </div>
  );
}
