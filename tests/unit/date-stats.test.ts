import { describe, expect, it } from 'vitest';
import {
  formatRelativeDay,
  formatShortDate,
  isValidDateKey,
  parseDateKey,
  toDateKey,
  todayKey,
} from '@/lib/date';
import { buildDaySummary, buildMonthStats, groupEmotionLogsByDate } from '@/lib/stats';
import type { EmotionLog, MemoryRecord } from '@/types';

function log(id: string, emotionId: EmotionLog['emotionId'], date: string, createdAt: string): EmotionLog {
  return { id, emotionId, date, createdAt };
}

function memory(id: string, date: string, createdAt: string): MemoryRecord {
  return {
    id,
    date,
    title: `记忆 ${id}`,
    content: '内容',
    mood: 'warm',
    createdAt,
    updatedAt: createdAt,
  };
}

describe('日期工具', () => {
  it('toDateKey 使用本地时区，不会因为 UTC 偏移跨天', () => {
    const local = new Date(2026, 2, 5, 0, 30);
    expect(toDateKey(local)).toBe('2026-03-05');
  });

  it('拒绝不存在的日期与错误格式', () => {
    expect(parseDateKey('2026-02-31')).toBeNull();
    expect(parseDateKey('2026/02/01')).toBeNull();
    expect(isValidDateKey('2026-02-28')).toBe(true);
    expect(isValidDateKey('2026-2-8')).toBe(false);
  });

  it('格式化为中文短日期', () => {
    expect(formatShortDate('2026-11-12')).toContain('11月12日');
  });

  it('今天与昨天使用相对表达', () => {
    expect(formatRelativeDay(todayKey())).toBe('今天');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatRelativeDay(toDateKey(yesterday))).toBe('昨天');
  });
});

describe('日历聚合', () => {
  const today = new Date(2026, 10, 12); // 2026-11-12

  const logs: EmotionLog[] = [
    log('l1', 'anxiety', '2026-11-12', '2026-11-12T01:00:00.000Z'),
    log('l2', 'joy', '2026-11-12', '2026-11-12T03:00:00.000Z'),
    log('l3', 'joy', '2026-11-12', '2026-11-12T05:00:00.000Z'),
    log('l4', 'exhaustion', '2026-11-10', '2026-11-10T12:00:00.000Z'),
    log('l5', 'lost', '2026-10-31', '2026-10-31T12:00:00.000Z'),
  ];

  const memories: MemoryRecord[] = [
    memory('m1', '2026-11-12', '2026-11-12T09:00:00.000Z'),
    memory('m2', '2026-11-12', '2026-11-12T10:00:00.000Z'),
    memory('m3', '2026-10-30', '2026-10-30T10:00:00.000Z'),
  ];

  it('按日期聚合并按出现次数排序情绪', () => {
    const groups = groupEmotionLogsByDate(logs);
    expect(groups.get('2026-11-12')).toHaveLength(3);

    const summary = buildDaySummary('2026-11-12', logs, memories);
    expect(summary.emotions).toEqual(['joy', 'anxiety']);
    expect(summary.emotionLogs).toHaveLength(3);
    expect(summary.memories).toHaveLength(2);
  });

  it('月度统计只统计本月、且只统计主动记录的日子', () => {
    const stats = buildMonthStats(logs, memories, new Date(2026, 10, 1), today);
    expect(stats.recordedDays).toBe(2); // 11-12 与 11-10
    expect(stats.memoryCount).toBe(2); // 10-30 属于上个月
    expect(stats.emotionCounts[0]).toEqual({ id: 'joy', count: 2 });
    expect(stats.topEmotion).toBe('joy');
    expect(stats.last7Days).toHaveLength(7);
    expect(stats.last7Days.at(-1)?.dateKey).toBe('2026-11-12');
  });

  it('没有记录时返回空统计而不是伪造数据', () => {
    const stats = buildMonthStats([], [], new Date(2026, 10, 1), today);
    expect(stats.recordedDays).toBe(0);
    expect(stats.memoryCount).toBe(0);
    expect(stats.emotionCounts).toEqual([]);
    expect(stats.topEmotion).toBeNull();
    expect(stats.last7Days.every((day) => day.total === 0)).toBe(true);
  });
});

/*
 * 下线一颗球（EMO / 担心）之后，历史记录不能凭空消失。
 * 统计层要把旧 id 归一到最接近的现存情绪，日历与周报才不会空出一格。
 */
describe('旧情绪 id 的兼容', () => {
  it('EMO / 担心 会并入麻木 / 焦虑', async () => {
    const { normalizeEmotionId } = await import('@/lib/emotions');
    expect(normalizeEmotionId('emo')).toBe('numbness');
    expect(normalizeEmotionId('worry')).toBe('anxiety');
    expect(normalizeEmotionId('joy')).toBe('joy');
    expect(normalizeEmotionId('whatever')).toBe('anxiety');
  });

  it('月度统计会合并旧 id，不再出现已下线的条目', () => {
    const legacy = [
      'emo',
      'worry',
      'numbness',
      'anxiety',
    ] as unknown as EmotionLog['emotionId'][];
    const logs: EmotionLog[] = legacy.map((emotionId, index) =>
      log(`l${index}`, emotionId, '2026-11-05', `2026-11-05T0${index}:00:00.000Z`),
    );
    const stats = buildMonthStats(logs, [], new Date(2026, 10, 12), new Date(2026, 10, 12));
    const ids = stats.emotionCounts.map((item) => item.id);
    expect(ids).not.toContain('emo');
    expect(ids).not.toContain('worry');
    expect(ids).toContain('numbness');
    expect(ids).toContain('anxiety');
  });
});
