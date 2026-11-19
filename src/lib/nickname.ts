'use client';

/**
 * 广场昵称。
 *
 * 以前昵称是「每次发帖现填」，同一个人的两条帖子可能叫两个名字。
 * 现在改成「一次设定、长期记住」：存在本机，发帖时默认带上。
 *
 * 只存在本机的原因：广场没有账号体系，昵称不是身份，只是一个显示名。
 * 存云端等于给匿名发言加了一把可追踪的钥匙，没必要。
 */

const NICKNAME_KEY = 'moodbox:square-nickname:v1';
/** 与表单 maxLength、服务端 varchar 校验保持一致 */
export const NICKNAME_MAX = 16;

function trimToLimit(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, NICKNAME_MAX);
}

/** 读本机记住的昵称；没设过、或读不到时返回空字符串。 */
export function readNickname(): string {
  if (typeof window === 'undefined') return '';
  try {
    return trimToLimit(window.localStorage.getItem(NICKNAME_KEY) ?? '');
  } catch {
    return '';
  }
}

/**
 * 保存昵称，返回真正存下去的值。
 *
 * 传空字符串表示「回到匿名」—— 直接把键删掉，而不是存一个空值，
 * 这样以后改了默认代号（匿名·XXXX）也能跟着变。
 */
export function saveNickname(value: string): string {
  const next = trimToLimit(value);
  if (typeof window === 'undefined') return next;
  try {
    if (next) window.localStorage.setItem(NICKNAME_KEY, next);
    else window.localStorage.removeItem(NICKNAME_KEY);
  } catch {
    // 无痕模式 / 存储被禁用：本标签页仍然生效，只是记不住
  }
  return next;
}
