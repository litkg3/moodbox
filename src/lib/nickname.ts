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

/**
 * 默认软名。
 *
 * 原来没设昵称时叫「匿名·FEP9」——就像一张系统生成的工单号，和广场的语气
 * 完全不在一个世界里。现在改成「形容词 + 名词」的轻名字（「安静的云」
 * 「慢慢走的猫」），像一个陌生人随口给自己起的称呼。
 *
 * 仍然由本机种子派生，所以同一个人每次来都是同一个名字，能认出自己的帖子；
 * 种子换设备才变，与 IP 无关。
 */
const SOFT_ADJECTIVES = [
  '安静的',
  '慢慢的',
  '轻一点',
  '晚睡的',
  '怕冷的',
  '刚醒来的',
  '走神的',
  '低头的',
  '晒太阳的',
  '戴围巾的',
] as const;

const SOFT_NOUNS = [
  '云',
  '海',
  '月亮',
  '猫',
  '树',
  '风',
  '小船',
  '橘子',
  '灯',
  '信',
  '雨',
  '雪',
  '石头',
  '芦苇',
  '晚安',
] as const;

/** 由稳定种子派生一个软名；同一种子永远同名。 */
export function softNickname(seed: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const adjective = SOFT_ADJECTIVES[hash % SOFT_ADJECTIVES.length];
  // 换一次位再取名词，避免两个维度总是同步变化
  const noun = SOFT_NOUNS[((hash >>> 11) ^ (hash >>> 3)) % SOFT_NOUNS.length];
  return `${adjective}${noun}`;
}

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
