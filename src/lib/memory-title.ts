import type { Memory } from '@/types';

/**
 * 纸条的「名字」。
 *
 * 界面上纸条只有正文 —— 标题是早期版本自动从正文首句截出来的，用户既没
 * 写过也读不到，所以表单不再生成它。但有些地方仍然需要一句话来指代某张
 * 纸条：删除确认里的「《…》」、详情弹窗的标题、按钮的 aria-label，读屏用户
 * 更是完全靠它分辨列表里的每一行。
 *
 * 所以这里只做一件事：有旧标题就用旧标题，没有就从正文里取。
 * 不是「把标题加回来」，而是给正文找一个能念出口的短名。
 */
export function memoryTitle(memory: Pick<Memory, 'title' | 'content'>): string {
  const legacy = memory.title?.trim();
  if (legacy) return legacy;

  const clean = memory.content.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return '一张没写字的小纸条';
  return clean.length > 24 ? `${clean.slice(0, 24)}…` : clean;
}
