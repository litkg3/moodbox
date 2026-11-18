'use client';

import { Clock, Plus, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEmotionLoose } from '@/lib/emotions';
import { formatClock, formatFullDate, formatRelativeDay, parseDateKey } from '@/lib/date';
import type { EmotionLog, Memory } from '@/types';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

interface DayDetailProps {
  dateKey: string;
  logs: EmotionLog[];
  memories: Memory[];
  onAddMemory: (dateKey: string) => void;
  onOpenMemory: (memory: Memory) => void;
  onDeleteLog: (log: EmotionLog) => void;
}

export function DayDetail({
  dateKey,
  logs,
  memories,
  onAddMemory,
  onOpenMemory,
  onDeleteLog,
}: DayDetailProps) {
  const date = parseDateKey(dateKey);
  const isEmpty = logs.length === 0 && memories.length === 0;

  return (
    <section className="mb-surface rounded-[24px] p-5 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-normal tracking-[0.06em] text-ink">
            {formatRelativeDay(dateKey)}
          </h2>
          <p className="mt-1.5 text-[11px] tracking-[0.08em] text-ink-ghost">
            {formatFullDate(dateKey)}
            {date ? ` · ${WEEKDAYS[date.getDay()]}` : ''}
          </p>
        </div>
        <Button variant="glass" size="sm" onClick={() => onAddMemory(dateKey)}>
          <Plus size={13} strokeWidth={1.7} />
          在这天记一件开心事
        </Button>
      </header>

      {isEmpty ? (
        <p className="mt-7 rounded-2xl border border-dashed border-[rgba(141,133,152,0.25)] px-4 py-8 text-center text-[12px] leading-[1.9] text-ink-ghost">
          这一天还没有留下什么。
          <br />
          空白也是记录的一部分。
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {logs.length > 0 ? (
            <div>
              <h3 className="text-[10.5px] uppercase tracking-[0.28em] text-ink-ghost">情绪</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {logs.map((log) => {
                  // 旧记录里可能有已下线的情绪 id，统一映射到现存的那一颗
                  const emotion = getEmotionLoose(log.emotionId);
                  return (
                    <li key={log.id}>
                      <span
                        className="group inline-flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-[11.5px] tracking-[0.04em]"
                        style={{ backgroundColor: emotion.palette.light, color: emotion.palette.ink }}
                      >
                        <span
                          className="h-[6px] w-[6px] rounded-full"
                          style={{ backgroundColor: emotion.palette.deep }}
                          aria-hidden="true"
                        />
                        {emotion.label}
                        <span className="inline-flex items-center gap-1 text-[10px] opacity-60">
                          <Clock size={9} strokeWidth={1.8} />
                          {formatClock(log.createdAt).replace('上午', '早').replace('下午', '晚')}
                        </span>
                        <button
                          type="button"
                          onClick={() => onDeleteLog(log)}
                          aria-label={`删除 ${emotion.label} 这条情绪记录`}
                          className="grid h-5 w-5 place-items-center rounded-full opacity-40 transition-opacity hover:bg-white/60 hover:opacity-100"
                        >
                          <X size={10} strokeWidth={2} />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {memories.length > 0 ? (
            <div>
              <h3 className="text-[10.5px] uppercase tracking-[0.28em] text-ink-ghost">快乐记忆</h3>
              <ul className="mt-3 space-y-2">
                {memories.map((memory) => (
                  <li key={memory.id}>
                    <button
                      type="button"
                      onClick={() => onOpenMemory(memory)}
                      className="group flex w-full items-start gap-3 rounded-2xl border border-white/70 bg-white/50 px-3.5 py-3 text-left transition-colors hover:bg-white/75"
                    >
                      <Star
                        size={13}
                        strokeWidth={1.5}
                        className="mt-[3px] shrink-0 text-[#c9a86a]"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-ink">{memory.title}</span>
                        <span className="mt-1 line-clamp-2 block text-[11px] leading-[1.75] text-ink-faint">
                          {memory.content}
                        </span>
                      </span>
                      {memory.isDemo ? (
                        <span className="mt-[2px] shrink-0 rounded-full border border-[rgba(141,133,152,0.3)] px-1.5 py-[1px] text-[8.5px] tracking-[0.1em] text-ink-ghost">
                          示例
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
