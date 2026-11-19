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

  /*
   * 逐颗球的完整对照表。
   *
   * 这 12 句是用户逐条给的原文，写死在这里才有意义：
   * 只校验「以球名开头」的话，把焦虑的句子误抄到孤独上也能通过。
   */
  const EXPECTED: ReadonlyArray<readonly [string, string, string]> = [
    ['parting', '分别', '分别球被你捏爆啦，相遇无悔，从容道别！'],
    ['exam', '备考', '备考球被你捏爆啦，祝你考试顺利，得偿所愿！'],
    ['joy', '开心', '开心球被你捏爆啦，要天天开心哦！'],
    ['anxiety', '焦虑', '焦虑球被你捏爆啦，负面情绪释放成功！'],
    ['loneliness', '孤独', '孤独球被你捏爆啦，负面情绪释放成功！'],
    ['lost', '迷茫', '迷茫球被你捏爆啦，祝你早日找到自己的方向！'],
    ['wronged', '委屈', '委屈球被你捏爆啦，负面情绪释放成功！'],
    ['irritation', '烦躁', '烦躁球被你捏爆啦，负面情绪释放成功！'],
    ['exhaustion', '疲惫', '疲惫球被你捏爆啦，好好休息，积蓄力量！'],
    ['numbness', '麻木', '麻木球被你捏爆啦，从此积极生活！'],
    ['pain', '痛苦', '痛苦球被你捏爆啦，负面情绪释放成功！'],
    ['sadness', '难过', '难过球被你捏爆啦，负面情绪释放成功！'],
  ];

  it('12 颗球的文案逐条对齐', () => {
    for (const [id, label, line] of EXPECTED) {
      expect(burstLine(id as (typeof EMOTION_IDS)[number], label)).toBe(line);
    }
    expect(EXPECTED).toHaveLength(EMOTION_IDS.length);
  });

  it('每句话都用球的名字开头，且都带「球」字', () => {
    for (const emotion of EMOTIONS) {
      const line = burstLine(emotion.id, emotion.label);
      expect(line.startsWith(`${emotion.label}球被你捏爆啦`)).toBe(true);
    }
  });

  it('只有非负向的几颗球不说「负面情绪释放成功」', () => {
    const positive = ['joy', 'exam', 'parting', 'lost', 'exhaustion', 'numbness'];
    for (const id of EMOTION_IDS) {
      const line = burstLine(id, 'x');
      if (positive.includes(id)) {
        expect(line, id).not.toContain('负面');
      } else {
        expect(line, id).toContain('负面情绪释放成功');
      }
    }
  });

  it('文案里不出现「飞回来」这类操作提示，也不追问感受', () => {
    for (const emotion of EMOTIONS) {
      const line = burstLine(emotion.id, emotion.label);
      expect(line).not.toContain('飞回来');
      expect(line).not.toContain('吗？');
    }
  });
});
