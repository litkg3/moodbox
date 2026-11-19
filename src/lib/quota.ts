/**
 * 广场的每日发布配额。
 *
 * 规则：同一个访客（本机派生的匿名标识）在同一天里
 * 最多发 3 条帖子、20 条回复。
 *
 * 三个设计要点：
 *
 * 1. **按自然日算，不按「最近 24 小时」算。** 滚动窗口会让「昨晚 23:50
 *    发了两条的人，今天 0:10 还是只能发一条」，很难解释；自然日
 *    （本地时间 0 点重置）一句话就能说清，也符合"每天"这个直觉。
 *
 * 2. **删帖不退额度。** 否则「发满三条 → 全删掉 → 再发三条」就是免费无限发。
 *    但「数现在还剩几条」做不到这一点 —— 删掉的那条已经不在列表里了。
 *    所以用量单独记一本账（`lib/visitor-ledger.ts`）：发一次记一笔，
 *    删帖不会把它抹掉。评论同理。
 *
 * 3. **这层只是提示，真正的边界在服务端。** 本机模式下 IndexedDB 里的数据
 *    用户自己就能改；云端模式下由 `moodbox_square_create` / `_reply`
 *    在数据库里数一遍（见 supabase/schema.sql），前端绕不过去。
 */

export const DAILY_POST_LIMIT = 3;
export const DAILY_REPLY_LIMIT = 20;

export type QuotaKind = 'post' | 'reply';

export interface QuotaUsage {
  /** 今天已经发出去几条帖子 */
  posts: number;
  /** 今天已经写了几条回复 */
  replies: number;
}

export interface QuotaState {
  kind: QuotaKind;
  limit: number;
  used: number;
  remaining: number;
  /** 还能不能再发一条 */
  allowed: boolean;
}

const LIMITS: Record<QuotaKind, number> = {
  post: DAILY_POST_LIMIT,
  reply: DAILY_REPLY_LIMIT,
};

export const EMPTY_USAGE: QuotaUsage = { posts: 0, replies: 0 };

export function limitOf(kind: QuotaKind): number {
  return LIMITS[kind];
}

/**
 * 本地日期键：`2026-11-19`。
 *
 * 用本地时间而不是 UTC —— 「今天」对用户来说是本地的那一天，
 * 用 UTC 会让东八区的人在早上 8 点前发的帖子算到"昨天"。
 */
export function dayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 把一条 ISO 时间归到它所属的那一天（本地时区）。 */
export function dayKeyOf(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dayKey(date);
}

/** 距离本地时间下一个 0 点还有多久，用于「明天再来」这类提示。 */
export function msUntilNextDay(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - now.getTime());
}

/**
 * 算出一项配额的状态。
 *
 * `used` 可能因为历史数据（比如老版本没有统计）超出上限，
 * 这里统一夹到区间内，`remaining` 不会出现负数。
 */
export function quotaState(kind: QuotaKind, usage: QuotaUsage): QuotaState {
  const limit = LIMITS[kind];
  const raw = kind === 'post' ? usage.posts : usage.replies;
  const used = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  return {
    kind,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    allowed: used < limit,
  };
}

/**
 * 还能不能发。这是 `quotaState` 的布尔快捷方式，
 * store 与界面都用它做同一判断，避免两处各写一遍比较逻辑。
 */
export function canPublish(kind: QuotaKind, usage: QuotaUsage): boolean {
  return quotaState(kind, usage).allowed;
}

/** 服务端拒绝时的文案，与本地这层保持一致，换后端不会换措辞。 */
export function quotaMessage(kind: QuotaKind): string {
  if (kind === 'post') {
    return `今天已经发满 ${DAILY_POST_LIMIT} 条了。额度按自然日算，明天 0 点会重新给满 ${DAILY_POST_LIMIT} 条 —— 现在可以先去看看别人的心事。`;
  }
  return `今天已经回复满 ${DAILY_REPLY_LIMIT} 条了。说得太多也累，明天 0 点之后再来吧。`;
}

/**
 * 一句话展示剩余额度，只在**还发得出去**的时候显示。
 *
 * 用完之后这里就是空的 —— 页面上不出现「今天已经用完了」这类字样，
 * 拦截只在按下的那一刻用一个 toast 说明。额度用尽时，弹窗底部本来就会
 * 换成那条红字提示（见 `quotaMessage`），同一句话不必说两遍。
 */
export function quotaHint(kind: QuotaKind, usage: QuotaUsage): string {
  const state = quotaState(kind, usage);
  if (!state.allowed) return '';
  const unit = kind === 'post' ? '条帖子' : '条回复';
  return `今天还能发 ${state.remaining} ${unit}`;
}
