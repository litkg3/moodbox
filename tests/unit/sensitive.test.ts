import { describe, expect, it } from 'vitest';
import { SENSITIVE_WORD_COUNT, maskWord, normalizeForScan, scanSensitive } from '@/lib/sensitive';

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
