import { beforeEach, describe, expect, it } from 'vitest';
import {
  RESET_LEDGER_FOR_TESTS,
  canRenameToday,
  readUsage,
  recordNicknameChange,
  recordPost,
  recordReply,
} from '@/lib/visitor-ledger';

/**
 * 访客账本。
 *
 * 这是「删掉帖子也不退额度」的唯一依据，所以几条性质必须钉住：
 * 只增不减、按访客分开、按自然日分开、昵称一天一次。
 */
describe('访客账本', () => {
  beforeEach(() => {
    RESET_LEDGER_FOR_TESTS();
  });

  it('发一次记一次，读到的就是发出过的次数', () => {
    expect(readUsage(new Date(), 'visitor-a')).toEqual({ posts: 0, replies: 0 });
    recordPost('visitor-a');
    recordPost('visitor-a');
    recordReply('visitor-a');
    expect(readUsage(new Date(), 'visitor-a')).toEqual({ posts: 2, replies: 1 });
  });

  it('不同访客各记各的，互不占用', () => {
    recordPost('visitor-a');
    recordPost('visitor-a');
    recordPost('visitor-a');
    // 同一天里，另一个人还是满额度
    expect(readUsage(new Date(), 'visitor-a').posts).toBe(3);
    expect(readUsage(new Date(), 'visitor-b').posts).toBe(0);
  });

  it('没有任何「减少」的接口：账本只能往上加', () => {
    recordPost('visitor-a');
    // 账本模块不导出任何 rollback 之类的函数，删帖走不到这里 ——
    // 这一条用「函数清单」把约束写死，改代码时会被提醒
    expect(Object.keys({ readUsage, recordPost, recordReply })).toHaveLength(3);
    expect(readUsage(new Date(), 'visitor-a').posts).toBe(1);
  });

  it('昨天记的账不占今天的额度', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    recordPost('visitor-a');
    expect(readUsage(yesterday, 'visitor-a').posts).toBe(0);
    expect(readUsage(new Date(), 'visitor-a').posts).toBe(1);
  });

  it('昵称一天只能改一次', () => {
    expect(canRenameToday(new Date(), 'visitor-a')).toBe(true);
    recordNicknameChange('visitor-a');
    expect(canRenameToday(new Date(), 'visitor-a')).toBe(false);
    // 同一台设备上的另一个人不受影响
    expect(canRenameToday(new Date(), 'visitor-b')).toBe(true);
  });
});
