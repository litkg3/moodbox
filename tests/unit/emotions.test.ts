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

  it('焦虑球的面板短句：原来 8 条 + 允许焦虑的 2 条 + 新追加 3 条，挪走 1 条后共 12 条', () => {
    const anxiety = EMOTIONS.find((emotion) => emotion.id === 'anxiety');
    expect(anxiety?.messages).toHaveLength(12);
    expect(anxiety?.messages[0]).toBe('当你真心渴望某样东西时，整个宇宙都会联合起来助你实现愿望。');
    // 两条追加：一条讲「允许焦虑」，一条讲「给悬而未决留点耐心」
    expect(anxiety?.messages.some((message) => message.includes('允许焦虑的出现'))).toBe(true);
    expect(anxiety?.messages.some((message) => message.includes('悬而未决'))).toBe(true);
    // 第三轮追加：给一点时间，一步一步来
    expect(anxiety?.messages).toContain(
      '给自己一点时间，不要焦虑。一步一步来，一日一日过，请相信生命的韧性是惊人的。',
    );
    // 最后补上的一条：多年以后回头看，这些都只是轻轻一笔
    expect(anxiety?.messages.at(-1)).toBe(
      '多年以后回头看，现在的迷茫、彷徨、焦虑、麻木都只是人生里的轻轻一笔。愿你不再止步不前，而是重新开始。',
    );
    // 「以渺小而坚定的信念对抗盛大而迷茫的空虚」讲的是迷茫，已经挪去迷茫球
    expect(anxiety?.messages.join('')).not.toContain('以渺小而坚定的信念');
  });

  it('备考球：原来 13 条 + 追加 4 条 - 删掉「感到痛苦说明你在进步」，共 17 条', () => {
    const exam = EMOTIONS.find((emotion) => emotion.id === 'exam');
    expect(exam?.messages).toHaveLength(17);
    expect(exam?.messages[13]).toBe('恰同学少年，风华正茂！');
    expect(exam?.messages[14]).toContain('愿意反复靠近一件事');
    // 后来补的两条：一条讲别走捷径，一条讲「平静地重复」
    expect(exam?.messages[15]).toContain('扎扎实实做好每一件事');
    expect(exam?.messages[15]).toContain('捷径是当下的幸运');
    expect(exam?.messages.at(-1)).toContain('学习的本质只有一个');
    // 追加不是替换：原来那条「得偿所愿」和「impossible」都得在
    expect(exam?.messages).toContain('祝你得偿所愿！');
    expect(exam?.messages.some((message) => message.includes("I'm possible"))).toBe(true);
    // 这句被点名删掉：备考的痛苦不该被一句「说明你在进步」带过
    expect(exam?.messages.join('')).not.toContain('感到痛苦说明你在进步');
  });

  it('焦虑球带两篇「品读片刻」：先用你喜欢的方式度过一生，再是十大奢侈品', () => {
    const anxiety = EMOTIONS.find((emotion) => emotion.id === 'anxiety');
    expect(anxiety?.stories).toHaveLength(2);
    const story = anxiety?.stories?.[0];
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
    expect(anxiety?.stories?.[1]?.title).toBe('这个时代的十大奢侈品');
  });

  it('难过球与痛苦球各带同样的两篇随笔，顺序与正文一致', () => {
    const sadness = EMOTIONS.find((emotion) => emotion.id === 'sadness');
    const pain = EMOTIONS.find((emotion) => emotion.id === 'pain');
    expect(sadness?.stories).toHaveLength(6);
    expect(pain?.stories).toHaveLength(5);

    // 顺序是作者排的：先「停止反复咀嚼」，再「和解式胜利」
    expect(sadness?.stories?.[0]?.title).toBe('不要反复咀嚼令你痛苦的事情');
    expect(sadness?.stories?.[1]?.title).toBe('和解式胜利');
    expect(pain?.stories?.[0]?.title).toBe('不要反复咀嚼令你痛苦的事情');
    expect(pain?.stories?.[1]?.title).toBe('和解式胜利');
    // 同一段话出现在多颗球上，正文必须一模一样，否则就是改了一处忘了另一处
    expect(pain?.stories?.[0]?.content).toBe(sadness?.stories?.[0]?.content);
    expect(pain?.stories?.[1]?.content).toBe(sadness?.stories?.[1]?.content);
    // 两篇共用的随笔（流光溢彩 / 失败了又怎样）也要同源
    expect(pain?.stories?.[2]?.content).toBe(sadness?.stories?.[2]?.content);
    expect(pain?.stories?.[3]?.content).toBe(sadness?.stories?.[3]?.content);
    expect(pain?.stories?.[2]?.title).toBe('我的生命实在太流光溢彩了');
    expect(pain?.stories?.[3]?.title).toBe('失败了又怎样');

    const reconcile = sadness?.stories?.[1]?.content ?? '';
    const paragraphs = reconcile.split('\n\n');
    expect(paragraphs).toHaveLength(4);
    const [first = '', second = '', third = '', fourth = ''] = paragraphs;
    // 起笔认输：对抗注定失败
    expect(first).toContain('注定失败的战争');
    expect(first).toContain('和解式胜利');
    // 第二段：白熊效应
    expect(second).toContain('白熊效应');
    // 第三段：悉达多与并肩而坐
    expect(third.startsWith('悉达多说')).toBe(true);
    expect(third).toContain('并肩而坐');
    // 收尾：让这阵风穿过你
    expect(fourth.endsWith('都是你灵魂的礼物。”')).toBe(true);
  });

  it('「不要反复咀嚼令你痛苦的事情」：四段，从深夜的自我怀疑落到 it will pass', () => {
    const ri = EMOTIONS.find((emotion) => emotion.id === 'sadness')?.stories?.[0];
    expect(ri?.title).toBe('不要反复咀嚼令你痛苦的事情');
    const paragraphs = (ri?.content ?? '').split('\n\n');
    expect(paragraphs).toHaveLength(4);
    expect(paragraphs[0]).toContain('夜深人静时浮现在我的脑海里');
    expect(paragraphs[0]?.endsWith('我的生活才能真正明朗起来。')).toBe(true);
    // 第二段只放那一句引用，独立成段
    expect(paragraphs[1]).toContain('专注于你的需要、感受和请求');
    expect(paragraphs[2]).toContain('课题分离');
    expect(paragraphs[2]).toContain('摆弄花草');
    expect(paragraphs[3]).toContain('It will pass');
    expect(paragraphs[3]?.endsWith('就事过翻篇吧。')).toBe(true);

    // 三颗球共用这一篇（痛苦、难过、分别各一份），正文同源
    for (const id of ['sadness', 'pain', 'parting'] as const) {
      const emotion = EMOTIONS.find((item) => item.id === id);
      expect(emotion?.stories?.[0]?.title).toBe('不要反复咀嚼令你痛苦的事情');
      expect(emotion?.stories?.[0]?.content).toBe(ri?.content);
    }
  });

  it('分别球多一篇道谢的随笔：三段，收在「心里住着草木」', () => {
    const parting = EMOTIONS.find((emotion) => emotion.id === 'parting');
    expect(parting?.stories).toHaveLength(3);
    const thanks = parting?.stories?.[1];
    expect(thanks?.title).toBe('生命如此神奇，竟让我遇见你');
    const paragraphs = (thanks?.content ?? '').split('\n\n');
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toBe('我真诚地感谢出现在我生命中的每一个人。');
    expect(paragraphs[1]).toContain('你们每一个人都是构成我生命的一部分');
    expect(paragraphs[1]?.endsWith('而他竟将你们带到我身边。')).toBe(true);
    expect(paragraphs[2]).toBe('我的心里住着草木，浇灌以光阴和泪珠。');
  });

  /*
   * 「十大奢侈品」是唯一一篇全站通用的随笔。
   *
   * 每颗球的「品读片刻」里都得有它，而且只能排在最后 ——
   * 它像一张清单，什么时候翻开都能用，放在专属篇目后面才不会被当成主打。
   */
  it('每颗球都有「品读片刻」，且「十大奢侈品」排在每颗球的最后一篇', () => {
    for (const emotion of EMOTIONS) {
      const stories = emotion.stories ?? [];
      expect(stories.length, `${emotion.label} 没有专属篇目`).toBeGreaterThan(0);
      const last = stories.at(-1);
      expect(last?.title, `${emotion.label} 的最后一篇不是奢侈品清单`).toBe('这个时代的十大奢侈品');
      expect(last?.content).toContain('华盛顿邮报');
      // 一篇只出现一次，别在别的球里抄两份
      expect(stories.filter((item) => item.title === '这个时代的十大奢侈品')).toHaveLength(1);
    }
  });

  it('「十大奢侈品」保留原文序号，十条一条不少', () => {
    const luxury = EMOTIONS.find((emotion) => emotion.id === 'joy')?.stories?.[0]?.content ?? '';
    const lines = luxury.split('\n\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.startsWith('那么什么才是我们这个时代的奢侈品呢？')).toBe(true);
    // 序号是清单的骨架：少了 9. 或 10. 读起来就成了漏项
    const items = lines[1]?.split('\n') ?? [];
    expect(items).toHaveLength(10);
    items.forEach((item, index) => {
      expect(item.startsWith(`${index + 1}. `)).toBe(true);
    });
    expect(items[0]).toBe('1. 生命的觉醒和开悟');
    expect(items.at(-1)).toBe('10. 感染并点燃他人的希望');
    // 十二颗球引的是同一份正文
    for (const emotion of EMOTIONS) {
      const last = emotion.stories?.at(-1);
      expect(last?.content, `${emotion.label} 的清单被改过`).toBe(luxury);
    }
  });

  /*
   * 五篇随笔各自落在哪几颗球上，全在这里钉死。
   *
   * 这些篇目是「一稿多处引用」，抄错一处读起来不会有报错，只会读到两句不一样的话，
   * 所以逐球比一遍正文，顺便把「谁配谁」这件事写进测试里。
   */
  it('「我的生命实在太流光溢彩了」：三段，落在麻木/痛苦/难过/烦躁/委屈/疲惫', () => {
    const expected = ['numbness', 'pain', 'sadness', 'irritation', 'wronged', 'exhaustion'];
    const holders = EMOTIONS.filter((emotion) =>
      (emotion.stories ?? []).some((item) => item.title === '我的生命实在太流光溢彩了'),
    );
    expect(holders.map((emotion) => emotion.id).sort()).toEqual([...expected].sort());

    const source = holders[0]?.stories?.find((item) => item.title === '我的生命实在太流光溢彩了');
    const paragraphs = (source?.content ?? '').split('\n\n');
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toBe('我的生命实在太流光溢彩了！');
    expect(paragraphs[1]).toContain('捧着柠檬汽水');
    expect(paragraphs[1]).toContain('我竟活得如此茂盛');
    expect(paragraphs[2]).toBe('我的生命流光溢彩，而我，才刚刚开始欣赏它。');
    // 署名与主题一致，别一稿多处却各写各的标签
    expect(source?.theme).toBe('warmth');
    for (const emotion of holders) {
      const item = emotion.stories?.find((story) => story.title === '我的生命实在太流光溢彩了');
      expect(item?.content, `${emotion.label} 的流光溢彩正文被改过`).toBe(source?.content);
      expect(item?.theme).toBe('warmth');
    }
  });

  it('「失败了又怎样」：三段，落在备考/迷茫/痛苦/难过/麻木', () => {
    const expected = ['exam', 'lost', 'pain', 'sadness', 'numbness'];
    const holders = EMOTIONS.filter((emotion) =>
      (emotion.stories ?? []).some((item) => item.title === '失败了又怎样'),
    );
    expect(holders.map((emotion) => emotion.id).sort()).toEqual([...expected].sort());

    const source = holders[0]?.stories?.find((item) => item.title === '失败了又怎样');
    const paragraphs = (source?.content ?? '').split('\n\n');
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toBe('失败了又怎样，这意味着你有新的开始了。');
    expect(paragraphs[1]).toContain('放弃？不可能的');
    expect(paragraphs[2]).toBe('我如蒲草，韧如丝绦！');
    expect(source?.theme).toBe('courage');
    for (const emotion of holders) {
      const item = emotion.stories?.find((story) => story.title === '失败了又怎样');
      expect(item?.content, `${emotion.label} 的「失败了又怎样」正文被改过`).toBe(source?.content);
    }
  });

  it('「执着于外界的看法」：三段，落在孤独与迷茫', () => {
    const expected = ['loneliness', 'lost'];
    const holders = EMOTIONS.filter((emotion) =>
      (emotion.stories ?? []).some((item) => item.title === '执着于外界的看法'),
    );
    expect(holders.map((emotion) => emotion.id).sort()).toEqual([...expected].sort());

    const source = holders[0]?.stories?.find((item) => item.title === '执着于外界的看法');
    const paragraphs = (source?.content ?? '').split('\n\n');
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toBe('执着于外界的看法，说明还没有找到自己。');
    expect(paragraphs[1]).toContain('我的心是不是也一直在流浪');
    expect(paragraphs[2]).toBe('余生不疑，高歌为己。');
    for (const emotion of holders) {
      const item = emotion.stories?.find((story) => story.title === '执着于外界的看法');
      expect(item?.content, `${emotion.label} 的「执着于外界的看法」正文被改过`).toBe(source?.content);
    }
  });

  it('「当我转变看问题的角度后」：三段，落在孤独/疲惫/难过', () => {
    const expected = ['loneliness', 'exhaustion', 'sadness'];
    const holders = EMOTIONS.filter((emotion) =>
      (emotion.stories ?? []).some((item) => item.title === '当我转变看问题的角度后'),
    );
    expect(holders.map((emotion) => emotion.id).sort()).toEqual([...expected].sort());

    const source = holders[0]?.stories?.find((item) => item.title === '当我转变看问题的角度后');
    const paragraphs = (source?.content ?? '').split('\n\n');
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toBe('当我转变看问题的角度后，世界也变得豁然开朗。');
    // 第二段三句排比，少一句就散了
    expect(paragraphs[1]).toContain('困难变成了提升自我的机会');
    expect(paragraphs[1]).toContain('交流变成了认识世界的体验');
    expect(paragraphs[1]).toContain('孤独变成了磨练心性的修行');
    expect(paragraphs[2]).toBe('所有的所有都不再蒙尘，而是天色晴蓝。');
    for (const emotion of holders) {
      const item = emotion.stories?.find((story) => story.title === '当我转变看问题的角度后');
      expect(item?.content, `${emotion.label} 的「转变角度」正文被改过`).toBe(source?.content);
    }
  });

  /*
   * 开心 / 难过 / 迷茫 / 分别 这四颗球的文案已经整体换成用户给的那几组。
   * 断言都写「首句 + 末句 + 旧文案不得残留」三件：
   * 只查条数的话，将来顺手追加几条也不会被发现；只查首句的话，
   * 又容易变成「新文案拼在旧文案前面」。
   */
  it('开心球换成一组轻快的短句（15 条）', () => {
    const joy = EMOTIONS.find((emotion) => emotion.id === 'joy');
    expect(joy?.messages).toHaveLength(15);
    expect(joy?.messages[0]).toBe('我无限地爱着每一天！');
    expect(joy?.messages.at(-1)).toBe('祝你一周开心七天！');
    expect(joy?.messages[14 - 1]).toBe('期待，生命里许多还未发生的幸福。');
    expect(joy?.messages).toContain('人生小满胜万全。');
    expect(joy?.messages.join('')).not.toContain('把这份开心存进盒子里');
  });

  it('孤独球末句改成「与自己相处」，并补了两条（9 条）', () => {
    const loneliness = EMOTIONS.find((emotion) => emotion.id === 'loneliness');
    expect(loneliness?.messages).toHaveLength(9);
    // 「与自己相处」那句是增补前就定下的末句，后补的两条排在它后面
    expect(loneliness?.messages[6]).toBe(
      '人生的底色，本就是独自前行；人生的常态，是学会与自己相处。',
    );
    expect(loneliness?.messages.at(-1)).toContain('独与天地精神往来');
    expect(loneliness?.messages.join('')).not.toContain('学会与自己独处');
    // 补进来的两条：一条说「独自一人不因孤独而痛苦」，一条说「独处是真正的能力」
    expect(loneliness?.messages).toContain('世界变得更加美丽，我独自一个人，不因孤独而痛苦。');
  });

  it('难过球换成一组「接受情绪」的短句（9 条）', () => {
    const sadness = EMOTIONS.find((emotion) => emotion.id === 'sadness');
    expect(sadness?.messages).toHaveLength(9);
    expect(sadness?.messages[0]).toBe('快快擦干眼泪，看昙花多美。');
    expect(sadness?.messages[7]).toBe('去感受自己，才能治愈自己。');
    expect(sadness?.messages.at(-1)).toContain('你的内心永远有复苏的力量');
    expect(sadness?.messages.join('')).not.toContain('难过的时候不用急着变好');
  });

  it('迷茫球换成一组「向内建立」的短句，并接住从焦虑球挪来的那条（18 条）', () => {
    const lost = EMOTIONS.find((emotion) => emotion.id === 'lost');
    expect(lost?.messages).toHaveLength(18);
    expect(lost?.messages[0]).toBe('生命的意义在于活出自我，而不是成为别人眼中的你。');
    expect(lost?.messages[14]).toBe('以渺小而坚定的信念对抗盛大而迷茫的空虚。');
    expect(lost?.messages[15]).toBe('迷茫是自我认知的开始！');
    // 后补的两条排在末句之后
    expect(lost?.messages[16]).toContain('独与天地精神往来');
    expect(lost?.messages.at(-1)).toContain('多年以后回头看');
    expect(lost?.messages.join('')).not.toContain('雾不会一直这么浓');
  });

  it('分别球换成一组「阶段性陪伴」的短句（13 条）', () => {
    const parting = EMOTIONS.find((emotion) => emotion.id === 'parting');
    expect(parting?.messages).toHaveLength(13);
    expect(parting?.messages[0]).toBe('短暂的离别，是为了下一次更好的相聚。');
    expect(parting?.messages[11]).toBe('如果人生总是后知后觉，那请在拥有的时候珍惜一切。');
    expect(parting?.messages.at(-1)).toContain('让你有能力走完这一生');
    // 「向之所欣……」是这一组里唯一的古文，最容易在录入时被截断
    expect(parting?.messages.some((message) => message.includes('况修短随化，终期于尽'))).toBe(true);
    expect(parting?.messages.join('')).not.toContain('分别不是失败');
  });

  it('痛苦球换成一组「与痛苦相处」的短句（9 条）', () => {
    const pain = EMOTIONS.find((emotion) => emotion.id === 'pain');
    expect(pain?.messages).toHaveLength(9);
    expect(pain?.messages[0]).toBe('如果感到痛苦就去爬山，去看世界。');
    expect(pain?.messages[6]).toBe('生命的长度总会稀释痛苦的浓度。');
    expect(pain?.messages.at(-1)).toContain('多年以后回头看');
    expect(pain?.messages.join('')).not.toContain('如果此刻真的很痛');
    // 自伤提示放在 supportNote 里，不占文案额度，也不能跟着这次替换被删掉
    expect(pain?.supportNote).toContain('热线');
  });

  it('疲惫球换成一组「允许自己休息」的短句（6 条）', () => {
    const exhaustion = EMOTIONS.find((emotion) => emotion.id === 'exhaustion');
    expect(exhaustion?.messages).toHaveLength(6);
    expect(exhaustion?.messages[0]).toBe('流水不争先，争的是滔滔不绝。');
    expect(exhaustion?.messages.at(-1)).toContain('勇敢地去做自己真正喜欢的事');
    expect(exhaustion?.messages.join('')).not.toContain('如果今天真的很累');
  });

  /*
   * 委屈只留一句；麻木后来又补了五条「重新开始」。
   *
   * 一句也能用，但「再给我一点温暖」在这种情况下会被面板隐藏 ——
   * 按下去还是同一句，只会让人以为按钮坏了。条数写死在这里，
   * 以后有人顺手补几条时，会先被这条测试提醒「面板行为要一起看」。
   */
  it('委屈只留一句，麻木补到六条，烦躁留两句', () => {
    const wronged = EMOTIONS.find((emotion) => emotion.id === 'wronged');
    const numbness = EMOTIONS.find((emotion) => emotion.id === 'numbness');
    const irritation = EMOTIONS.find((emotion) => emotion.id === 'irritation');
    expect(wronged?.messages).toEqual(['去树洞广场诉说你的委屈吧，会有人安慰你的！']);
    // 麻木：「宁要痛苦，不要麻木」仍是第一句，后补六条排在后面
    expect(numbness?.messages).toHaveLength(7);
    expect(numbness?.messages[0]).toBe('宁要痛苦，不要麻木。');
    // 后来追加的一句：独自走走，悲伤也成享受
    expect(numbness?.messages).toContain(
      '人有时需要独自走走，听听街头人群喧嚣，看看巷尾草木生长，悲伤也成享受。',
    );
    expect(numbness?.messages).toContain('有声有色的学习，有滋有味的生活，有情有义的交往，有模有样的成长。');
    expect(numbness?.messages.at(-1)).toContain('有声有色的学习');
    expect(numbness?.messages.join('')).not.toContain('什么都不想做');
    // 烦躁球：新补的「出去走走」在前，指向页头「呼吸放松」的那句在后，
    // 旧的那 15 条一句都不该留下
    expect(irritation?.messages).toEqual([
      '出去走走，让风带走你的烦躁。',
      '当你感到烦躁时，不妨试试主页的“呼吸放松”。',
    ]);
    expect(irritation?.messages.join('')).not.toContain('你现在很想摔东西吧');
  });

  /*
   * 「直达入口」只配给真正需要的那颗球。
   *
   * 烦躁球文案里提到了呼吸放松，配了一个 /breathe 按钮；
   * 别的球没有 action，面板也就不该凭空多出一枚按钮。
   */
  it('只有烦躁球带直达入口，指向呼吸放松页', () => {
    const withAction = EMOTIONS.filter((emotion) => emotion.action);
    expect(withAction.map((emotion) => emotion.id)).toEqual(['irritation']);
    const irritation = EMOTIONS.find((emotion) => emotion.id === 'irritation');
    expect(irritation?.action).toEqual({
      label: '去呼吸放松',
      href: '/breathe',
      hint: '跟着圆环，慢慢呼吸几十秒',
    });
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
