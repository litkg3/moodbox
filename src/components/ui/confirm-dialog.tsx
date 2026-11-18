'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  tone?: 'danger' | 'primary';
}

/**
 * 通用确认框。
 *
 * 与 `ConfirmDeleteMemoryDialog` 的区别：那个绑定在"一条记忆"上，
 * 这个用于故事、帖子、信件等任意对象，避免为每种内容复制一遍弹层。
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = '确认删除',
  cancelLabel = '先不要',
  busy = false,
  tone = 'danger',
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width="sm"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {children ?? (
        <p className="text-[12.5px] leading-[1.95] text-ink-soft">
          {description ?? '这个操作无法撤销。'}
        </p>
      )}
    </Dialog>
  );
}
