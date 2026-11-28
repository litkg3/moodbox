'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { memoryTitle } from '@/lib/memory-title';
import { moodBoxStore } from '@/lib/moodbox-store';
import type { Memory } from '@/types';

interface ConfirmDeleteMemoryDialogProps {
  memory: Memory | null;
  onClose: () => void;
  onDeleted?: (memory: Memory) => void;
}

/** 收藏馆与日历共用的删除确认。删除前一定先问一句。 */
export function ConfirmDeleteMemoryDialog({
  memory,
  onClose,
  onDeleted,
}: ConfirmDeleteMemoryDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const { showToast } = useToast();

  async function handleDelete() {
    if (!memory || deleting) return;
    setDeleting(true);
    try {
      await moodBoxStore.removeMemory(memory.id);
      onDeleted?.(memory);
      onClose();
      showToast('这条记忆已经从盒子里取出来了。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败，请稍后再试。', 'caution');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={memory !== null}
      onClose={onClose}
      title="要把它从盒子里取出来吗？"
      description="删除后无法恢复。如果只是暂时不想看见，也可以先留着。"
      width="sm"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            先留着
          </Button>
          <Button variant="danger" size="sm" onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? <Loader2 size={13} className="animate-spin" /> : null}
            删除这份记忆
          </Button>
        </div>
      }
    >
      <p className="text-[12.5px] leading-[1.95] text-ink-soft">
        《{memory ? memoryTitle(memory) : ''}》
        <br />
        <span className="text-ink-ghost">{memory?.date}</span>
      </p>
    </Dialog>
  );
}
