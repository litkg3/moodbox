import { describe, expect, it } from 'vitest';
import { EMOTIONS, HOME_BLESSING, SLOGAN } from '@/data/emotions';
import { EMOTION_IDS } from '@/types';
import { DEFAULT_MIN_MESSAGES, MIN_MESSAGES_BY_EMOTION, pickMessage, validateEmotionLibrary } from '@/lib/emotions';

describe('情绪内容库', () => {
  it('覆盖全部情绪，且每种达到各自的最低文案条数', () => {
    expect(EMOTIONS).toHaveLength(EMOTION_IDS.length);
    expect(EMOTIONS.map((emotion) => emotion.id).sort()).toEqual([...EMOTION_IDS].sort());
    for (const emotion of EMOTIONS) {
      const min = MIN_MESSAGES_BY_EMOTION[emotion.id] ?? DEFAULT_MIN_MESSAGES;
      expect(emotion.messages.length).toBeGreaterThanOrEqual(min);
    }
    expect(validateEmotionLibrary()).toEqual({ ok: true, problems: [] });
  });

  it('焦虑球的面板短句保持原来那组（共 8 条）', () => {
    const anxiety = EMOTIONS.find((emotion) => emotion.id === 'anxiety');
    expect(anxiety?.messages).toHaveLength(8);
    expect(anxiety?.messages[0]).toBe('当你真心渴望某样东西时，整个宇宙都会联合起来助你实现愿望。');
  });

  it('焦虑球带一篇「看个小故事」专属故事，整段不拆', () => {
    const anxiety = EMOTIONS.find((emotion) => emotion.id === 'anxiety');
    const story = anxiety?.story;
    expect(story).toBeTruthy();
    expect(story?.title).toBe('用你喜欢的方式度过一生');
    // 整段：四个层次都要在同一段正文里，不能拆成 messages 那样的短句
    expect(story?.content).toContain('一个叫良知，另一个叫理想');
    expect(story?.content).toContain('用你喜欢的方式度过一生');
    expect(story?.content).toContain('梅须逊雪三分白，雪却输梅一段香');
    expect(story?.content).toContain('人生海海，山山而川，不过尔尔');
    // 保留分段（面板按 pre-wrap 渲染，换行就是呼吸）
    expect(story?.content.split('\n\n').length).toBeGreaterThanOrEqual(5);
    expect(story?.content.length).toBeGreaterThan(250);
  });

  it('只有焦虑球带专属故事，别的球仍然从故事集里抽', () => {
    const withStory = EMOTIONS.filter((emotion) => emotion.story);
    expect(withStory.map((emotion) => emotion.id)).toEqual(['anxiety']);
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

  /*
   * 每一颗球都必须有「矮屏坐标」。
   * 手机横屏、分屏时可视高度只剩 300 多 px，缺了这套坐标就只能退回竖屏那套，
   * 上下两排会撞在一起 —— 用户看到的就是「球少了 / 球叠着」。
   * 坐标同时要留边：球心离屏幕边缘太近，加上 20~30px 的漂浮位移就会被切掉。
   */
  it('每种情绪都有矮屏坐标，且留足边距', () => {
    for (const emotion of EMOTIONS) {
      const short = emotion.placement.short;
      expect(short, `${emotion.label} 缺少矮屏坐标`).toBeTruthy();
      if (!short) continue;
      expect(short.x).toBeGreaterThanOrEqual(10);
      expect(short.x).toBeLessThanOrEqual(90);
      expect(short.y).toBeGreaterThanOrEqual(8);
      expect(short.y).toBeLessThanOrEqual(92);
      expect(short.scale).toBeGreaterThan(0.5);
      expect(short.scale).toBeLessThanOrEqual(1.1);
    }
  });

  it('痛苦情绪附带低打扰的现实支持提示', () => {    const pain = EMOTIONS.find((emotion) => emotion.id === 'pain');
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
