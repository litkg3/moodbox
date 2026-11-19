import { describe, expect, it } from 'vitest';
import { METEOR_CHANCE, isLateNight } from '@/components/home/meteor-shower';

/**
 * 流星雨的触发窗口。
 *
 * 规则只有一条：「晚十点到次日五点」。边界最容易写错成
 * 「22 <= h < 5」（永远不成立）或把 5 点也包含进去。
 */
describe('流星雨出现的时段', () => {
  const at = (hour: number, minute = 0) => {
    const date = new Date(2026, 0, 15, hour, minute, 0, 0);
    return date;
  };

  it('22:00 之后到 23:59 算深夜', () => {
    expect(isLateNight(at(22, 0))).toBe(true);
    expect(isLateNight(at(23, 59))).toBe(true);
  });

  it('0:00 到 4:59 算深夜', () => {
    expect(isLateNight(at(0, 0))).toBe(true);
    expect(isLateNight(at(4, 59))).toBe(true);
  });

  it('5:00 起就不算了', () => {
    expect(isLateNight(at(5, 0))).toBe(false);
    expect(isLateNight(at(12, 0))).toBe(false);
    expect(isLateNight(at(21, 59))).toBe(false);
  });

  it('概率是「偏低」的那一档，不是每次都划', () => {
    expect(METEOR_CHANCE).toBeGreaterThan(0);
    expect(METEOR_CHANCE).toBeLessThanOrEqual(0.4);
  });
});
