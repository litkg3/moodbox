'use client';

import { useMemo } from 'react';
import { subDays } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { useToolOverlay } from '@/components/layout/tool-overlay-provider';
import { EMOTIONS } from '@/data/emotions';
import { EMOTION_MAP, normalizeEmotionId } from '@/lib/emotions';
import { useMoodBox } from '@/hooks/use-moodbox';
import { parseDateKey, toDateKey, todayKey } from '@/lib/date';
import type { EmotionId } from '@/types';

/** 近七日。日期键按本地时区生成，和情绪记录用的是同一套口径。 */
function buildRange(): string[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => toDateKey(subDays(today, 6 - index)));
}

const WEEKDAY_INITIALS = ['日', '一', '二', '三', '四', '五', '六'] as const;

function weekdayLabel(key: string): string {
  if (key === todayKey()) return '今天';
  const date = parseDateKey(key);
  return date ? WEEKDAY_INITIALS[date.getDay()] ?? '' : '';
}

/**
 * 近七日小结。
 *
 * 原来是独立的「情绪周报」页面，现在并进情绪足迹的底部 ——
 * 月视图管「这个月」，这一段管「这七天」，两者本来就在回答同一个问题：
 * 我都经历了什么。页面上不再需要一个额外的导航入口。
 */
