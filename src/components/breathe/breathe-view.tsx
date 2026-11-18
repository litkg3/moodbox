'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Pause, Play, RotateCcw, Wind } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreathPhase {
  key: 'inhale' | 'hold' | 'exhale';
  label: string;
  seconds: number;
}

interface BreathMode {
  key: 'calm' | 'sleep';
  label: string;
  hint: string;
  phases: BreathPhase[];
}

const MODES: readonly BreathMode[] = [
  {
    key: 'calm',
    label: '舒缓呼吸',
    hint: '吸 4 秒 · 停 4 秒 · 呼 6 秒',
    phases: [
      { key: 'inhale', label: '吸气', seconds: 4 },
      { key: 'hold', label: '停留', seconds: 4 },
      { key: 'exhale', label: '呼气', seconds: 6 },
    ],
  },
  {
    key: 'sleep',
    label: '助眠呼吸',
    hint: '吸 4 秒 · 停 7 秒 · 呼 8 秒',
    phases: [
      { key: 'inhale', label: '吸气', seconds: 4 },
      { key: 'hold', label: '停留', seconds: 7 },
      { key: 'exhale', label: '呼气', seconds: 8 },
    ],
  },
];

/**
 * 呼吸放松。
 *
 * 认输的时刻永远是"呼气"。所以圆环的节奏是：
 * 吸气时长大，停留时不动，呼气时缩回去 —— 让身体先学会这件事。
 *
 * 实现上刻意不用逐帧 React 渲染：圆环的缩放交给 CSS transition，
 * JS 只每 200ms 校正一次剩余秒数，并且只有数字真的变了才 setState。
 */
