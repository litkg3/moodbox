import { describe, expect, it } from 'vitest';
import { SENSITIVE_WORD_COUNT, describeSensitive, maskWord, normalizeForScan, scanSensitive } from '@/lib/sensitive';

/**
 * 回复的敏感词识别。
 *
 * 关心三件事：
 * 1. 空格、标点、全角半角不能成为绕过手段；
 * 2. 打码后可以出现在界面上，不复述原词；
 * 3. 正常的安慰话不能被误伤 —— 这一条比"多抓几个词"更重要。
 */
describe('敏感词识别', () => {
  it('直接命中', () => {
    const result = scanSensitive('你真是个傻逼');
    expect(result.hit).toBe(true);
    expect(result.words).toContain('傻逼');
    expect(result.masked).toContain('傻*');
  });

  it('插入空格、标点、全角字符也认得出来', () => {
    expect(scanSensitive('傻 逼').hit).toBe(true);
    expect(scanSensitive('傻*逼').hit).toBe(true);
    expect(scanSensitive('傻。逼').hit).toBe(true);
    expect(scanSensitive('加　微　信').hit).toBe(true);
  });

  it('诈骗引流类会命中并归到对应分组', () => {
    const result = scanSensitive('想赚钱的私聊我，刷单日赚三百');
    expect(result.hit).toBe(true);
    expect(result.categories).toContain('诈骗引流');
  });

  it('正常的安慰话不会被打扰', () => {
    const normal = [
      '我在，慢慢说就好。',
      '今天不想说话也没关系，我陪你坐一会儿。',
      '你已经很努力了，先休息一下。',
      '如果愿意，可以说说今天发生了什么。',
    ];
    for (const text of normal) {
      expect(scanSensitive(text).hit).toBe(false);
    }
  });

  it('空文本与纯标点不报命中', () => {
    expect(scanSensitive('').hit).toBe(false);
    expect(scanSensitive('……').hit).toBe(false);
    expect(normalizeForScan('……')).toBe('');
  });

  it('打码保留首字，词表不是空的', () => {
    expect(maskWord('博彩')).toBe('博*');
    expect(maskWord('x')).toBe('*');
    expect(SENSITIVE_WORD_COUNT).toBeGreaterThan(30);
  });
});

/**
 * 发帖的内容安全：黄赌毒、广告、引战、联系方式。
 * 这里既验证「该拦的拦住」，也验证「正常的倾诉放行」。
 */
describe('发帖内容安全', () => {
  const blocked: Array<[string, string]> = [
    ['网赌稳赚包赔，私聊我', '赌博'],
    ['想赚钱的加微信 abc12345', '联系方式'],
    ['我的电话 13812345678，随时联系', '联系方式'],
    ['同城约，上门服务', '色情'],
    ['有货，冰毒可寄', '毒品'],
    ['扫码进群领福利 www.spam-site.com', '联系方式'],
    ['你真是个煞笔', '辱骂'],
    ['加vx聊，价格好说', '联系方式'],
  ];

  it('黄赌毒与联系方式：一条就拦', () => {
    for (const [text, expected] of blocked) {
      const scan = scanSensitive(text);
      expect(scan.hit, text).toBe(true);
      expect(scan.categories, text).toContain(expected);
    }
  });

  it('广告与引战：攒够两处才拦', () => {
    expect(scanSensitive('低价出现货，包邮秒发').hit).toBe(true);
    expect(scanSensitive('今天的日出真好看').hit).toBe(false);
    expect(scanSensitive('又是一年毕业季，挂人开撕').hit).toBe(true);
    expect(scanSensitive('我很讨厌地域黑这种说法').hit).toBe(false);
  });

  it('正常的倾诉不会被误伤', () => {
    const normal = [
      '今天加班到十一点，回家路上一个人都没有。',
      '他说我太敏感了，可我真的很难受。',
      '下注了我全部的勇气，去跟他道了歉。',
      '妈妈生病了，我不知道该跟谁说。',
      '想买件新衣服奖励自己，又觉得不值得。',
      // 「私聊我」是广场上最常见的安慰话术，不能一条就拦
      '你愿意的话私聊我，我愿意听你说。',
      '可以私信我，不用一个人扛着。',
    ];
    for (const text of normal) {
      expect(scanSensitive(text).hit, text).toBe(false);
    }
  });

  it('色情类的常见话术认得出来', () => {
    for (const text of ['看片资源私信我，懂的来', '有裸照，加我看', '成人网站会员低价出']) {
      expect(scanSensitive(text).hit, text).toBe(true);
    }
  });

  it('提示语按类别换措辞，并且不复述原词', () => {
    const contact = describeSensitive(scanSensitive('加微信 abc12345'));
    expect(contact).toContain('联系方式');
    const ad = describeSensitive(scanSensitive('低价出现货，包邮秒发'));
    expect(ad).toContain('广告');
    const flame = describeSensitive(scanSensitive('挂人开撕'));
    expect(flame).toContain('引战');
    const swear = describeSensitive(scanSensitive('你真是个煞笔'));
    expect(swear).toContain('煞*');
    expect(swear).not.toContain('煞笔');
  });
});
