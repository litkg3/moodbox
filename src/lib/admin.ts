'use client';

import { useCallback, useEffect, useState } from 'react';
import { clearAdminToken, readAdminToken, writeAdminToken } from '@/lib/admin-token';
import { getContentBackend, isCloudSquareMode } from '@/lib/backend';

/**
 * 管理员会话。
 *
 * 口令校验分两种模式：
 *
 * - **Supabase 模式（已配置云端）**：口令只是"凭据"，真正的比对发生在数据库的
 *   `moodbox_admin_check` / `moodbox_square_review` 里。前端拿不到"口令是否正确"
 *   的答案，只能问服务端；就算有人手工往 sessionStorage 里塞一个令牌，
 *   审核请求也会被服务端拒绝。**这才是真正的权限控制。**
 * - **本地模式（没配云端）**：没有服务端可比，只能做本地比对，口令形同虚设，
 *   界面上必须说清楚。
 *
 * 令牌存在 sessionStorage（不是 localStorage）：管理员身份只应在当前标签页有效，
 * 关掉浏览器就该失效 —— 这比"永久记住"更符合审核这种敏感操作的预期。
 */

/** 本地模式下的演示口令。接上 Supabase 后这个值不再生效。 */
export const DEMO_ADMIN_PASSCODE = 'moodbox2026';

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** 是否已解锁（以 sessionStorage 里的令牌为准，避免多标签页状态不同步）。 */
export function isAdminUnlocked(): boolean {
  return readAdminToken() !== null;
}

/** 当前的管理员口令是否由服务端校验。 */
export function isAdminServerVerified(): boolean {
  return isCloudSquareMode();
}

/** 校验口令。Supabase 模式下会真的发一次 RPC。 */
export async function unlockAdmin(passcode: string): Promise<boolean> {
  const token = passcode.trim();
  if (!token) return false;

  const backend = getContentBackend();

  if (backend.verifyAdmin) {
    const ok = await backend.verifyAdmin(token);
    if (!ok) return false;
  } else if (token !== DEMO_ADMIN_PASSCODE) {
    return false;
  }

  writeAdminToken(token);
  emit();
  return true;
}

export function lockAdmin(): void {
  clearAdminToken();
  emit();
}

export function useAdmin(): {
  isAdmin: boolean;
  /** 口令是否由服务端校验，用于决定界面上怎么措辞 */
  serverVerified: boolean;
  unlock: (passcode: string) => Promise<boolean>;
  lock: () => void;
} {
  const [isAdmin, setIsAdmin] = useState(false);
  /**
   * 初始值给 false（= 按"本地模式"措辞），挂载后再纠正。
   *
   * 这个判断要读 localStorage（有没有被强制本机），而服务端渲染时读不到。
   * 如果直接在渲染里算，配了云端的用户在首帧会看到两套措辞打架、控制台报水合不一致。
   */
  const [serverVerified, setServerVerified] = useState(false);

  useEffect(() => {
    setIsAdmin(isAdminUnlocked());
    setServerVerified(isAdminServerVerified());

    const listener = () => setIsAdmin(isAdminUnlocked());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const unlock = useCallback(async (passcode: string) => {
    try {
      const ok = await unlockAdmin(passcode);
      setIsAdmin(ok);
      return ok;
    } catch {
      setIsAdmin(false);
      return false;
    }
  }, []);

  const lock = useCallback(() => {
    lockAdmin();
    setIsAdmin(false);
  }, []);

  return { isAdmin, serverVerified, unlock, lock };
}