export function BreatheView() {
  const [modeKey, setModeKey] = useState<BreathMode['key']>('calm');
  const mode = useMemo(() => MODES.find((item) => item.key === modeKey) ?? MODES[0]!, [modeKey]);

  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [remaining, setRemaining] = useState(mode.phases[0]!.seconds);
  const [cycles, setCycles] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const reduceMotion = useReducedMotion();

  const phase = mode.phases[phaseIndex] ?? mode.phases[0]!;
  const phaseRef = useRef(phaseIndex);
  phaseRef.current = phaseIndex;
  /** 累计秒数放在 ref 里，只在跨过整秒时才写进 state，避免每 200ms 渲染一次 */
  const totalRef = useRef(0);

  const reset = useCallback((nextMode: BreathMode) => {
    setRunning(false);
    setPhaseIndex(0);
    setRemaining(nextMode.phases[0]!.seconds);
    setCycles(0);
    totalRef.current = 0;
    setTotalSeconds(0);
  }, []);

  useEffect(() => {
    if (!running) return;

    let startedAt = performance.now();
    const phaseSeconds = mode.phases[phaseRef.current]!.seconds;

    const timer = window.setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const left = Math.max(0, Math.ceil(phaseSeconds - elapsed));

      setRemaining((prev) => (prev === left ? prev : left));

      totalRef.current += 0.2;
      const whole = Math.floor(totalRef.current);
      setTotalSeconds((prev) => (prev === whole ? prev : whole));

      if (elapsed >= phaseSeconds) {
        startedAt = performance.now();
        setPhaseIndex((prev) => {
          const next = (prev + 1) % mode.phases.length;
          if (next === 0) setCycles((count) => count + 1);
          setRemaining(mode.phases[next]!.seconds);
          return next;
        });
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [running, mode, phaseIndex]);

  function changeMode(next: BreathMode) {
    setModeKey(next.key);
    reset(next);
  }

  const scale = !running
    ? 0.82
    : phase.key === 'inhale'
      ? 1
      : phase.key === 'hold'
        ? 1
        : 0.66;

  const duration = !running ? 1.2 : phase.seconds;

  return (
    <div>
      <header className="mb-8 max-w-[600px] sm:mb-10">
        <p className="text-[11px] uppercase tracking-[0.42em] text-ink-ghost">Breathe</p>
        <h1 className="mt-3 font-display text-[26px] font-light leading-tight tracking-[0.06em] text-ink sm:text-[34px]">
          呼吸放松
        </h1>
        <p className="mt-3 max-w-[46ch] text-pretty text-[13.5px] leading-[1.9] text-ink-faint sm:text-sm">
          跟着圆环走几十秒。不用做得很标准，走神了也没关系，回来就好。
        </p>
      </header>

      <div className="flex flex-col items-center">
        {/* 模式切换 */}
        <div className="mb-10 flex items-center gap-1.5 rounded-full border border-white/60 bg-white/40 p-1">
          {MODES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => changeMode(item)}
              aria-pressed={modeKey === item.key}
              className={cn(
                'rounded-full px-4 py-1.5 text-[12px] tracking-[0.04em] transition-all duration-500',
                modeKey === item.key ? 'mb-pill-active' : 'text-ink-faint hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 圆环 */}
        <div className="relative grid h-[268px] w-[268px] place-items-center sm:h-[320px] sm:w-[320px]">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-[rgba(201,182,232,0.28)]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-[10%] rounded-full border border-dashed border-[rgba(159,179,206,0.3)]"
          />

          <div
            aria-hidden="true"
            className="mb-breath-orb absolute inset-[16%] rounded-full"
            style={{
              transform: `scale(${scale})`,
              transition: reduceMotion
                ? 'none'
                : `transform ${duration}s cubic-bezier(0.37, 0, 0.32, 1)`,
            }}
          />

          <div className="relative z-10 flex flex-col items-center">
            <span className="mb-breath-label text-[10.5px] uppercase tracking-[0.4em] text-ink-ghost">
              {running ? phase.label : '准备好'}
            </span>
            <span
              className="mt-2 font-display text-[38px] font-light leading-none tabular-nums text-ink sm:text-[44px]"
              aria-hidden="true"
            >
              {running ? remaining : '—'}
            </span>
            <span className="mb-breath-hint mt-2 text-[10.5px] tracking-[0.14em] text-ink-faint">
              {running ? '秒' : mode.hint}
            </span>
          </div>
        </div>

        {/* 控制 */}
        <div className="mt-9 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRunning((prev) => !prev)}
            className="mb-btn-primary inline-flex h-11 items-center gap-2 rounded-full px-6 text-[13px] tracking-[0.05em] transition-all duration-500 active:scale-[0.98]"
          >
            {running ? (
              <>
                <Pause size={15} strokeWidth={1.7} aria-hidden="true" />
                先停一下
              </>
            ) : (
              <>
                <Play size={15} strokeWidth={1.7} aria-hidden="true" />
                开始
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => reset(mode)}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-white/60 bg-white/40 px-4 text-[12.5px] text-ink-faint transition-colors hover:text-ink"
          >
            <RotateCcw size={14} strokeWidth={1.7} aria-hidden="true" />
            重来
          </button>
        </div>

        <div className="mt-7 flex items-center gap-5 text-[11.5px] text-ink-faint">
          <span>
            完成 <span className="tabular-nums text-ink">{cycles}</span> 轮
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-[rgba(141,133,152,0.24)]" />
          <span>
            已经坐了 <span className="tabular-nums text-ink">{Math.floor(totalSeconds)}</span> 秒
          </span>
        </div>

        {/* 屏幕阅读器友好的阶段播报：只在阶段切换时更新 */}
        <p role="status" aria-live="polite" className="sr-only">
          {running ? `现在是${phase.label}，${phase.seconds} 秒` : '呼吸练习未开始'}
        </p>
      </div>

      <div className="mx-auto mt-14 max-w-[560px] space-y-4">
        <div className="flex gap-3 rounded-2xl border border-white/60 bg-white/40 px-4 py-3.5">
          <Wind
            size={15}
            strokeWidth={1.5}
            className="mt-[3px] shrink-0 text-ink-ghost"
            aria-hidden="true"
          />
          <p className="text-[11.5px] leading-[1.9] text-ink-faint">
            呼吸练习不能替代治疗。如果你在练习中感到头晕、心慌或不适，随时停下来，
            用自己平常的节奏呼吸就好。
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center text-[12px] leading-[1.9] text-ink-ghost"
        >
          呼气比吸气长一点，身体会更容易收到「现在可以放松」的信号。
        </motion.div>
      </div>
    </div>
  );
}
