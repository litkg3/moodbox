'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import { useToolOverlay } from '@/components/layout/tool-overlay-provider';
import { Button } from '@/components/ui/button';
import { EMOTION_MAP, pickMessage } from '@/lib/emotions';
import type { Emotion, EmotionId } from '@/types';
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
 * 题库。
 *
 * 不是任何一份量表 —— 没有计分标准，没有临床分级，也不产出"你有 X 分"。
 * 它只做一件事：把你说不清的那种感觉，落回到一颗具体的球上。
 *
 * 题目比一次测试要多（13 题抽 6 题）：常来的人不会每次都碰到同一套问题，
 * 也就不会因为"上次选过这个"而照着印象填。
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
  {
    id: 'body',
    question: '这会儿身体里，哪里最明显？',
    options: [
      { text: '肩颈绷着，松不下来', emotion: 'anxiety' },
      { text: '整个人是沉的，抬不动', emotion: 'exhaustion' },
      { text: '胸口或胃里堵着一团', emotion: 'wronged' },
      { text: '说不上来，好像没什么感觉', emotion: 'numbness' },
    ],
  },
  {
    id: 'night',
    question: '晚上躺下之后，通常是哪一种？',
    options: [
      { text: '很快就睡着了', emotion: 'joy' },
      { text: '翻来覆去，脑子停不下来', emotion: 'anxiety' },
      { text: '会突然很想哭', emotion: 'sadness' },
      { text: '盯着天花板，什么也没想', emotion: 'numbness' },
    ],
  },
  {
    id: 'someone',
    question: '最近有没有一个人，一想到就有点复杂？',
    options: [
      { text: '想见，又不太敢见', emotion: 'parting' },
      { text: '有点烦，说不上来为什么', emotion: 'irritation' },
      { text: '希望对方能主动找我一次', emotion: 'loneliness' },
      { text: '没有，最近挺好的', emotion: 'joy' },
    ],
  },
  {
    id: 'praise',
    question: '别人夸你的时候，你的第一反应是？',
    options: [
      { text: '觉得对方只是客气', emotion: 'wronged' },
      { text: '开心，但有点不自在', emotion: 'loneliness' },
      { text: '坦然收下，说声谢谢', emotion: 'joy' },
      { text: '想反驳，觉得自己不配', emotion: 'pain' },
    ],
  },
  {
    id: 'phone',
    question: '手机响的时候，你心里先冒出什么？',
    options: [
      { text: '希望是某个人', emotion: 'loneliness' },
      { text: '有点紧张，怕是不好的事', emotion: 'anxiety' },
      { text: '不太想回，先放着', emotion: 'numbness' },
      { text: '看是谁，没什么特别', emotion: 'joy' },
    ],
  },
  {
    id: 'effort',
    question: '你最近的那些努力，有人看见吗？',
    options: [
      { text: '没有，不过我也习惯了', emotion: 'wronged' },
      { text: '有，但我觉得还不够', emotion: 'exam' },
      { text: '我不太确定自己在努力什么', emotion: 'lost' },
      { text: '有人看见了，这就够了', emotion: 'joy' },
    ],
  },
  {
    id: 'tomorrow',
    question: '想到明天，更接近哪一种感觉？',
    options: [
      { text: '有点怕，希望它慢点来', emotion: 'anxiety' },
      { text: '都一样，没什么差别', emotion: 'numbness' },
      { text: '有一两件想做的事', emotion: 'joy' },
      { text: '只是觉得很累', emotion: 'exhaustion' },
    ],
  },
];

/** 一次做几题。题库再厚，一屏也只走六步。 */
const QUIZ_LENGTH = 6;

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

/** 上一次的结果存这里。刷新、下次进来都先看到它，除非自己点「重新做一次」。 */
const RESULT_KEY = 'moodbox:quiz-result:v1';

interface QuizResult {
  emotion: Emotion;
  score: number;
  runnersUp: Emotion[];
  message: string;
}

interface StoredResult {
  emotionId: EmotionId;
  score: number;
  runnersUp: EmotionId[];
  message: string;
  at: number;
}

