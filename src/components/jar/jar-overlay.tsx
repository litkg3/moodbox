'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { ConfirmDeleteMemoryDialog } from '@/components/memories/confirm-delete-dialog';
import { DataSettings } from '@/components/memories/data-settings';
import { MemoryFormDialog } from '@/components/memories/memory-form-dialog';
import { GlassSheet } from '@/components/ui/glass-sheet';
import { MEMORY_MOOD_MAP } from '@/data/moods';
import { useMoodBox } from '@/hooks/use-moodbox';
import { formatFullDate } from '@/lib/date';
import type { Memory } from '@/types';

/** 罐子里最多摆出来的纸条数，再多就换成「还有 N 份」的提示，避免罐子被塞满。 */
const MAX_NOTES = 18;

/** 纸条的倾角按索引轮换，看起来像随手叠进去的，而不是排版出来的。 */
const TILTS = [-7, 4, -2, 6, -5, 3, -4, 7, -1, 5];

interface JarOverlayProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 开心罐。
 *
 * 原来是一个独立页面 + 一个「快乐收藏馆」页面，现在合成一张卡片：
 * 上面是罐子，下面是纸条清单，最下面是备份与隐私。
 * 打开方式由导航统一控制（见 ToolOverlayProvider）。
 */
export function JarOverlay({ open, onClose }: JarOverlayProps) {
  const { memories, status, error } = useMoodBox();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [deleting, setDeleting] = useState<Memory | null>(null);

  const visible = memories.slice(0, MAX_NOTES);
  const overflow = memories.length - visible.length;
  const demoCount = memories.filter((memory) => memory.isDemo).length;
  const loading = status === 'idle' || status === 'loading';

  function openCompose() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(memory: Memory) {
    setEditing(memory);
    setFormOpen(true);
  }

  return (
    <>
      <GlassSheet
        open={open}
        onClose={onClose}
        tone="glass"
        width="lg"
        title="开心罐"
        glowColor="rgba(206, 182, 234, 0.55)"
      >
        {loading ? (
          <div className="mx-auto aspect-[4/5] w-full max-w-[220px] animate-pulse rounded-[38px_38px_52px_52px] border border-white/50 bg-white/30" />
        ) : status === 'error' || status === 'unavailable' ? (
          <p className="rounded-2xl border border-[rgba(158,95,92,0.2)] bg-[rgba(247,231,228,0.4)] px-4 py-3 text-[13px] text-[#8a6360]">
            {error ?? '暂时打不开罐子。'}
          </p>
        ) : (
          <>
            <div className="grid gap-7 sm:grid-cols-[210px_1fr] sm:items-center">
              <Jar memories={memories} visible={visible} overflow={overflow} />

              <div>
                <p className="text-[13px] leading-[1.95] text-ink-faint">
                  每一件让你嘴角动了一下的小事，都叠成一张纸条丢进罐子里。不用的时候它在角落，需要的时候它还在。
                </p>
                <p className="mt-3 text-[12px] tracking-[0.08em] text-ink-soft">
                  {memories.length > 0
                    ? `罐子里收好了 ${memories.length} 份快乐${demoCount > 0 ? `（含 ${demoCount} 份示例）` : ''}`
                    : '罐子正等着第一张纸条'}
                </p>
                <button
                  type="button"
                  onClick={openCompose}
                  className="mb-btn-primary mt-5 inline-flex h-10 items-center gap-2 rounded-full px-5 text-[13px] tracking-[0.04em] transition-all duration-500 active:scale-[0.98]"
                >
                  <Plus size={15} strokeWidth={1.7} aria-hidden="true" />
                  收藏一份快乐
                </button>
              </div>
            </div>

            {memories.length > 0 ? (
              <section className="mt-7">
                <h3 className="mb-2.5 text-[11px] uppercase tracking-[0.32em] text-ink-ghost">
                  Notes
                </h3>
                <ul className="divide-y divide-[rgba(141,133,152,0.16)]">
                  {memories.map((memory) => {
                    const mood = MEMORY_MOOD_MAP[memory.mood];
                    return (
                      <li key={memory.id} className="group flex items-start gap-3 py-3">
                        <span
                          aria-hidden="true"
                          className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: mood?.tint ?? '#d9d3e4' }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-relaxed text-ink">{memory.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.8] text-ink-faint">
                            {memory.content}
                          </p>
                          <p className="mt-1 text-[10.5px] tracking-[0.06em] text-ink-ghost">
                            {formatFullDate(memory.date)}
                            {mood ? ` · ${mood.label}` : ''}
                            {memory.isDemo ? ' · 示例' : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => openEdit(memory)}
                            aria-label={`编辑：${memory.title}`}
                            className="grid h-8 w-8 place-items-center rounded-full text-ink-ghost transition-colors hover:bg-white/70 hover:text-ink"
                          >
                            <Pencil size={13} strokeWidth={1.7} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(memory)}
                            aria-label={`删除：${memory.title}`}
                            className="grid h-8 w-8 place-items-center rounded-full text-ink-ghost transition-colors hover:bg-[rgba(247,222,217,0.6)] hover:text-[#8a4a45]"
                          >
                            <Trash2 size={13} strokeWidth={1.7} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <div className="mt-6">
              <DataSettings compact />
            </div>
          </>
        )}
      </GlassSheet>

      <MemoryFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        memory={editing}
        onSaved={() => setFormOpen(false)}
      />

      <ConfirmDeleteMemoryDialog
        memory={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => setDeleting(null)}
      />
    </>
  );
}

function Jar({
  memories,
  visible,
  overflow,
}: {
  memories: Memory[];
  visible: Memory[];
  overflow: number;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[196px]">
      <div className="mb-jar-lid relative z-10 mx-auto h-3 w-[46%] rounded-full" />
      <div className="mb-jar-neck mx-auto -mt-1 h-3.5 w-[38%]" />

      <div
        className="mb-jar-body relative -mt-px aspect-[3/4] w-full overflow-hidden"
        style={{ borderRadius: '38% 38% 20% 20% / 15% 15% 9% 9%' }}
      >
        <span
          aria-hidden="true"
          className="mb-jar-gloss pointer-events-none absolute inset-y-6 left-[9%] w-[9%] rounded-full blur-[2px]"
        />
        <span
          aria-hidden="true"
          className="mb-jar-gloss-soft pointer-events-none absolute inset-y-10 right-[12%] w-[4%] rounded-full blur-[3px]"
        />

        {memories.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
            <Sparkles
              size={17}
              strokeWidth={1.4}
              className="mb-2 text-lavender-deep"
              aria-hidden="true"
            />
            <p className="text-[11.5px] leading-[1.85] text-ink-soft">
              罐子还是空的。
              <br />
              可以从今天开始。
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col justify-end p-4 pb-6">
            <div className="grid grid-cols-4 content-end gap-1.5">
              <AnimatePresence initial>
                {visible.map((memory, index) => (
                  <motion.span
                    key={memory.id}
                    initial={{ opacity: 0, y: 8, rotate: 0 }}
                    animate={{ opacity: 1, y: 0, rotate: TILTS[index % TILTS.length] }}
                    transition={{ duration: 0.45, delay: Math.min(index * 0.03, 0.45) }}
                    className="relative aspect-square rounded-[4px] shadow-[0_4px_10px_-6px_rgba(70,55,92,0.7)]"
                    style={{ backgroundColor: MEMORY_MOOD_MAP[memory.mood]?.tint ?? '#efe9f6' }}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute right-0 top-0 h-1.5 w-1.5 rounded-bl-[3px] bg-white/55"
                    />
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>

            {overflow > 0 ? (
              <p className="mt-2 text-center text-[9.5px] tracking-[0.12em] text-ink-ghost">
                还有 {overflow} 份
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="mx-auto mt-2.5 h-2 w-[64%] rounded-full bg-[radial-gradient(ellipse,rgba(70,55,92,0.18),transparent_70%)] blur-[2px]" />
    </div>
  );
}
