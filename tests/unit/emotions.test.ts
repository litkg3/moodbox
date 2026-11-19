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

  it('焦虑球的面板短句：原来 8 条 + 允许焦虑的 2 条 + 新追加 1 条（共 11 条）', () => {
    const anxiety = EMOTIONS.find((emotion) => emotion.id === 'anxiety');
    expect(anxiety?.messages).toHaveLength(11);
    expect(anxiety?.messages[0]).toBe('当你真心渴望某样东西时，整个宇宙都会联合起来助你实现愿望。');
    // 新增的两条追加在末尾：一条讲「允许焦虑」，一条讲「给悬而未决留点耐心」
    expect(anxiety?.messages[8]).toContain('允许焦虑的出现');
    expect(anxiety?.messages[9]).toContain('悬而未决');
    // 最后补上的一条：世俗的标准答案 vs. 自己的人生体验
    expect(anxiety?.messages[10]).toBe('世俗给了我们很多标准答案。可人生，是独属于自己的体验。');
  });

  it('备考球在原来 14 条之后追加了 2 条（共 16 条）', () => {
    const exam = EMOTIONS.find((emotion) => emotion.id === 'exam');
    expect(exam?.messages).toHaveLength(16);
    expect(exam?.messages[14]).toBe('恰同学少年，风华正茂！');
    expect(exam?.messages[15]).toContain('愿意反复靠近一件事');
    // 追加不是替换：原来那条「得偿所愿」和「impossible」都得在
    expect(exam?.messages).toContain('祝你得偿所愿！');
    expect(exam?.messages.some((message) => message.includes("I'm possible"))).toBe(true);
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
    // 排版按四段走：良知与理想 / 徐霞客 / 人各有志与梅雪 / 释怀
    const paragraphs = story?.content.split('\n\n') ?? [];
    expect(paragraphs).toHaveLength(4);
    const [first = '', second = '', third = '', fourth = ''] = paragraphs;
    expect(first.endsWith('一个叫良知，另一个叫理想。')).toBe(true);
    expect(second.startsWith('而全书的结尾')).toBe(true);
    expect(third.endsWith('雪却输梅一段香。')).toBe(true);
    expect(fourth.startsWith('读懂了兴衰与无常')).toBe(true);
    expect(story?.content.length).toBeGreaterThan(250);
  });

  it('只有焦虑球带专属故事，别的球仍然从故事集里抽', () => {
    const withStory = EMOTIONS.filter((emotion) => emotion.story);
    expect(withStory.map((emotion) => emotion.id)).toEqual(['anxiety']);
  });

  /*
   * 开心 / 难过 / 迷茫 / 分别 这四颗球的文案已经整体换成用户给的那几组。
   * 断言都写「首句 + 末句 + 旧文案不得残留」三件：
   * 只查条数的话，将来顺手追加几条也不会被发现；只查首句的话，
   * 又容易变成「新文案拼在旧文案前面」。
   */
  it('开心球换成一组轻快的短句（14 条）', () => {
    const joy = EMOTIONS.find((emotion) => emotion.id === 'joy');
    expect(joy?.messages).toHaveLength(14);
    expect(joy?.messages[0]).toBe('我无限地爱着每一天！');
    expect(joy?.messages.at(-1)).toBe('期待，生命里许多还未发生的幸福。');
    expect(joy?.messages).toContain('人生小满胜万全。');
    expect(joy?.messages.join('')).not.toContain('把这份开心存进盒子里');
  });

  it('难过球换成一组「接受情绪」的短句（8 条）', () => {
    const sadness = EMOTIONS.find((emotion) => emotion.id === 'sadness');
    expect(sadness?.messages).toHaveLength(8);
    expect(sadness?.messages[0]).toBe('快快擦干眼泪，看昙花多美。');
    expect(sadness?.messages.at(-1)).toBe('去感受自己，才能治愈自己。');
    expect(sadness?.messages.join('')).not.toContain('难过的时候不用急着变好');
  });

  it('迷茫球换成一组「向内建立」的短句（15 条）', () => {
    const lost = EMOTIONS.find((emotion) => emotion.id === 'lost');
    expect(lost?.messages).toHaveLength(15);
    expect(lost?.messages[0]).toBe('生命的意义在于活出自我，而不是成为别人眼中的你。');
    expect(lost?.messages.at(-1)).toBe('迷茫是自我认知的开始！');
    expect(lost?.messages.join('')).not.toContain('雾不会一直这么浓');
  });

  it('分别球换成一组「阶段性陪伴」的短句（12 条）', () => {
    const parting = EMOTIONS.find((emotion) => emotion.id === 'parting');
    expect(parting?.messages).toHaveLength(12);
    expect(parting?.messages[0]).toBe('短暂的离别，是为了下一次更好的相聚。');
    expect(parting?.messages.at(-1)).toBe('如果人生总是后知后觉，那请在拥有的时候珍惜一切。');
    // 「向之所欣……」是这一组里唯一的古文，最容易在录入时被截断
    expect(parting?.messages.some((message) => message.includes('况修短随化，终期于尽'))).toBe(true);
    expect(parting?.messages.join('')).not.toContain('分别不是失败');
  });

  it('痛苦球换成一组「与痛苦相处」的短句（7 条）', () => {
    const pain = EMOTIONS.find((emotion) => emotion.id === 'pain');
    expect(pain?.messages).toHaveLength(7);
    expect(pain?.messages[0]).toBe('如果感到痛苦就去爬山，去看世界。');
    expect(pain?.messages.at(-1)).toBe('生命的长度总会稀释痛苦的浓度。');
    expect(pain?.messages.join('')).not.toContain('如果此刻真的很痛');
    // 自伤提示放在 supportNote 里，不占文案额度，也不能跟着这次替换被删掉
    expect(pain?.supportNote).toContain('热线');
  });

  it('疲惫球换成一组「允许自己休息」的短句（5 条）', () => {
    const exhaustion = EMOTIONS.find((emotion) => emotion.id === 'exhaustion');
    expect(exhaustion?.messages).toHaveLength(5);
    expect(exhaustion?.messages[0]).toBe('流水不争先，争的是滔滔不绝。');
    expect(exhaustion?.messages.join('')).not.toContain('如果今天真的很累');
  });

  /*
   * 委屈、麻木按需求各只留一句。
   *
   * 一句也能用，但「再给我一点温暖」在这种情况下会被面板隐藏 ——
   * 按下去还是同一句，只会让人以为按钮坏了。条数写死在这里，
   * 以后有人顺手补几条时，会先被这条测试提醒「面板行为要一起看」。
   */
  it('委屈与麻木各只留一句', () => {
    const wronged = EMOTIONS.find((emotion) => emotion.id === 'wronged');
    const numbness = EMOTIONS.find((emotion) => emotion.id === 'numbness');
    expect(wronged?.messages).toEqual(['去树洞广场诉说你的委屈吧，会有人安慰你的！']);
    expect(numbness?.messages).toEqual(['宁要痛苦，不要麻木。']);
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
