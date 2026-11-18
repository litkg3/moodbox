'use client';

import { useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MiniCalendarProps {
  /** yyyy-MM-dd */
  value: string;
  onChange: (dateKey: string) => void;
  /** 不允许选未来（默认不限制） */
  maxKey?: string;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function toKey(day: Date): string {
  return format(day, 'yyyy-MM-dd');
}

/**
 * 表单里嵌的小日历。
 *
 * 用网格直接选日期，比一个 `type="date"` 的输入框更接近「手账」的感觉，
 * 也省掉了「这一天是 ___」那种空着要自己填的输入。
 */
export function MiniCalendar({ value, onChange, maxKey }: MiniCalendarProps) {
  const [month, setMonth] = useState<Date>(() => new Date(`${value}T00:00:00`));

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="rounded-[18px] border border-white/70 bg-white/45 p-3">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setMonth((prev) => subMonths(prev, 1))}
          aria-label="上一个月"
          className="grid h-7 w-7 place-items-center rounded-full text-ink-ghost transition-colors hover:bg-white/70 hover:text-ink"
        >
          <ChevronLeft size={14} strokeWidth={1.8} />
        </button>
        <span className="text-[12px] tracking-[0.12em] text-ink-soft">
          {format(month, 'yyyy 年 M 月')}
        </span>
        <button
          type="button"
          onClick={() => setMonth((prev) => addMonths(prev, 1))}
          aria-label="下一个月"
          className="grid h-7 w-7 place-items-center rounded-full text-ink-ghost transition-colors hover:bg-white/70 hover:text-ink"
        >
          <ChevronRight size={14} strokeWidth={1.8} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-[2px]">
        {WEEKDAYS.map((label) => (
          <span
            key={label}
            className="py-1 text-center text-[9.5px] tracking-[0.14em] text-ink-ghost/80"
          >
            {label}
          </span>
        ))}

        {days.map((day) => {
          const key = toKey(day);
          const inMonth = isSameMonth(day, month);
          const selected = key === value;
          const disabled = Boolean(maxKey && key > maxKey);

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(key)}
              aria-pressed={selected}
              aria-label={format(day, 'yyyy 年 M 月 d 日')}
              className={cn(
                'relative grid h-8 place-items-center rounded-[9px] text-[12px] tabular-nums transition-colors duration-300',
                inMonth ? 'text-ink' : 'text-ink-ghost/45',
                disabled && 'cursor-not-allowed opacity-30',
                selected ? 'mb-day-selected font-medium' : 'hover:bg-white/70',
              )}
            >
              {day.getDate()}
              {isToday(day) && !selected ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-[5px] left-1/2 h-[2px] w-2.5 -translate-x-1/2 rounded-full bg-[#c9a86a]"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
