import { describe, expect, it } from 'vitest';
import { EMOTIONS } from '@/data/emotions';
import { EMOTION_IDS } from '@/types';
import { BURST_LINES, burstLine } from '@/lib/burst-lines';

/**
 * 捏爆一颗球之后的那句话。
 *
 * 原则是「不评价、不追问」：说释放成功，不问「现在好点了吗」，
 * 也不出现「球会飞回来」这种把复原当操作提示的说法。
 */
describe('捏爆文案', () => {
  it('每种情绪都配了文案，不会漏', () => {
    for (const id of EMOTION_IDS) {
      expect(BURST_LINES[id], `缺少 ${id} 的捏爆文案`).toBeTypeOf('function');
    }
    expect(Object.keys(BURST_LINES)).toHaveLength(EMOTION_IDS.length);
  });

  it('负向情绪说「被你捏爆了！负面情绪释放成功」，并带上球的名字', () => {
    expect(burstLine('anxiety', '焦虑')).toBe('焦虑被你捏爆了！负面情绪释放成功');
    expect(burstLine('wronged', '委屈')).toBe('委屈被你捏爆了！负面情绪释放成功');
  });

  it('备考改成送祝愿，不再说「负面情绪释放成功」', () => {
    expect(burstLine('exam', '备考')).toBe('备考被你捏爆啦，祝你考试顺利，得偿所愿！');
    expect(burstLine('exam', '备考')).not.toContain('负面');
  });

  it('开心不说「释放成功」，改成好心情会传染；麻木按负向处理', () => {
    expect(burstLine('joy', '开心')).toBe('开心被你捏爆了，好心情是会传染的哦');
    expect(burstLine('joy', '开心')).not.toContain('负面');
    expect(burstLine('numbness', '麻木')).toBe('麻木被你捏爆了！负面情绪释放成功');
  });

  it('文案里不出现「飞回来」这类操作提示，也不追问感受', () => {
    for (const emotion of EMOTIONS) {
      const line = burstLine(emotion.id, emotion.label);
      expect(line).not.toContain('飞回来');
      expect(line).not.toContain('吗？');
      expect(line.startsWith(emotion.label)).toBe(true);
    }
  });
});
