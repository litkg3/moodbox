'use client';

import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { Star } from 'lucide-react';
import { EMOTION_MAP } from '@/lib/emotions';
import { cn } from '@/lib/utils';
import type { EmotionId } from '@/types';

export interface DayMarkers {
  emotions: EmotionId[];
  memoryCount: number;
}

interface CalendarGridProps {
  month: Date;
  selectedKey: string | null;
  markers: Map<string, DayMarkers>;
  onSelect: (dateKey: string) => void;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

/** 月视图。以周一开头，不是办公软件那种密集表格，而是手账式的方格。 */
export function CalendarGrid({ month, selectedKey, markers, onSelect }: CalendarGridProps) {
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2">
        {WEEKDAYS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-[10px] tracking-[0.18em] text-ink-ghost/80"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, month);
          const marker = markers.get(dateKey);
          const today = isToday(day);
          const selected = selectedKey === dateKey;
          const hasContent = Boolean(marker && (marker.emotions.length > 0 || marker.memoryCount > 0));

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelect(dateKey)}
              aria-pressed={selected}
              aria-label={`${format(day, 'M月d日')}${
                marker && marker.emotions.length > 0
                  ? `，记录了 ${marker.emotions.map((id) => EMOTION_MAP[id]?.label ?? '').join('、')}`
                  : ''
              }${marker && marker.memoryCount > 0 ? `，${marker.memoryCount} 份快乐记忆` : ''}`}
              className={cn(
                'relative flex h-[46px] flex-col items-center justify-center gap-1 rounded-[12px] transition-all duration-400 sm:h-[56px] sm:rounded-[14px] lg:h-[62px]',
                inMonth ? 'text-ink' : 'text-ink-ghost/45',
                selected ? 'mb-day-selected' : 'hover:bg-white/55',
              )}
            >
              <span
                className={cn(
                  'text-[12.5px] tabular-nums leading-none tracking-[0.02em] sm:text-[13.5px]',
                  today && 'font-medium',
                )}
              >
                {day.getDate()}
              </span>

              {today ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 bottom-[6px] h-[2px] rounded-full bg-[linear-gradient(90deg,transparent,#c9a86a,transparent)] sm:inset-x-4"
                />
              ) : null}

              {hasContent && marker ? (
                <span className="flex h-[9px] items-center gap-[3px]">
                  {marker.emotions.slice(0, 3).map((id) => (
                    <span
                      key={id}
                      className="h-[5px] w-[5px] rounded-full"
                      style={{ backgroundColor: EMOTION_MAP[id]?.palette.deep ?? '#b4adbd' }}
                    />
                  ))}
                  {marker.memoryCount > 0 ? (
                    <Star size={8} strokeWidth={2} className="text-[#c9a86a]" aria-hidden="true" />
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
