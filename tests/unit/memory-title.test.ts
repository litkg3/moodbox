import { describe, expect, it } from 'vitest';
import { memoryTitle } from '@/lib/memory-title';

/**
 * 纸条不再有标题：界面上只有正文。
 *
 * 但删东西的时候总要说一句「要删的是哪张」，读屏也要靠一句话分辨列表里的
 * 每一行 —— 这个函数就是那句话。测的是它的三条底线：旧标题优先、正文兜底、
 * 空纸条也不至于念不出声。
 */
describe('纸条的「名字」', () => {
  it('旧数据里有标题时直接用', () => {
    expect(memoryTitle({ title: '楼下的桂花开了', content: '出门闻到一阵很淡的香味。' })).toBe(
      '楼下的桂花开了',
    );
  });

  it('标题是空串（新纸条）时，从正文取开头', () => {
    expect(memoryTitle({ title: '', content: '出门闻到一阵很淡的香味。' })).toBe(
      '出门闻到一阵很淡的香味。',
    );
  });

  it('长正文截到 24 个字，收一个省略号', () => {
    const long = '今天在楼下看到一只三花猫，蹲在电动车座上，叫了一声就跳下来蹭我的裤脚，然后又跑了。';
    const name = memoryTitle({ title: '', content: long });
    expect(name.endsWith('…')).toBe(true);
    expect(name.length).toBe(25);
    expect(long.startsWith(name.slice(0, -1))).toBe(true);
  });

  it('换行和连续空格会被压成单空格，念出来不断句', () => {
    expect(memoryTitle({ title: '', content: '第一行\n\n第二行   第三行' })).toBe(
      '第一行 第二行 第三行',
    );
  });

  it('空白标题也当没有，不念一串空格', () => {
    expect(memoryTitle({ title: '   ', content: '还是要有正文的' })).toBe('还是要有正文的');
  });

  it('完全没有字的时候给一句能念的话，而不是空字符串', () => {
    expect(memoryTitle({ title: '', content: '   ' })).toBe('一张没写字的小纸条');
  });
});
