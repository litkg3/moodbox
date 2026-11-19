'use client';

/**
 * 管理员口令的失败计数。
 *
 * 为什么要放在前端：树洞广场的管理入口是个"隐藏地址"，没有账号体系，
 * 也没有服务端会话。口令本身是服务端校验的，但"试了几次"这件事没有地方记 ——
 * 于是加一层按设备的限流：同一天最多错三次，错了就等到明天。
 *
 * 说明：这是体验层的闸门，不是安全边界。清掉 localStorage 就能重来，
 * 真正的密码学防线仍然是 Supabase 里的 `admin_token` 比对。
 * 这里要解决的是"手滑连试"和"随手爆破"，不是对抗有备而来的人。
 */

export const MAX_ADMIN_ATTEMPTS = 3;

const STORAGE_KEY = 'moodbox:admin-attempts:v1';

interface AttemptState {
  /** 本地日期 YYYY-MM-DD；跨天自动清零 */
  date: string;
  /** 今天已经错了几次 */
  fails: number;
}

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function read(): AttemptState {
  const empty: AttemptState = { date: today(), fails: 0 };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<AttemptState>;
    // 不是今天的记录一律作废：昨天的失败不该影响今天
    if (parsed?.date !== empty.date) return empty;
    return { date: empty.date, fails: typeof parsed.fails === 'number' ? parsed.fails : 0 };
  } catch {
    return empty;
  }
}

function write(state: AttemptState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存不了就退化成"不限次"，不影响正常进入
  }
}

/** 今天还剩几次机会；0 表示今天已经锁了。 */
export function remainingAdminAttempts(): number {
  return Math.max(0, MAX_ADMIN_ATTEMPTS - read().fails);
}

/** 今天还能不能试。 */
export function canAttemptAdmin(): boolean {
  return remainingAdminAttempts() > 0;
}

/** 记一次失败，返回记完之后的状态。 */
export function registerAdminFailure(): { remaining: number; locked: boolean } {
  const state = read();
  const next: AttemptState = { date: state.date, fails: state.fails + 1 };
  write(next);
  const remaining = Math.max(0, MAX_ADMIN_ATTEMPTS - next.fails);
  return { remaining, locked: remaining === 0 };
}

/** 口令对了：把失败记录清掉，明天从零开始。 */
export function clearAdminAttempts(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}
