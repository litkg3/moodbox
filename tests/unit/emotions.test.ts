import { describe, expect, it } from 'vitest';
import { EMOTIONS, HOME_BLESSING, SLOGAN } from '@/data/emotions';
import { EMOTION_IDS } from '@/types';
import { pickMessage, validateEmotionLibrary } from '@/lib/emotions';

describe('情绪内容库', () => {
  it('覆盖全部 14 种情绪，且每种至少 15 条文案', () => {
    expect(EMOTIONS).toHaveLength(14);
    expect(EMOTIONS.map((emotion) => emotion.id).sort()).toEqual([...EMOTION_IDS].sort());
    for (const emotion of EMOTIONS) {
      expect(emotion.messages.length).toBeGreaterThanOrEqual(15);
    }
    expect(validateEmotionLibrary()).toEqual({ ok: true, problems: [] });
  });

  it('文案不重复，且都带有配色与坐标', () => {
    for (const emotion of EMOTIONS) {
      expect(new Set(emotion.messages).size).toBe(emotion.messages.length);
      expect(emotion.palette.mid).toMatch(/^#[0-9a-f]{6}$/i);
      expect(emotion.placement.desktop.x).toBeGreaterThan(0);
      expect(emotion.placement.desktop.x).toBeLessThan(100);
      expect(emotion.placement.desktop.y).toBeGreaterThan(0);
      expect(emotion.placement.desktop.y).toBeLessThan(100);
    }
  });

  it('痛苦情绪附带低打扰的现实支持提示', () => {
    const pain = EMOTIONS.find((emotion) => emotion.id === 'pain');
    expect(pain?.supportNote).toBeTruthy();
    expect(pain?.supportNote).toContain('热线');
  });

  it('首页寄语与 Slogan 保持原文', () => {
    expect(HOME_BLESSING).toBe(
      '或许“情绪球”上的内容无法完全对应你的心情，但我希望这些小球可以给你带来一些温暖。',
    );
    expect(SLOGAN).toBe('让情绪有处安放，让快乐有迹可循。');
  });
});

describe('pickMessage', () => {
  const messages = ['a', 'b', 'c', 'd', 'e'];

  it('不会返回最近出现过的文案', () => {
    for (let i = 0; i < 30; i += 1) {
      const { message } = pickMessage(messages, ['a', 'b', 'c', 'd']);
      expect(message).toBe('e');
    }
  });

  it('当全部文案都出现过时，仍会返回一条有效内容', () => {
    const { message, recent } = pickMessage(messages, messages);
    expect(messages).toContain(message);
    expect(recent.at(-1)).toBe(message);
    expect(recent.length).toBeLessThanOrEqual(4);
  });

  it('连续切换不会立刻重复（100 次抽样）', () => {
    let recent: string[] = [];
    let previous = '';
    for (let i = 0; i < 100; i += 1) {
      const result = pickMessage(messages, recent);
      expect(result.message).not.toBe(previous);
      previous = result.message;
      recent = result.recent;
    }
  });

  it('空内容库不会崩溃', () => {
    expect(pickMessage([], [])).toEqual({ message: '', recent: [] });
  });
});