function readStoredResult(): StoredResult | null {
  try {
    const raw = window.localStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredResult;
    if (!parsed?.emotionId || !EMOTION_MAP[parsed.emotionId]) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredResult(result: QuizResult): void {
  try {
    const payload: StoredResult = {
      emotionId: result.emotion.id,
      score: result.score,
      runnersUp: result.runnersUp.map((emotion) => emotion.id),
      message: result.message,
      at: Date.now(),
    };
    window.localStorage.setItem(RESULT_KEY, JSON.stringify(payload));
  } catch {
    // 存不下就只是下次要重做一遍，不影响这次结果
  }
}

function clearStoredResult(): void {
  try {
    window.localStorage.removeItem(RESULT_KEY);
  } catch {
    // 忽略
  }
}

/** 从题库里随机抽六题（Fisher–Yates，就地洗一副牌再取前六张）。 */
function pickQuestions(): QuizQuestion[] {
  const pool = [...QUESTIONS];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const a = pool[index];
    const b = pool[swap];
    if (a && b) {
      pool[index] = b;
      pool[swap] = a;
    }
  }
  return pool.slice(0, QUIZ_LENGTH);
}

/** 把六道题的答案折算成一颗球。 */
function scoreAnswers(answers: Record<string, EmotionId>): QuizResult | null {
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
}

export function QuizView() {
  /**
   * 三种状态：还没挂载（骨架）、有上次的结果（直接看）、正在做题。
   *
   * `ready` 之前不渲染题目 —— 题库是随机抽的，先渲染一套再换另一套会闪。
   */
  const [ready, setReady] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>(() =>
    QUESTIONS.slice(0, QUIZ_LENGTH),
  );
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, EmotionId>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const { openTool } = useToolOverlay();

  // 挂载后才知道该续上一次的结果，还是重新抽题
  useEffect(() => {
    const stored = readStoredResult();
    if (stored) {
      setResult({
        emotion: EMOTION_MAP[stored.emotionId],
        score: stored.score,
        runnersUp: (stored.runnersUp ?? [])
          .filter((id) => EMOTION_MAP[id])
          .map((id) => EMOTION_MAP[id]),
        message: stored.message,
      });
    } else {
      setQuestions(pickQuestions());
    }
    setReady(true);
  }, []);

  const total = questions.length;
  const question = questions[step];

  function choose(emotion: EmotionId) {
    if (!question) return;
    const nextAnswers = { ...answers, [question.id]: emotion };
    setAnswers(nextAnswers);
    if (step + 1 >= total) {
      const next = scoreAnswers(nextAnswers);
      if (next) {
        setResult(next);
        writeStoredResult(next);
      }
    } else {
      setStep(step + 1);
    }
  }

  function restart() {
    clearStoredResult();
    setResult(null);
    setAnswers({});
    setStep(0);
    setQuestions(pickQuestions());
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-[640px]" aria-hidden="true">
        <p className="text-[11px] uppercase tracking-[0.42em] text-ink-ghost">A Small Quiz</p>
        <div className="mt-4 h-8 w-[180px] animate-pulse rounded-full bg-white/40" />
        <div className="mt-3 h-4 w-full max-w-[420px] animate-pulse rounded-full bg-white/30" />
        <div className="mt-10 space-y-2.5">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-[54px] animate-pulse rounded-[18px] bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  if (result) {
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
          六个问题，每次从题库里换一组。没有对错，选最像的那个就好。
        </p>
      </header>

      {/*
        进度。

        原来是六段几乎同色的小横线：做完的和没做的分不出来，当前在第几段
        也看不出来。现在三种状态各有各的样子 ——
        做完的填满品牌色、当前这一段更高更亮、没做的留一道浅底。
      */}
      <div
        className="mb-6 flex items-end gap-2"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step + 1}
        aria-valuetext={`第 ${step + 1} 题，共 ${total} 题`}
      >
        {questions.map((item, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <span
              key={item.id}
              className={cn(
                'flex-1 rounded-full transition-all duration-500',
                done && 'h-[5px] bg-[linear-gradient(90deg,#c9b6e8,#8e76b8)]',
                current &&
                  'h-[5px] bg-[linear-gradient(90deg,#8e76b8,#c9b6e8)] shadow-[0_0_10px_-2px_rgba(142,118,184,0.9)]',
                !done && !current && 'h-[3px] bg-[rgba(141,133,152,0.16)]',
              )}
              aria-hidden="true"
            />
          );
        })}
      </div>

      <div className="mb-4 flex items-baseline justify-between gap-3">
        <span className="text-[11px] tracking-[0.16em] text-ink-ghost">
          第 {step + 1} / {total} 题
          {step > 0 && answers[questions[step - 1]?.id ?? ''] ? (
            <span className="ml-2 text-lavender-deep/80">上一题已经选好了</span>
          ) : null}
        </span>
        {/*
          返回入口一直都在，只是原来在第一题时整颗按钮不渲染，
          界面上就"没有返回"。现在换成常驻的「上一题」，第一题时置灰。
        */}
        <button
          type="button"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] transition-colors',
            step === 0
              ? 'cursor-default text-ink-ghost/50'
              : 'text-ink-faint hover:bg-white/60 hover:text-ink',
          )}
        >
          <ArrowLeft size={12} strokeWidth={1.7} aria-hidden="true" />
          上一题
        </button>
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
        做完会记住这次结果，下次进来先看到它；想重做随时可以。
      </p>
    </div>
  );
}
