import { beforeEach, describe, expect, it } from 'vitest';
import { NICKNAME_MAX, readNickname, saveNickname } from '@/lib/nickname';

describe('广场昵称', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('没设过时返回空字符串', () => {
    expect(readNickname()).toBe('');
  });

  it('存下来之后能读回来', () => {
    expect(saveNickname('晚风')).toBe('晚风');
    expect(readNickname()).toBe('晚风');
  });

  it('去掉首尾空白，并把中间的连续空白压成一个', () => {
    saveNickname('  晚  风  ');
    expect(readNickname()).toBe('晚 风');
  });

  it('超过 16 个字就截断（与 maxLength、服务端校验一致）', () => {
    const long = '一'.repeat(30);
    expect(saveNickname(long)).toHaveLength(NICKNAME_MAX);
    expect(readNickname()).toHaveLength(NICKNAME_MAX);
  });

  it('传空字符串等于回到匿名：键被删掉，而不是存一个空值', () => {
    saveNickname('晚风');
    saveNickname('');
    expect(window.localStorage.getItem('moodbox:square-nickname:v1')).toBeNull();
    expect(readNickname()).toBe('');
  });

  it('只读不写时不会顺手创建键', () => {
    readNickname();
    expect(window.localStorage.getItem('moodbox:square-nickname:v1')).toBeNull();
  });
});
