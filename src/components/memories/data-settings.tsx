'use client';

import { useRef, useState } from 'react';
import {
  ChevronDown,
  Database,
  Download,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useMoodBox } from '@/hooks/use-moodbox';
import { createDemoEmotionLogs, createDemoMemories } from '@/data/demo';
import {
  buildExportPayload,
  downloadExport,
  ImportError,
  importIntoDatabase,
  readExportFile,
} from '@/lib/export-import';
import { formatBytes } from '@/lib/image';
import { bulkPutEmotionLogs, bulkPutMemories, deleteEmotionLog, deleteMemory, getStorageInfo } from '@/lib/memories-repo';
import { moodBoxStore } from '@/lib/moodbox-store';
import { cn } from '@/lib/utils';

/**
 * 备份与隐私面板。
 * 所有操作都真实作用于 IndexedDB，不假装“已同步云端”。
 */
export function DataSettings({ compact = false }: { compact?: boolean } = {}) {
  const { memories, emotionLogs, status } = useMoodBox();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'export' | 'import' | 'demo' | 'clear' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number; supported: boolean } | null>(
    null,
  );
  const importRef = useRef<HTMLInputElement | null>(null);

  const demoCount = memories.filter((memory) => memory.isDemo).length;

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !storage) {
      const info = await getStorageInfo();
      setStorage({ usage: info.usage, quota: info.quota, supported: info.supported });
    }
  }

  async function handleExport() {
    if (busy) return;
    setBusy('export');
    try {
      const payload = await buildExportPayload(memories, emotionLogs);
      downloadExport(payload);
      showToast(`已导出 ${memories.length} 份快乐、${emotionLogs.length} 条情绪记录。`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败，请稍后再试。', 'caution');
    } finally {
      setBusy(null);
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file || busy) return;
    setBusy('import');
    try {
      const payload = await readExportFile(file);
      const result = await importIntoDatabase(payload, memories, emotionLogs);
      await moodBoxStore.syncAfterBulkWrite();
      showToast(
        result.imported + result.emotionsImported > 0
          ? `导入完成：新增 ${result.imported} 份快乐、${result.emotionsImported} 条情绪记录。`
          : '这些记录已经都在盒子里了，没有重复导入。',
      );
    } catch (error) {
      const message =
        error instanceof ImportError
          ? error.message
          : error instanceof Error
            ? error.message
            : '导入失败，请检查文件。';
      showToast(message, 'caution');
    } finally {
      setBusy(null);
      if (importRef.current) importRef.current.value = '';
    }
  }

  async function loadDemoData() {
    if (busy) return;
    setBusy('demo');
    try {
      await bulkPutMemories(createDemoMemories());
      await bulkPutEmotionLogs(createDemoEmotionLogs());
      await moodBoxStore.syncAfterBulkWrite();
      showToast('已载入示例数据，卡片上会标注「示例」，可随时清除。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '载入示例失败。', 'caution');
    } finally {
      setBusy(null);
    }
  }

  async function removeDemoData() {
    if (busy) return;
    setBusy('demo');
    try {
      const demoMemories = memories.filter((memory) => memory.isDemo);
      const demoLogs = emotionLogs.filter((log) => log.isDemo);
      await Promise.all([
        ...demoMemories.map((memory) => deleteMemory(memory.id)),
        ...demoLogs.map((log) => deleteEmotionLog(log.id)),
      ]);
      await moodBoxStore.syncAfterBulkWrite();
      showToast('示例数据已清除，你自己的记录没有被改动。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清除示例失败。', 'caution');
    } finally {
      setBusy(null);
    }
  }

  async function clearAll() {
    if (busy) return;
    setBusy('clear');
    try {
      await moodBoxStore.clearEverything();
      setConfirmClear(false);
      showToast('盒子已经空了。如果之后想找回，可以从之前导出的备份导入。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空失败。', 'caution');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={compact ? '' : 'mt-16 sm:mt-20'}>
      <button
        type="button"
        onClick={() => void toggleOpen()}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 rounded-[20px] border border-white/70 bg-white/40 px-5 py-4 text-left transition-colors hover:bg-white/60 sm:px-6"
      >
        <span className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/70 text-ink-faint">
            <Database size={15} strokeWidth={1.6} />
          </span>
          <span>
            <span className="block text-[13px] tracking-[0.05em] text-ink">备份与隐私</span>
            <span className="mt-0.5 block text-[11px] text-ink-ghost">
              只存在这台设备 · 可以导出备份
            </span>
          </span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.6}
          className={cn('shrink-0 text-ink-ghost transition-transform duration-500', open && 'rotate-180')}
        />
      </button>

      <div
        className={cn(
          'grid overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
          open ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0">
          <div className="rounded-[22px] border border-white/60 bg-white/35 p-5 sm:p-7">
            <div className="flex gap-3 rounded-2xl bg-white/45 px-4 py-3.5">
              <ShieldCheck size={16} strokeWidth={1.6} className="mt-[2px] shrink-0 text-ink-faint" />
              <p className="text-[11.5px] leading-[1.9] text-ink-faint">
                你收藏的快乐与记下的情绪只存在这台设备上，不会上传到任何服务器，也没有账号。
                广场上发的帖子是例外：它公开，谁都能看见。
                清除浏览器网站数据、使用无痕模式或更换设备，都可能导致记录丢失，建议定期导出一份备份。
                导入备份采用合并方式，不会覆盖你已有的记录。
              </p>
            </div>

            {storage?.supported ? (
              <div className="mt-5">
                <div className="flex items-baseline justify-between text-[11px] text-ink-ghost">
                  <span>本地存储用量</span>
                  <span className="tabular-nums">
                    {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
                  </span>
                </div>
                <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/70">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#c9b6e8,#f2bfbe)] transition-[width] duration-700"
                    style={{
                      width: `${Math.min(100, Math.max(2, (storage.usage / Math.max(1, storage.quota)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2.5">
              <Button variant="glass" size="sm" onClick={() => void handleExport()} disabled={busy !== null}>
                {busy === 'export' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} strokeWidth={1.6} />}
                导出备份
              </Button>

              <Button
                variant="glass"
                size="sm"
                onClick={() => importRef.current?.click()}
                disabled={busy !== null || status !== 'ready'}
              >
                {busy === 'import' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} strokeWidth={1.6} />}
                导入备份
              </Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void handleImport(event.target.files?.[0])}
              />

              <Button variant="glass" size="sm" onClick={() => void loadDemoData()} disabled={busy !== null}>
                {busy === 'demo' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={1.6} />}
                载入演示数据
              </Button>

              {demoCount > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => void removeDemoData()} disabled={busy !== null}>
                  清除示例（{demoCount + emotionLogs.filter((log) => log.isDemo).length} 条）
                </Button>
              ) : null}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmClear(true)}
                disabled={busy !== null}
                className="text-[#9a5f58] hover:bg-[#f7e4e0] hover:text-[#8a4a45]"
              >
                <Trash2 size={13} strokeWidth={1.6} />
                清空全部
              </Button>
            </div>

            <p className="mt-5 text-[11px] leading-[1.85] text-ink-ghost">
              示例数据仅用于演示与评审，卡片上会明确标注「示例」。清除示例不会影响你自己的记录。
            </p>
          </div>
        </div>
      </div>

      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="确定要清空整个盒子吗？"
        description="包括你收藏的快乐记忆和所有情绪记录，清空后无法恢复。"
        width="sm"
        footer={
          <div className="flex justify-end gap-2.5">
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
              再想想
            </Button>
            <Button variant="danger" size="sm" onClick={() => void clearAll()} disabled={busy === 'clear'}>
              {busy === 'clear' ? <Loader2 size={13} className="animate-spin" /> : null}
              确认清空
            </Button>
          </div>
        }
      >
        <p className="text-[12.5px] leading-[1.95] text-ink-soft">
          如果只是想让别人看不到这些内容，可以直接关闭页面，或者先导出一份备份再清空。
          盒子会重新变成一片安静的天空。
        </p>
      </Dialog>
    </section>
  );
}
