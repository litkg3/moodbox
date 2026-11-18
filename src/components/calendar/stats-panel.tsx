'use client';

import { EMOTION_MAP } from '@/lib/emotions';
import type { MonthStats } from '@/lib/stats';

/** 轻量统计：只做回顾，不做“诊断”。 */
export function StatsPanel({ stats, hasDemo }: { stats: MonthStats; hasDemo: boolean }) {
  const totalLogs = stats.emotionCounts.reduce((sum, item) => sum + item.count, 0);
  const maxCount = Math.max(1, ...stats.emotionCounts.map((item) => item.count));
  const topEmotion = stats.topEmotion ? EMOTION_MAP[stats.topEmotion] : null;

  return (
    <div className="space-y-4">
      <div className="mb-surface rounded-[24px] p-5 sm:p-6">
        <h3 className="text-[11px] uppercase tracking-[0.32em] text-ink-ghost">This Month</h3>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
          <Stat value={String(stats.recordedDays)} unit="天" label="有记录的日子" />
          <Stat value={String(stats.memoryCount)} unit="份" label="快乐记忆" />
          <Stat value={String(totalLogs)} unit="次" label="情绪记录" />
          <Stat value={topEmotion?.label ?? '—'} label="最常出现" accent={topEmotion?.palette.ink} />
        </div>
        {stats.recordedDays === 0 && stats.memoryCount === 0 ? (
          <p className="mt-5 text-[11.5px] leading-[1.85] text-ink-ghost">
            这个月还没有记录。什么时候想写，再写就好。
          </p>
        ) : null}
      </div>

      <div className="rounded-[24px] border border-white/70 bg-white/40 p-5 sm:p-6">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.32em] text-ink-ghost">Emotions</h3>
          <span className="text-[10px] text-ink-ghost/80">本月</span>
        </div>

        {stats.emotionCounts.length === 0 ? (
          <p className="mt-4 text-[11.5px] leading-[1.85] text-ink-ghost">
            记录过的心情会在这里慢慢积累。
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {stats.emotionCounts.slice(0, 5).map((item) => {
              const emotion = EMOTION_MAP[item.id];
              if (!emotion) return null;
              return (
                <li key={item.id} className="flex items-center gap-3">
                  <span className="w-9 shrink-0 text-[11.5px] tracking-[0.04em] text-ink-soft">
                    {emotion.label}
                  </span>
                  <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-white/70">
                    <span
                      className="block h-full rounded-full transition-[width] duration-700"
                      style={{
                        width: `${Math.max(6, (item.count / maxCount) * 100)}%`,
                        background: `linear-gradient(90deg, ${emotion.palette.mid}, ${emotion.palette.deep})`,
                      }}
                    />
                  </span>
                  <span className="w-5 shrink-0 text-right text-[10.5px] tabular-nums text-ink-ghost">
                    {item.count}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 近七日已并入页面底部的「这一周」，这里不再重复 */}
    </div>
  );
}

function Stat({
  value,
  unit,
  label,
  accent,
}: {
  value: string;
  unit?: string;
  label: string;
  accent?: string;
}) {
  return (
    <div>
      <p className="flex items-baseline gap-1">
        <span
          className="font-display text-[24px] font-light leading-none tabular-nums tracking-[0.02em] text-ink"
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </span>
        {unit ? <span className="text-[10.5px] text-ink-ghost">{unit}</span> : null}
      </p>
      <p className="mt-1.5 text-[10.5px] tracking-[0.06em] text-ink-ghost">{label}</p>
    </div>
  );
}
