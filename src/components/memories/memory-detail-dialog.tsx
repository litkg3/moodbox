'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useBlobUrl } from '@/hooks/use-blob-url';
import { MEMORY_MOOD_MAP } from '@/data/moods';
import { formatClock, formatFullDate } from '@/lib/date';
import type { Memory } from '@/types';

interface MemoryDetailDialogProps {
  memory: Memory | null;
  onClose: () => void;
  onEdit: (memory: Memory) => void;
  onDelete: (memory: Memory) => void;
}

export function MemoryDetailDialog({ memory, onClose, onEdit, onDelete }: MemoryDetailDialogProps) {
  const mood = memory ? MEMORY_MOOD_MAP[memory.mood] : null;
  const imageUrl = useBlobUrl(memory?.image?.blob);

  return (
    <Dialog
      open={memory !== null}
      onClose={onClose}
      title={memory?.title ?? ''}
      description={memory ? `${formatFullDate(memory.date)} · ${mood?.label ?? ''}` : undefined}
      width="md"
      footer={
        memory ? (
          <div className="flex items-center justify-between gap-3">
            <span className="hidden text-[11px] tracking-[0.04em] text-ink-ghost sm:block">
              收录于 {formatClock(memory.createdAt)}
            </span>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(memory)}
                className="flex-1 text-[#9a5f58] hover:bg-[#f7e4e0] hover:text-[#8a4a45] sm:flex-none"
              >
                <Trash2 size={13} strokeWidth={1.6} />
                删除
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onEdit(memory)}
                className="flex-1 sm:flex-none"
              >
                <Pencil size={13} strokeWidth={1.6} />
                编辑
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      {memory ? (
        <div>
          {memory.isDemo ? (
            <p className="mb-4 inline-block rounded-full border border-[rgba(141,133,152,0.3)] px-2 py-1 text-[9.5px] tracking-[0.14em] text-ink-ghost">
              示例数据 · 不是你的真实记录
            </p>
          ) : null}

          {imageUrl ? (
            <div className="mb-5 overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={`${memory.title} 的照片`} className="w-full object-cover" />
            </div>
          ) : null}

          <p className="whitespace-pre-wrap text-[13.5px] leading-[2.05] text-ink-soft">
            {memory.content}
          </p>

          {mood ? (
            <div className="mt-6 flex items-center gap-2">
              <span
                className="rounded-full px-2.5 py-[3px] text-[10.5px] tracking-[0.08em]"
                style={{ backgroundColor: mood.tint, color: mood.ink }}
              >
                {mood.label}
              </span>
              <span className="text-[10.5px] text-ink-ghost">
                这份记忆保存在你当前使用的设备上
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
