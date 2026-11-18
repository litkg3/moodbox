'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { HeartHandshake, Lock, Mail, MailOpen, PenLine, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useLetters, lettersStore } from '@/lib/content-stores';
import { CRISIS_RESOURCES } from '@/lib/crisis';
import { formatClock, formatRelativeDay } from '@/lib/date';
import type { HeartLetter } from '@/types';

/**
 * 心事信箱。
 *
 * 这里的东西永远是私密的 —— 写完默认「封起来」，
 * 想看要主动拆开，看完可以「让它过去」（删除）。
 * 这个流程本身就是设计的一部分：写下来 → 放进去 → 过一阵子再决定要不要留。
 */
export function LettersView({ embedded = false }: { embedded?: boolean } = {}) {
  const { items: letters, status, error } = useLetters();
  const { showToast } = useToast();

  const [composeOpen, setComposeOpen] = useState(false);
  const [content, setContent] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState<HeartLetter | null>(null);
  const [unsealTarget, setUnsealTarget] = useState<HeartLetter | null>(null);
  const [reading, setReading] = useState<HeartLetter | null>(null);

  async function seal() {
    const text = content.trim();
    if (!text || working) return;
    setWorking(true);
    try {
      await lettersStore.write(text);
      setContent('');
      setComposeOpen(false);
      showToast('封好了。它现在只属于这封信。');
    } catch (sealError) {
      showToast(
        sealError instanceof Error ? sealError.message : '没能保存，请稍后再试。',
        'caution',
      );
    } finally {
      setWorking(false);
    }
  }

  async function unseal(letter: HeartLetter) {
    try {
      await lettersStore.open(letter.id);
      setUnsealTarget(null);
      setReading({ ...letter, sealed: false });
    } catch (unsealError) {
      showToast(
        unsealError instanceof Error ? unsealError.message : '拆不开，请稍后再试。',
        'caution',
      );
    }
  }

  async function remove() {
    const target = confirmOpen;
    if (!target) return;
    try {
      await lettersStore.remove(target.id);
      showToast('信已经销毁了。就当它真的被风吹走了。');
      setConfirmOpen(null);
      if (reading?.id === target.id) setReading(null);
    } catch (removeError) {
      showToast(
        removeError instanceof Error ? removeError.message : '删除失败，请稍后再试。',
        'caution',
      );
    }
  }

  const loading = status === 'idle' || status === 'loading';

  return (
    <div>
      {embedded ? (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[46ch] text-pretty text-[12.5px] leading-[1.9] text-ink-faint">
            有些话不适合说给任何人听，但憋着又太重。写下来，封起来，交给这个信箱保管 ——
            它不会转述，也不会评价。
          </p>
          <Button variant="primary" size="md" onClick={() => setComposeOpen(true)} className="shrink-0">
            <PenLine size={15} strokeWidth={1.7} />
            写一封
          </Button>
        </div>
      ) : (
        <header className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-[560px]">
            <p className="text-[11px] uppercase tracking-[0.42em] text-ink-ghost">Private Letters</p>
            <h1 className="mt-3 font-display text-[26px] font-light leading-tight tracking-[0.06em] text-ink sm:text-[34px]">
              心事信箱
            </h1>
            <p className="mt-3 max-w-[46ch] text-pretty text-[13.5px] leading-[1.9] text-ink-faint sm:text-sm">
              有些话不适合说给任何人听，但憋着又太重。写下来，封起来，
              交给这个信箱保管 —— 它不会转述，也不会评价。
            </p>
          </div>
          <Button variant="primary" size="md" onClick={() => setComposeOpen(true)} className="shrink-0">
            <PenLine size={15} strokeWidth={1.7} />
            写一封
          </Button>
        </header>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-[124px] animate-pulse rounded-[20px] border border-white/50 bg-white/30"
            />
          ))}
        </div>
      ) : status === 'error' || status === 'unavailable' ? (
        <p className="rounded-2xl border border-[rgba(158,95,92,0.2)] bg-[rgba(247,231,228,0.4)] px-4 py-3 text-[13px] text-[#8a6360]">
          {error ?? '信箱暂时打不开。'}
        </p>
      ) : letters.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <span className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-[rgba(201,182,232,0.18)]">
            <Mail size={20} strokeWidth={1.4} className="text-lavender-deep" aria-hidden="true" />
          </span>
          <p className="text-[14px] text-ink-soft">信箱里还没有信。</p>
          <p className="mt-2 max-w-[32ch] text-[12.5px] leading-[1.9] text-ink-faint">
            你可以把一件一直没放下的事写进来。写完之后不必马上再看它。
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {letters.map((letter, index) => (
            <motion.li
              key={letter.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: Math.min(index * 0.04, 0.3) }}
            >
              <button
                type="button"
                onClick={() => (letter.sealed ? setUnsealTarget(letter) : setReading(letter))}
                className="group flex h-full w-full flex-col rounded-[20px] border border-white/70 bg-white/50 p-5 text-left transition-all duration-500 hover:-translate-y-0.5 hover:bg-white/70"
              >
                <div className="flex items-center gap-2 text-[10.5px] tracking-[0.1em] text-ink-ghost">
                  {letter.sealed ? (
                    <Lock size={11} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <MailOpen size={11} strokeWidth={1.8} aria-hidden="true" />
                  )}
                  {letter.sealed ? '未拆' : '已拆开'}
                  <span aria-hidden="true">·</span>
                  <span>
                    {formatRelativeDay(letter.createdAt.slice(0, 10))}{' '}
                    {formatClock(letter.createdAt)}
                  </span>
                </div>

                <p className="mt-3 line-clamp-3 text-[13px] leading-[1.95] text-ink-soft">
                  {letter.sealed ? (
                    <span className="tracking-[0.2em] text-ink-ghost">
                      这封信还封着。想读的时候再拆开。
                    </span>
                  ) : (
                    letter.content
                  )}
                </p>

                <span className="mt-auto pt-3 text-[11px] text-ink-ghost transition-colors group-hover:text-lavender-deep">
                  {letter.sealed ? '拆开 →' : '再读一遍 →'}
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}

      {/* 永远可见的求助信息：不靠关键词触发，因为它本来就是给"写心事的人"看的 */}
      <div className="mt-10 flex gap-3 rounded-2xl border border-white/60 bg-white/40 px-4 py-3.5">
        <HeartHandshake
          size={15}
          strokeWidth={1.5}
          className="mt-[3px] shrink-0 text-ink-ghost"
          aria-hidden="true"
        />
        <p className="text-[11.5px] leading-[1.9] text-ink-faint">
          如果这些字里有你一个人扛不住的部分，可以试试拨打{' '}
          {CRISIS_RESOURCES.map((resource, index) => (
            <span key={resource.contact}>
              {index > 0 ? ' / ' : ''}
              <a
                href={`tel:${resource.contact.replace(/-/g, '')}`}
                className="text-ink-soft underline decoration-[rgba(141,133,152,0.4)] underline-offset-2 hover:text-ink"
              >
                {resource.contact}
              </a>
            </span>
          ))}
          （{CRISIS_RESOURCES[0]?.note}）。
        </p>
      </div>

      <Dialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="写一封心事"
        description="不用写给谁，也不用有开头结尾。写完封起来，之后可以随时销毁。"
        width="md"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-ink-ghost">{content.length} / 2000</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" size="md" onClick={() => setComposeOpen(false)}>
                先不写了
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => void seal()}
                disabled={!content.trim() || working}
              >
                <Lock size={14} strokeWidth={1.7} />
                {working ? '正在封存…' : '封起来'}
              </Button>
            </div>
          </div>
        }
      >
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="比如：今天被一句话刺到了，到现在还没缓过来……"
          rows={11}
          maxLength={2000}
          className="mb-field resize-y font-display text-[14px] leading-[2.1]"
        />
        <p className="mt-3 text-[11.5px] leading-[1.9] text-ink-ghost">
          这封信不会被任何人看到，也不会离开这台设备。
        </p>
      </Dialog>

      {/* 拆信 */}
      <ConfirmDialog
        open={unsealTarget !== null}
        onClose={() => setUnsealTarget(null)}
        onConfirm={() => {
          if (unsealTarget) void unseal(unsealTarget);
        }}
        title="要拆开吗？"
        description="封着的信有它自己的重量。拆开之后它就只是一段文字了 —— 也可以再等一阵子。"
        confirmLabel="拆开看看"
        cancelLabel="再封一会儿"
        tone="primary"
      />

      {/* 阅读 */}
      <Dialog
        open={reading !== null}
        onClose={() => setReading(null)}
        title="一封拆开的信"
        description={
          reading
            ? `写于 ${formatRelativeDay(reading.createdAt.slice(0, 10))} ${formatClock(reading.createdAt)}`
            : undefined
        }
        width="md"
        footer={
          reading ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(reading);
                  setReading(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-[#8a4a45] transition-colors hover:bg-[rgba(247,222,217,0.5)]"
              >
                <Trash2 size={13} strokeWidth={1.7} aria-hidden="true" />
                让它过去
              </button>
              <span className="text-[11px] text-ink-ghost">只有你看得到</span>
            </div>
          ) : null
        }
      >
        <AnimatePresence>
          {reading ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="whitespace-pre-wrap text-pretty font-display text-[14.5px] font-light leading-[2.15] text-ink-soft"
            >
              {reading.content}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen !== null}
        onClose={() => setConfirmOpen(null)}
        onConfirm={remove}
        title="让这封信过去？"
        description="它会被彻底删除，无法恢复。有时候销毁本身也是一种处理方式。"
        confirmLabel="销毁这封信"
      />
    </div>
  );
}
