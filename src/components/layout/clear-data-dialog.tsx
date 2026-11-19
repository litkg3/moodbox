'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useMoodBox } from '@/hooks/use-moodbox';
import { describeBackend } from '@/lib/backend';
import { capsulesStore, lettersStore, squareStore } from '@/lib/content-stores';
import { moodBoxStore } from '@/lib/moodbox-store';

interface ClearDataDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 清空我的记录。
 *
 * 删除是不可逆的，所以这里做了三件事：
 * 1. 逐项列出将被删除的内容与数量，而不是笼统说"全部数据"；
 * 2. 必须主动勾选"我知道无法恢复"才能继续；
 * 3. 明确说明什么**不会**被删（内置故事、云端广场的帖子），避免误解。
 */
export function ClearDataDialog({ open, onClose }: ClearDataDialogProps) {
  const { memories, emotionLogs, bursts } = useMoodBox();
  const [acknowledged, setAcknowledged] = useState(false);
  const [working, setWorking] = useState(false);
  const { showToast } = useToast();

  const realMemories = memories.filter((memory) => !memory.isDemo).length;
  const cloudSquare = describeBackend().mode === 'supabase';

  async function handleClear() {
    if (!acknowledged || working) return;
    setWorking(true);
    try {
      await moodBoxStore.clearEverything();
      await Promise.all([lettersStore.refresh(), capsulesStore.refresh(), squareStore.refresh()]);
      showToast('已经清空了。这里现在是干净的。');
      setAcknowledged(false);
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空失败，请稍后再试。', 'caution');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        setAcknowledged(false);
        onClose();
      }}
      title="清空这台设备上的记录"
      description="这一步没有撤销。如果你只是想整理，可以先去「快乐收藏馆」逐条删除。"
      width="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setAcknowledged(false);
              onClose();
            }}
          >
            先不清了
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={handleClear}
            disabled={!acknowledged || working}
          >
            <Trash2 size={15} strokeWidth={1.7} />
            {working ? '正在清空…' : '确认清空'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-2xl border border-[rgba(158,95,92,0.18)] bg-[rgba(247,231,228,0.5)] px-4 py-3.5">
          <AlertTriangle
            size={15}
            strokeWidth={1.6}
            className="mt-[3px] shrink-0 text-[#9a6660]"
            aria-hidden="true"
          />
          <p className="text-[11.5px] leading-[1.85] text-[#8a6360]">
            删除后无法恢复，导出备份也没办法救回来 —— 除非你之前导出过 JSON 文件。
          </p>
        </div>

        <ul className="space-y-2 text-[13px] text-ink-soft">
          <li className="flex items-baseline justify-between gap-3 border-b border-[rgba(141,133,152,0.14)] pb-2">
            <span>快乐记忆</span>
            <span className="tabular-nums text-ink">{realMemories} 条</span>
          </li>
          <li className="flex items-baseline justify-between gap-3 border-b border-[rgba(141,133,152,0.14)] pb-2">
            <span>情绪记录</span>
            <span className="tabular-nums text-ink">{emotionLogs.length} 条</span>
          </li>
          <li className="flex items-baseline justify-between gap-3 border-b border-[rgba(141,133,152,0.14)] pb-2">
            <span>心事信件 / 时光信件</span>
            <span className="text-ink">全部</span>
          </li>
          <li className="flex items-baseline justify-between gap-3 border-b border-[rgba(141,133,152,0.14)] pb-2">
            <span>你发的树洞帖子</span>
            <span className="text-ink">{cloudSquare ? '不在这里删' : '全部'}</span>
          </li>
          <li className="flex items-baseline justify-between gap-3">
            <span>已散去的情绪球</span>
            <span className="tabular-nums text-ink">{bursts.length} 颗</span>
          </li>
        </ul>

        <label className="mt-1 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/70 bg-white/45 px-4 py-3">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-[3px] h-4 w-4 shrink-0 accent-[#8e76b8]"
          />
          <span className="text-[12.5px] leading-[1.8] text-ink-soft">
            我知道这些内容删除后无法恢复。
          </span>
        </label>
      </div>
    </Dialog>
  );
}