export function WeeklySummary() {
  const { emotionLogs, memories, status } = useMoodBox();
  const { openTool } = useToolOverlay();

  const model = useMemo(() => {
    const range = buildRange();
    const inRange = new Set(range);

    const logs = emotionLogs.filter((log) => inRange.has(log.date));
    const weekMemories = memories.filter((memory) => !memory.isDemo && inRange.has(memory.date));

    const byDay = range.map((date) => ({
      date,
      count: logs.filter((log) => log.date === date).length,
    }));

    const counter = new Map<EmotionId, number>();
    for (const log of logs) {
      // 已下线的球（EMO / 担心）按最接近的现存情绪计入，旧记录不会凭空消失
      const id = normalizeEmotionId(log.emotionId);
      counter.set(id, (counter.get(id) ?? 0) + 1);
    }
    const ranked = [...counter.entries()].sort((a, b) => b[1] - a[1]);
    const maxDay = Math.max(1, ...byDay.map((day) => day.count));

    return {
      range,
      logs,
      byDay,
      ranked,
      maxDay,
      recordedDays: byDay.filter((day) => day.count > 0).length,
      memoryCount: weekMemories.length,
      top: ranked[0] ?? null,
    };
  }, [emotionLogs, memories]);

  const loading = status === 'idle' || status === 'loading';
  const topEmotion = model.top ? EMOTION_MAP[model.top[0]] : null;

  return (
    <section aria-labelledby="weekly-summary-title" className="mt-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] uppercase tracking-[0.4em] text-ink-ghost">Last 7 days</p>
          <h2
            id="weekly-summary-title"
            className="mt-2 font-display text-[19px] font-light tracking-[0.08em] text-ink sm:text-[21px]"
          >
            这一周
          </h2>
          <p className="mt-2 max-w-[52ch] text-[12.5px] leading-[1.9] text-ink-faint">
            只看你主动记下来的东西。没记录的那几天就当它没发生过 ——
            这里不做任何心情推断，也不会给你打分。
          </p>
        </div>
        <button
          type="button"
          onClick={() => openTool('jar')}
          className="mb-glass-soft inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] text-ink-soft transition-colors hover:text-ink"
        >
          收藏今天的一件小事
        </button>
      </header>

      {loading ? (
        <div className="space-y-4">
          <div className="h-[120px] animate-pulse rounded-[24px] border border-white/50 bg-white/30" />
          <div className="h-[180px] animate-pulse rounded-[24px] border border-white/50 bg-white/30" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* 三个数字 */}
          <section className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="记录了情绪的天数"
              value={model.recordedDays}
              unit="天"
              detail={`共 ${model.logs.length} 次`}
            />
            <StatCard label="新收进来的快乐" value={model.memoryCount} unit="份" detail="这七天" />
            <StatCard
              label="最常出现的情绪"
              value={topEmotion ? topEmotion.label : '—'}
              detail={model.top ? `${model.top[1]} 次` : '还没有记录'}
              tint={topEmotion?.palette.mid}
            />
          </section>

          {/* 七日分布 */}
          <section className="mb-surface rounded-[24px] p-6 sm:p-7">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[13px] tracking-[0.1em] text-ink">近七日</h3>
              <p className="text-[11px] text-ink-ghost">每根柱子 = 当天记下的情绪次数</p>
            </div>

            <div className="mt-6 flex items-end justify-between gap-2 sm:gap-3">
              {model.byDay.map((day) => {
                const ratio = day.count / model.maxDay;
                return (
                  <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-[92px] w-full items-end justify-center">
                      <div
                        className="w-full max-w-[34px] rounded-t-[8px] bg-[linear-gradient(180deg,rgba(201,182,232,0.85),rgba(159,179,206,0.5))] transition-[height] duration-700"
                        style={{ height: day.count === 0 ? 3 : `${Math.max(10, ratio * 100)}%` }}
                        aria-hidden="true"
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-ink">
                      {day.count > 0 ? day.count : ''}
                    </span>
                    <span className="text-[10px] text-ink-ghost">{weekdayLabel(day.date)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 情绪构成 */}
          {model.ranked.length > 0 ? (
            <section className="mb-surface rounded-[24px] p-6 sm:p-7">
              <h3 className="text-[13px] tracking-[0.1em] text-ink">这些天出现过的情绪</h3>
              <ul className="mt-5 space-y-3">
                {model.ranked.map(([emotionId, count]) => {
                  const emotion = EMOTION_MAP[emotionId];
                  if (!emotion) return null;
                  const ratio = count / model.logs.length;
                  return (
                    <li key={emotionId} className="flex items-center gap-3">
                      <span className="w-10 shrink-0 text-[12px] text-ink-soft">{emotion.label}</span>
                      <span className="relative h-[7px] flex-1 overflow-hidden rounded-full bg-[rgba(141,133,152,0.14)]">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                          style={{
                            width: `${Math.max(4, ratio * 100)}%`,
                            background: `linear-gradient(90deg, ${emotion.palette.mid}, ${emotion.palette.deep})`,
                          }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-ink-faint">
                        {count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* 一段人话 */}
          <section className="mb-surface rounded-[24px] p-6 sm:p-8">
            <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.36em] text-ink-ghost">
              <Sparkles size={12} strokeWidth={1.6} aria-hidden="true" />
              写给你
            </div>
            <div className="mt-4 space-y-3 text-pretty text-[13.5px] leading-[2.05] text-ink-soft">
              {model.recordedDays === 0 ? (
                <>
                  <p>这七天里，你没有记下任何情绪。这也是可以的 —— 有些日子本来就不想被记录。</p>
                  <p className="text-[12.5px] text-ink-faint">
                    如果哪天突然想说点什么，回到主页捏一颗球就行。
                  </p>
                </>
              ) : (
                <>
                  <p>
                    这七天里，你有 {model.recordedDays} 天停下来看了看自己。
                    {model.recordedDays >= 5
                      ? '这个频率不算低，说明你对自己还挺在意的。'
                      : '不一定要天天记录，想起来的时候记一笔就够了。'}
                  </p>
                  {topEmotion ? (
                    <p>
                      出现最多的是「{topEmotion.label}」。
                      {topEmotion.whisper} —— 如果这七天它来得比较频繁，
                      或许值得给它留一点单独的时间，而不是一直压着。
                    </p>
                  ) : null}
                  <p>
                    {model.memoryCount > 0
                      ? `另外，你还收进了 ${model.memoryCount} 份快乐。它们现在都在罐子里，低落的时候可以拿出来用。`
                      : '这七天没有新的快乐被收藏。也不是坏事，可能只是还没顾上。'}
                  </p>
                </>
              )}
            </div>
          </section>

          <p className="px-1 text-[11px] leading-[1.9] text-ink-ghost">
            这里的数字只统计你主动保存的记录，不会读取其它信息，也不构成任何心理健康评估。
            参考的情绪种类共 {EMOTIONS.length} 种，全部来自你自己点亮过的球。
          </p>
        </div>
      )}
    </section>
  );
}

function StatCard({
  label,
  value,
  unit,
  detail,
  tint,
}: {
  label: string;
  value: number | string;
  unit?: string;
  detail: string;
  tint?: string;
}) {
  return (
    <div className="mb-surface rounded-[24px] p-5 sm:p-6">
      <p className="text-[11px] tracking-[0.08em] text-ink-ghost">{label}</p>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span
          className="font-display text-[30px] font-light leading-none tabular-nums text-ink sm:text-[34px]"
          style={tint ? { color: tint } : undefined}
        >
          {value}
        </span>
        {unit ? <span className="text-[12px] text-ink-faint">{unit}</span> : null}
      </p>
      <p className="mt-2 text-[11px] text-ink-ghost">{detail}</p>
    </div>
  );
}
