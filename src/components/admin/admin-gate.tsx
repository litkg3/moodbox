'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, LockOpen, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAdmin } from '@/lib/admin';
import {
  MAX_ADMIN_ATTEMPTS,
  clearAdminAttempts,
  registerAdminFailure,
  remainingAdminAttempts,
} from '@/lib/admin-attempts';

/**
 * 管理员口令页。
 *
 * 广场页上不放入口 —— 地址 `/square/admin` 只写在文档里。
 * 这样广场对普通访客是干净的，不会被一个「管理员入口」的按钮带出戏。
 *
 * 一天最多错三次：错满就锁到明天。计数存在本机，
 * 换设备/换浏览器会重新计，这是体验层的闸门，不是安全边界。
 */
export function AdminGate() {
  const router = useRouter();
  const { showToast } = useToast();
  const { isAdmin, unlock, lock, serverVerified } = useAdmin();

  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(MAX_ADMIN_ATTEMPTS);

  // 计数只能挂载后读：服务端渲染时没有 localStorage
  useEffect(() => {
    setRemaining(remainingAdminAttempts());
  }, []);

  const locked = remaining <= 0;

  async function handleUnlock() {
    if (busy || locked) return;
    const token = passcode.trim();
    if (!token) return;

    setBusy(true);
    setError(null);
    try {
      if (await unlock(token)) {
        clearAdminAttempts();
        setPasscode('');
        setRemaining(MAX_ADMIN_ATTEMPTS);
        showToast('管理员模式已开启，仅对本标签页有效。');
        router.replace('/square');
        router.refresh();
        return;
      }

      const result = registerAdminFailure();
      setRemaining(result.remaining);
      setError(
        result.locked
          ? `口令不对，今天的 ${MAX_ADMIN_ATTEMPTS} 次机会用完了。明天再来。`
          : `口令不对，今天还能试 ${result.remaining} 次。`,
      );
      setPasscode('');
      if (result.locked) {
        showToast(`连续输错 ${MAX_ADMIN_ATTEMPTS} 次，今天不能再试了。`, 'caution');
      }
    } catch {
      setError('校验没能完成，请检查网络后再试。这次不计入次数。');
    } finally {
      setBusy(false);
    }
  }

  if (isAdmin) {
    return (
      <div className="mx-auto max-w-[520px]">
        <p className="text-[11px] uppercase tracking-[0.42em] text-ink-ghost">Restricted</p>
        <h1 className="mt-3 font-display text-[26px] font-light leading-tight tracking-[0.06em] text-ink sm:text-[30px]">
          已经在管理员模式里
        </h1>

        <div className="mb-surface mt-7 rounded-[24px] p-6">
          <p className="flex items-center gap-2 text-[13px] text-ink">
            <ShieldCheck size={15} strokeWidth={1.7} className="text-lavender-deep" />
            这个标签页可以删除不合适的帖子。
          </p>
          <p className="mt-2 text-[11.5px] leading-[1.9] text-ink-faint">
            身份只存在当前标签页，关掉浏览器就失效，不用特意退出。
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              href="/square"
              prefetch={false}
              className="mb-btn-primary inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px]"
            >
              回到广场
              <ArrowRight size={13} strokeWidth={1.7} aria-hidden="true" />
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                lock();
                showToast('已经退出管理员模式。');
              }}
            >
              <LockOpen size={13} strokeWidth={1.7} />
              退出管理员
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[520px]">
      <p className="text-[11px] uppercase tracking-[0.42em] text-ink-ghost">Restricted</p>
      <h1 className="mt-3 font-display text-[26px] font-light leading-tight tracking-[0.06em] text-ink sm:text-[30px]">
        管理员入口
      </h1>
      <p className="mt-3 max-w-[42ch] text-pretty text-[13px] leading-[1.9] text-ink-faint">
        这个地址不对外。口令用于删除不合适的内容，不涉及任何人的记录。
      </p>

      <div className="mb-surface mt-7 rounded-[24px] p-6 sm:p-7">
        <label className="block">
          <span className="flex items-center gap-1.5 text-[12px] text-ink-soft">
            <Lock size={12} strokeWidth={1.7} aria-hidden="true" />
            口令
          </span>
          <input
            type="password"
            value={passcode}
            onChange={(event) => {
              setPasscode(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleUnlock();
            }}
            placeholder={locked ? '今天不能再试了' : '输入口令'}
            className="mb-field mt-2"
            autoComplete="off"
            maxLength={64}
            disabled={locked || busy}
            autoFocus={false}
          />
        </label>

        {error ? (
          <p role="alert" className="mt-2.5 text-[11.5px] leading-[1.9] text-[#9a6660]">
            {error}
          </p>
        ) : locked ? (
          <p className="mt-2.5 text-[11.5px] leading-[1.9] text-[#9a6660]">
            这台设备今天已经输错 {MAX_ADMIN_ATTEMPTS} 次，明天零点之后才能再试。
          </p>
        ) : (
          <p className="mt-2.5 text-[11px] leading-[1.9] text-ink-ghost">
            今天还剩 {remaining} 次机会。
            {serverVerified ? '口令由数据库校验。' : ''}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={() => void handleUnlock()}
            disabled={!passcode.trim() || busy || locked}
          >
            {busy ? '校验中…' : '进入管理员模式'}
          </Button>
          <Link
            href="/square"
            prefetch={false}
            className="text-[12px] text-ink-ghost transition-colors hover:text-ink"
          >
            返回广场
          </Link>
        </div>
      </div>
    </div>
  );
}
