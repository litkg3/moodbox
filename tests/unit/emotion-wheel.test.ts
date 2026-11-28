import { describe, expect, it } from 'vitest';
import { EMOTION_CELLS, EMOTION_DYADS, EMOTION_PETALS } from '@/data/emotion-wheel';

/**
 * 情绪轮的数据约束。
 *
 * 这些关系写在数据里，界面只是照着画。所以「乐观对面是悲观」这类事
 * 一旦被谁手滑改错，最该被拦住的是单测，而不是等到截图时才发现。
 */

describe('情绪轮的复合情绪', () => {
  it('八个复合词，每个都由相邻两瓣撞成', () => {
    expect(EMOTION_DYADS).toHaveLength(EMOTION_PETALS.length);

    // 中层那一档的名字，用来核对「左边这瓣 + 右边这瓣」
    const midNames = EMOTION_PETALS.map((petal) => petal.tiers[1].label);

    EMOTION_DYADS.forEach((dyad, index) => {
      const left = midNames[(index - 1 + midNames.length) % midNames.length];
      const right = midNames[index];
      expect([...dyad.from].sort()).toEqual([left, right].sort());
    });
  });

  it('两两相对，且互为「相反」', () => {
    const byLabel = new Map(EMOTION_DYADS.map((dyad) => [dyad.label, dyad]));

    EMOTION_DYADS.forEach((dyad, index) => {
      const opposite = byLabel.get(dyad.opposite);
      expect(opposite, `${dyad.label} 的对面 ${dyad.opposite} 不存在`).toBeDefined();

      // 相差 180°：下标正好差四瓣
      const oppositeIndex = EMOTION_DYADS.indexOf(opposite!);
      expect((oppositeIndex - index + 8) % 8).toBe(4);

      // 指认是相互的
      expect(opposite!.opposite).toBe(dyad.label);
    });
  });

  it('每一格都带着两侧的复合情绪', () => {
    expect(EMOTION_CELLS).toHaveLength(EMOTION_PETALS.length * 3);

    EMOTION_CELLS.forEach((cell) => {
      const [before, after] = cell.dyads;
      // 后一个的下标正好是前一个 +1（绕回）
      const beforeIndex = EMOTION_DYADS.indexOf(before);
      const afterIndex = EMOTION_DYADS.indexOf(after);
      expect((beforeIndex + 1) % 8).toBe(afterIndex);

      // 两个词都含这一瓣：from 里应当有这一瓣的某个词
      const names = cell.petal.tiers.map((tier) => tier.label);
      for (const dyad of cell.dyads) {
        expect(dyad.from.some((name) => names.includes(name))).toBe(true);
      }
    });
  });
});
