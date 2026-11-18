import { describe, expect, it } from 'vitest';
import {
  DAILY_POST_LIMIT,
  DAILY_REPLY_LIMIT,
  canPublish,
  dayKey,
  dayKeyOf,
  msUntilNextDay,
  quotaHint,
  quotaMessage,
  quotaState,
} from '@/lib/quota';

/**
 * 每日配额。
 *
 * 关心四件事：
 * 1. 边界是「第 3 条能发、第 4 条不能发」，不是差一；
 * 2. 「今天」按本地日历日算，跨 0 点就重新给满；
 * 3. 历史数据超出上限时不会算出负数；
 * 4. 给用户的话说得清楚（说出上限、说出什么时候重置）。
 */
describe('每日配额', () => {
  it('上限是每天 3 条帖子、20 条回复', () => {
    expect(DAILY_POST_LIMIT).toBe(3);
    expect(DAILY_REPLY_LIMIT).toBe(20);
  });

  it('发帖边界：第 3 条还能发，第 4 条不行', () => {
    expect(canPublish('post', { posts: 0, replies: 0 })).toBe(true);
    expect(canPublish('post', { posts: 2, replies: 0 })).toBe(true);
    expect(canPublish('post', { posts: 3, replies: 0 })).toBe(false);
    expect(canPublish('post', { posts: 4, replies: 0 })).toBe(false);
  });

  it('回复边界：第 20 条还能发，第 21 条不行', () => {
    expect(canPublish('reply', { posts: 0, replies: 19 })).toBe(true);
    expect(canPublish('reply', { posts: 0, replies: 20 })).toBe(false);
  });

  it('两种额度互不影响：发帖发满了还能回复', () => {
    const usage = { posts: 3, replies: 0 };
    expect(canPublish('post', usage)).toBe(false);
    expect(canPublish('reply', usage)).toBe(true);
  });

  it('剩余数量夹在 0 以上，脏数据不会算出负数', () => {
    expect(quotaState('post', { posts: 9, replies: 0 }).remaining).toBe(0);
    expect(quotaState('post', { posts: Number.NaN, replies: 0 }).used).toBe(0);
    expect(quotaState('reply', { posts: 0, replies: -3 }).used).toBe(0);
    expect(quotaState('post', { posts: 2, replies: 0 }).remaining).toBe(1);
  });

  it('按本地日历日切分，不按 UTC', () => {
    // 本地 2026-11-19 00:30 —— 用 UTC 算会落到 11-18，这里必须还是 19 号
    const local = new Date(2026, 10, 19, 0, 30, 0);
    expect(dayKey(local)).toBe('2026-11-19');
    expect(dayKeyOf(local.toISOString())).toBe('2026-11-19');
    // 同一天的 23:59 仍然是同一天
    expect(dayKey(new Date(2026, 10, 19, 23, 59, 0))).toBe('2026-11-19');
    // 跨过 0 点就是新的一天，额度重新给满
    expect(dayKey(new Date(2026, 10, 20, 0, 0, 1))).toBe('2026-11-20');
  });

  it('坏时间戳不会崩，只是归不到任何一天', () => {
    expect(dayKeyOf('不是时间')).toBe('');
    expect(dayKeyOf('')).toBe('');
  });

  it('到下一个 0 点是正数、且不超过一天', () => {
    const distance = msUntilNextDay(new Date(2026, 10, 19, 23, 0, 0));
    expect(distance).toBe(60 * 60 * 1000);
    expect(msUntilNextDay(new Date(2026, 10, 19, 0, 0, 0))).toBe(24 * 60 * 60 * 1000);
  });

  it('提示语说出了上限，也说了什么时候重置', () => {
    expect(quotaMessage('post')).toContain('3 条');
    expect(quotaMessage('post')).toContain('明天');
    expect(quotaMessage('reply')).toContain('20 条');

    expect(quotaHint('post', { posts: 1, replies: 0 })).toContain('还能发 2 条');
    expect(quotaHint('post', { posts: 3, replies: 0 })).toContain('用完');
    expect(quotaHint('reply', { posts: 0, replies: 5 })).toContain('还能发 15 条');
  });
});
