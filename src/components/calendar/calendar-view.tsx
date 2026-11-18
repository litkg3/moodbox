'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { addMonths, isSameMonth, startOfMonth } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { PageIntro, PageShell } from '@/components/layout/page-shell';
import { CalendarGrid, type DayMarkers } from '@/components/calendar/calendar-grid';
import { DayDetail } from '@/components/calendar/day-detail';
import { StatsPanel } from '@/components/calendar/stats-panel';
import { WeeklySummary } from '@/components/weekly/weekly-summary';
import { ConfirmDeleteMemoryDialog } from '@/components/memories/confirm-delete-dialog';
import { MemoryDetailDialog } from '@/components/memories/memory-detail-dialog';
import { MemoryFormDialog } from '@/components/memories/memory-form-dialog';
import { useMoodBox } from '@/hooks/use-moodbox';
import { formatMonthTitle, todayKey } from '@/lib/date';
import { buildDaySummary, buildMonthStats } from '@/lib/stats';
import { moodBoxStore } from '@/lib/moodbox-store';
import type { EmotionLog, Memory } from '@/types';

export function CalendarView() {
  const { status, memories, emotionLogs } = useMoodBox();
  const { showToast } = useToast();

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedKey, setSelectedKey] = useState<string>(() => todayKey());
  const [formOpen, setFormOpen] = useState(false);
  const [presetDate, setPresetDate] = useState<string>(() => todayKey());
  const [editing, setEditing] = useState<Memory | null>(null);
  const [detail, setDetail] = useState<Memory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const markers = useMemo(() => {
    const map = new Map<string, DayMarkers>();
    const ensure = (dateKey: string): DayMarkers => {
      const existing = map.get(dateKey);
      if (existing) return existing;
      const created: DayMarkers = { emotions: [], memoryCount: 0 };
      map.set(dateKey, created);
      return created;
    };
    for (const log of emotionLogs) {
      const entry = ensure(log.date);
      if (!entry.emotions.includes(log.emotionId)) entry.emotions.push(log.emotionId);
    }
    for (const memory of memories) {
      ensure(memory.date).memoryCount += 1;
    }
    return map;
  }, [emotionLogs, memories]);

  const summary = useMemo(
    () => buildDaySummary(selectedKey, emotionLogs, memories),
    [selectedKey, emotionLogs, memories],
  );

  const stats = useMemo(
    () => buildMonthStats(emotionLogs, memories, month),
    [emotionLogs, memories, month],
  );

  const hasDemo = useMemo(
    () => memories.some((memory) => memory.isDemo) || emotionLogs.some((log) => log.isDemo),
    [memories, emotionLogs],
  );

  const goToday = useCallback(() => {
    const today = new Date();
    setMonth(startOfMonth(today));
    setSelectedKey(todayKey());
  }, []);

  /**
   * 选择日期。
   *
   * 当天的详情排在整个日历下方，在 900px 高的笔记本上点完日期是看不到任何反馈的。
   * 所以只有“详情确实在视野外”时才把它带进来：已经在看的时候不做任何滚动，避免跳动。
   */
  const selectDay = useCallback((dateKey: string) => {
    setSelectedKey(dateKey);
    window.requestAnimationFrame(() => {
      const el = detailRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight - 120) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    });
  }, []);

  const openCreate = useCallback((dateKey: string) => {
    setPresetDate(dateKey);
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((memory: Memory) => {
    setDetail(null);
    setEditing(memory);
    setFormOpen(true);
  }, []);

  const deleteLog = useCallback(
    async (log: EmotionLog) => {
      try {
        await moodBoxStore.removeEmotionLog(log.id);
        showToast('这条情绪记录已经删掉了。');
      } catch (error) {
        showToast(error instanceof Error ? error.message : '删除失败。', 'caution');
      }
    },
    [showToast],
  );

  const loading = status === 'loading' || status === 'idle';
  const currentMonthIsThisMonth = isSameMonth(month, new Date());

  return (
    <PageShell width="wide">
      <PageIntro
        eyebrow="Mood Journal"
        title="情绪足迹"
        description="像翻一本手账那样，看看自己这个月走过哪些天气。彩色的小圆点是那天记下的情绪，星星是那天的快乐。"
        action={
          <Button
            variant="glass"
            size="md"
            onClick={goToday}
            disabled={currentMonthIsThisMonth && selectedKey === todayKey()}
          >
            回到今天
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_336px] lg:gap-7">
        <div className="space-y-5">
          <div className="mb-surface rounded-[26px] p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMonth((prev) => addMonths(prev, -1))}
                  aria-label="上一个月"
                  className="grid h-9 w-9 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/65 hover:text-ink"
                >
                  <ChevronLeft size={17} strokeWidth={1.6} />
                </button>
                <h2
                  aria-live="polite"
                  className="min-w-[112px] text-center font-display text-[15px] font-normal tracking-[0.1em] text-ink sm:min-w-[132px] sm:text-[17px]"
                >
                  {formatMonthTitle(month)}
                </h2>
                <button
                  type="button"
                  onClick={() => setMonth((prev) => addMonths(prev, 1))}
                  aria-label="下一个月"
                  className="grid h-9 w-9 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/65 hover:text-ink"
                >
                  <ChevronRight size={17} strokeWidth={1.6} />
                </button>
              </div>

              <div className="flex items-center gap-3 text-[10px] tracking-[0.1em] text-ink-ghost">
                <span className="hidden items-center gap-1.5 sm:inline-flex">
                  <span className="h-[4px] w-[4px] rounded-full bg-lavender-deep" />情绪
                </span>
                <span className="hidden items-center gap-1.5 sm:inline-flex">
                  <span className="text-[#c9a86a]">★</span>快乐
                </span>
                {hasDemo ? <span className="rounded-full bg-white/70 px-2 py-[2px]">含示例</span> : null}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {Array.from({ length: 42 }).map((_, index) => (
                  <div
                    key={index}
                    className="aspect-square animate-pulse rounded-[12px] bg-white/45 sm:rounded-[16px]"
                    style={{ animationDelay: `${(index % 7) * 60}ms` }}
                  />
                ))}
              </div>
            ) : (
              <CalendarGrid
                month={month}
                selectedKey={selectedKey}
                markers={markers}
                onSelect={selectDay}
              />
            )}
          </div>

          <div ref={detailRef}>
            <DayDetail
              dateKey={selectedKey}
              logs={summary.emotionLogs}
              memories={summary.memories}
              onAddMemory={openCreate}
              onOpenMemory={setDetail}
              onDeleteLog={(log) => void deleteLog(log)}
            />
          </div>
        </div>

        <div className="lg:sticky lg:top-28 lg:self-start">
          <StatsPanel stats={stats} hasDemo={hasDemo} />
        </div>
      </div>

      {/* 近七日小结：原「情绪周报」页面的内容，现在并入这一页 */}
      <WeeklySummary />

      <MemoryFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        memory={editing}
        presetDate={presetDate}
        onSaved={(memory, isNew) => {
          setPresetDate(memory.date);
          setSelectedKey(memory.date);
          showToast(
            isNew ? '这份快乐，已经被好好收藏起来了。' : '已经改好了，它还是你的。',
            'warm',
          );
        }}
      />

      <MemoryDetailDialog
        memory={detail}
        onClose={() => setDetail(null)}
        onEdit={openEdit}
        onDelete={(memory) => setDeleteTarget(memory)}
      />

      <ConfirmDeleteMemoryDialog
        memory={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => setDetail(null)}
      />

      {status === 'error' ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/55 px-4 py-3 text-[12px] text-ink-soft">
          <Loader2 size={14} className="animate-spin" />
          本地数据读取失败，稍后会自动重试。
        </div>
      ) : null}
    </PageShell>
  );
}
