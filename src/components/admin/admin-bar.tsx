'use client';

import { useState } from 'react';
import { Lock, LockOpen, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { DEMO_ADMIN_PASSCODE, useAdmin } from '@/lib/admin';
import { cn } from '@/lib/utils';

interface AdminBarProps {
  /** 说明这一页管理员能做什么 */
  ability: string;
  className?: string;
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
export function AdminBar({ ability, className }: AdminBarProps) {
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
            ? '口令不对。这次是由 Supabase 校验的，必须和数据库里配置的 admin_token 一致。'
            : '口令不对。可以看看 README 里的演示口令。',
        );
      }
    } catch {
      setError('校验没能完成，请检查网络后再试。');
    } finally {
      setBusy(false);
    }
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
              '访客模式：可以阅读、发帖、拥抱和回复，不能审核或增删内容。'
            )}
          </p>
        </div>

        {isAdmin ? (
          <button
            type="button"
            onClick={lock}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] text-ink-faint transition-colors hover:text-ink"
          >
            <LockOpen size={12} strokeWidth={1.7} aria-hidden="true" />
            退出管理员
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/50 px-3 py-1 text-[11.5px] text-ink-soft transition-colors hover:text-ink"
          >
            <Lock size={12} strokeWidth={1.7} aria-hidden="true" />
            管理员入口
          </button>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="进入管理员模式"
        description={
          serverVerified
            ? '口令会送到 Supabase 校验，前端绕不过去。'
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
          />
        </label>
        {error ? <p className="mt-2 text-[12px] text-[#9a6660]">{error}</p> : null}

        <div className="mt-4 rounded-2xl border border-[rgba(141,133,152,0.18)] bg-[rgba(255,255,255,0.4)] px-4 py-3">
          {serverVerified ? (
            <p className="text-[11.5px] leading-[1.85] text-ink-faint">
              口令存在 Supabase 的{' '}
              <code className="rounded bg-[rgba(141,133,152,0.14)] px-1.5 py-0.5 text-ink">
                moodbox_config
              </code>{' '}
              表里，浏览器读不到它。审核、删帖、删回复都会带着口令发给数据库函数，
              校验不过就真的改不动 —— 这一层是有效防线，不是界面装饰。
            </p>
          ) : (
            <p className="text-[11.5px] leading-[1.85] text-ink-faint">
              当前演示口令是{' '}
              <code className="rounded bg-[rgba(141,133,152,0.14)] px-1.5 py-0.5 text-ink">
                {DEMO_ADMIN_PASSCODE}
              </code>
              ，写在 <code>src/lib/admin.ts</code> 里。
              <br />
              需要说明的是：这个校验发生在前端，任何人都能绕过。接上 Supabase 之后
              （见 <code>SUPABASE.md</code>），口令会改成服务端校验，那时才是一条真实的边界。
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
