'use client';

/**
 * 管理员令牌的读写。
 *
 * 单独抽一个文件，是因为它被两边用到：
 * - `lib/admin.ts`（React 侧，控制界面上的管理员视图）；
 * - `lib/backend/index.ts`（数据侧，把令牌塞进 RPC 参数）。
 *
 * 如果放在 `lib/admin.ts` 里，数据层就会反向依赖 React 模块，形成循环引用。
 *
 * 令牌本身现在是真的凭据了：它会被送到 Supabase 的 `security definer` 函数里
 * 做比对，比对不过就真的审核不了、删不掉。所以它只存在 sessionStorage，
 * 关掉标签页就失效，不写 localStorage。
 */

export const ADMIN_STORAGE_KEY = 'moodbox-admin-token';

/** 读当前标签页的管理员令牌；没有解锁时返回 null。 */
export function readAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(ADMIN_STORAGE_KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    // 隐私模式下 sessionStorage 可能直接抛错
    return null;
  }
}

export function writeAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ADMIN_STORAGE_KEY, token);
  } catch {
    // 写不进去就只是刷新后需要重新解锁，不影响当前会话
  }
}

export function clearAdminToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
  } catch {
    // 忽略
  }
}
