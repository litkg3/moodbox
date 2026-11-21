'use client';

import { useState } from 'react';
import { Lock, LockOpen, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAdmin } from '@/lib/admin';
import { cn } from '@/lib/utils';

interface AdminBarProps {
  /** 说明这一页管理员能做什么 */
  ability: string;
  className?: string;
  /** 只渲染「管理员入口」按钮（无外框、无文案），供页面把入口放到指定位置 */
  buttonOnly?: boolean;
  /** 不渲染入口按钮，只保留状态文案（入口由页面另外放置） */
  hideEntry?: boolean;
  /** 访客模式下的说明文案 */
  guestNote?: string;
}

/**
 * 管理员入口条。
 *
 * 刻意写得朴素：它不是产品的卖点，只是一个让「审核」这条流程
 * 能被真实操作的位置。
 *
 * 两种模式的措辞必须不一样，不能含糊：
 * - 已接入 Supabase：口令由数据库校验，说"口令不对"就是真的不对；
 * - 纯本地：口令在浏览器里比对，界面上必须承认它绕得过去。
 */
export function AdminBar({
  ability,
  className,
  buttonOnly = false,
  hideEntry = false,
  guestNote = '口令只用来删除不合适的帖子。',
}: AdminBarProps) {
  const { isAdmin, unlock, lock, serverVerified } = useAdmin();
  const [open, setOpen] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  async function handleUnlock() {
    if (busy) return;
    setBusy(true);
    try {
      if (await unlock(passcode)) {
        setOpen(false);
        setPasscode('');
        setError(null);
        showToast('管理员模式已开启，仅对本标签页有效。');
      } else {
        setError(
          serverVerified
            ? '口令不对。这次是由服务端校验的，请输入配置里设定的那个口令。'
            : '口令不对。可以看看 README 里的演示口令。',
        );
      }
    } catch {
      setError('校验没能完成，请检查网络后再试。');
    } finally {
      setBusy(false);
    }
  }

  const entryButton = isAdmin ? (
    <button
      type="button"
      onClick={lock}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] text-ink-faint transition-colors hover:text-ink"
    >
      <LockOpen size={12} strokeWidth={1.7} aria-hidden="true" />
      退出管理员
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/70 bg-white/50 px-3 py-1 text-[11.5px] text-ink-soft transition-colors hover:text-ink"
    >
      <Lock size={12} strokeWidth={1.7} aria-hidden="true" />
      管理员入口
    </button>
  );

  const dialog = (
    <Dialog
      open={open}
      onClose={() => {
        setOpen(false);
        setError(null);
      }}
      title="进入管理员模式"
      description={
        serverVerified
          ? '口令会交给服务端校验，在页面上绕不过去。'
          : '演示用的本地口令，不是真实的权限系统。'
      }
      width="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void handleUnlock()}
            disabled={!passcode.trim() || busy}
          >
            {busy ? '校验中…' : '进入'}
          </Button>
        </div>
      }
    >
      <label className="block">
        <span className="text-[12px] text-ink-soft">口令</span>
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
              placeholder="输入口令"
              className="mb-field mt-2"
              autoComplete="off"
              maxLength={64}
            />
          </label>
          {error ? <p className="mt-2 text-[12px] text-[#9a6660]">{error}</p> : null}
        </Dialog>
  );

  // 只放入口按钮：页面需要把入口摆在某一行的后面时用它
  if (buttonOnly) {
    return (
      <>
        {entryButton}
        {dialog}
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed px-4 py-3',
          isAdmin
            ? 'border-[rgba(142,118,184,0.35)] bg-[rgba(201,182,232,0.14)]'
            : 'border-[rgba(141,133,152,0.24)] bg-transparent',
          className,
        )}
      >
        <div className="flex items-center gap-2.5">
          {isAdmin ? (
            <ShieldCheck size={15} strokeWidth={1.7} className="text-lavender-deep" aria-hidden="true" />
          ) : (
            <Lock size={14} strokeWidth={1.7} className="text-ink-ghost" aria-hidden="true" />
          )}
          <p className="text-[12px] leading-relaxed text-ink-faint">
            {isAdmin ? (
              <>
                <span className="text-ink">管理员模式</span> · {ability}
              </>
            ) : (
              guestNote
            )}
          </p>
        </div>

        {hideEntry ? null : entryButton}
      </div>

      {dialog}
    </>
  );
}
