import { endOfMonth, format, startOfMonth, subDays } from 'date-fns';
import { toDateKey } from '@/lib/date';
import { normalizeEmotionId } from '@/lib/emotions';
import { EMOTION_IDS, type EmotionId, type EmotionLog, type MemoryRecord } from '@/types';

export interface DaySummary {
  dateKey: string;
  /** 该天出现过的情绪（去重，按出现次数降序，用于日历上的彩色小点） */
  emotions: EmotionId[];
  emotionLogs: EmotionLog[];
  memories: MemoryRecord[];
}

export interface EmotionCount {
  id: EmotionId;
  count: number;
}

/** 一段记录里的情绪构成：按次数降序，share 是占总次数的比例（0–1）。 */
export interface EmotionShare extends EmotionCount {
  share: number;
}

/**
 * 把一组情绪记录折成「哪种情绪、几次、占多少」。
 *
 * 已下线的球（EMO / 担心 / 害怕）在这里收敛到现存的那一颗，
 * 否则旧记录会在构成里变成一个没有名字的空行。
 */
export function buildEmotionComposition(logs: EmotionLog[]): EmotionShare[] {
  const counter = new Map<EmotionId, number>();
  for (const log of logs) {
    const id = normalizeEmotionId(log.emotionId);
    counter.set(id, (counter.get(id) ?? 0) + 1);
  }
  const total = logs.length || 1;
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, count, share: count / total }));
}

export interface MonthStats {
  /** 本月有情绪记录的天数（只统计用户主动记录的日子） */
  recordedDays: number;
  /** 本月收藏的快乐记忆条数 */
  memoryCount: number;
  emotionCounts: EmotionCount[];
  last7Days: { dateKey: string; total: number; topEmotion: EmotionId | null }[];
  /** 本月记录最多的情绪，没有则为 null */
  topEmotion: EmotionId | null;
}

export function groupEmotionLogsByDate(logs: EmotionLog[]): Map<string, EmotionLog[]> {
  const map = new Map<string, EmotionLog[]>();
  for (const log of logs) {
    const list = map.get(log.date);
    if (list) list.push(log);
    else map.set(log.date, [log]);
  }
  return map;
}

export function groupMemoriesByDate(memories: MemoryRecord[]): Map<string, MemoryRecord[]> {
  const map = new Map<string, MemoryRecord[]>();
  for (const memory of memories) {
    const list = map.get(memory.date);
    if (list) list.push(memory);
    else map.set(memory.date, [memory]);
  }
  return map;
}

/** 汇总某一天的数据，日历点击时使用。 */
export function buildDaySummary(
  dateKey: string,
  logs: EmotionLog[],
  memories: MemoryRecord[],
): DaySummary {
  const dayLogs = logs
    .filter((log) => log.date === dateKey)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const dayMemories = memories
    .filter((memory) => memory.date === dateKey)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const counts = new Map<EmotionId, number>();
  for (const log of dayLogs) {
    const id = normalizeEmotionId(log.emotionId);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const emotions = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  return { dateKey, emotions, emotionLogs: dayLogs, memories: dayMemories };
}

/**
 * 月度统计。只基于用户主动保存的数据，
 * 未记录的日期不计入、也不会被推断成任何情绪。
 */
export function buildMonthStats(
  logs: EmotionLog[],
  memories: MemoryRecord[],
  month: Date,
  today: Date = new Date(),
): MonthStats {
  const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');
  const inMonth = (dateKey: string) => dateKey >= monthStart && dateKey <= monthEnd;

  const monthLogs = logs.filter((log) => inMonth(log.date));
  const monthMemories = memories.filter((memory) => inMonth(memory.date));

  const counts = new Map<EmotionId, number>();
  for (const id of EMOTION_IDS) counts.set(id, 0);
  for (const log of monthLogs) {
    const id = normalizeEmotionId(log.emotionId);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const emotionCounts = [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const day = subDays(today, 6 - index);
    const dateKey = toDateKey(day);
    const dayLogs = logs.filter((log) => log.date === dateKey);
    const dayCounts = new Map<EmotionId, number>();
    for (const log of dayLogs) {
      const id = normalizeEmotionId(log.emotionId);
      dayCounts.set(id, (dayCounts.get(id) ?? 0) + 1);
    }
    const top = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      dateKey,
      total: dayLogs.length,
      topEmotion: top ? top[0] : null,
    };
  });

  return {
    recordedDays: new Set(monthLogs.map((log) => log.date)).size,
    memoryCount: monthMemories.length,
    emotionCounts,
    last7Days,
    topEmotion: emotionCounts[0]?.id ?? null,
  };
}
