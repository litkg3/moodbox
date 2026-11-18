'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MiniCalendar } from '@/components/memories/mini-calendar';
import { useToast } from '@/components/ui/toast';
import { MEMORY_MOOD_LIST } from '@/data/moods';
import { todayKey, isValidDateKey } from '@/lib/date';
import { fileToMemoryImage, formatBytes, ImageError } from '@/lib/image';
import { moodBoxStore } from '@/lib/moodbox-store';
import { cn } from '@/lib/utils';
import type { Memory, MemoryImage, MemoryMoodId } from '@/types';

interface MemoryFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** 传入则为编辑模式 */
  memory: Memory | null;
  /** 预设日期（从日历进入时使用） */
  presetDate?: string;
  onSaved: (memory: Memory, isNew: boolean) => void;
}

/** 内容为空时的兜底标题：取第一个短句，避免从句子中间截断 */
function fallbackTitle(content: string): string {
  const clean = content.replace(/\s+/g, '').trim();
  if (clean.length === 0) return '一件小小的事';
  const firstClause = clean.split(/[，。！？；、,.!?;]/)[0] ?? clean;
  if (firstClause.length >= 4 && firstClause.length <= 18) return firstClause;
  return clean.length > 16 ? `${clean.slice(0, 16)}…` : clean;
}

export function MemoryFormDialog({
  open,
  onClose,
  memory,
  presetDate,
  onSaved,
}: MemoryFormDialogProps) {
  const isEdit = memory !== null;
  const { showToast } = useToast();

  const [date, setDate] = useState(todayKey());
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<MemoryMoodId>('warm');
  const [image, setImage] = useState<MemoryImage | undefined>(undefined);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ date?: string; content?: string }>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 打开时同步初始值（编辑 / 新增 / 日历预设日期）
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitting(false);
    if (memory) {
      setDate(memory.date);
      setContent(memory.content);
      setMood(memory.mood);
      setImage(memory.image);
    } else {
      setDate(presetDate && isValidDateKey(presetDate) ? presetDate : todayKey());
      setContent('');
      setMood('warm');
      setImage(undefined);
    }
  }, [open, memory, presetDate]);

  // 本地预览图（新建时是临时 Blob URL，编辑时是数据库里的 Blob）
  useEffect(() => {
    if (!image) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(image.blob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const imageSizeLabel = useMemo(
    () => (image ? `${image.width}×${image.height} · ${formatBytes(image.blob.size)}` : null),
    [image],
  );

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setPreparingImage(true);
    try {
      const optimized = await fileToMemoryImage(file);
      setImage(optimized);
    } catch (error) {
      showToast(error instanceof ImageError ? error.message : '图片处理失败，换一张试试。', 'caution');
    } finally {
      setPreparingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (submitting) return;

    const nextErrors: typeof errors = {};
    if (!isValidDateKey(date)) nextErrors.date = '请选择这一天的日期。';
    if (content.trim().length === 0) nextErrors.content = '写下一件让你开心的小事，再收藏它。';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const payload = {
      date,
      // 不再让用户起名字：标题由正文自动取一个短句，编辑时保留原标题
      title: isEdit && memory ? memory.title : fallbackTitle(content),
      content: content.trim(),
      mood,
      image,
    };

    try {
      const saved = isEdit
        ? await moodBoxStore.editMemory(memory.id, payload)
        : await moodBoxStore.addMemory(payload);
      onSaved(saved, !isEdit);
      onClose();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : '保存失败了，请稍后再试一次。',
        'caution',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑这份快乐' : '收藏一份快乐'}
      description={isEdit ? '改一改，它依然属于你。' : '不需要是大事，一点点就够。'}
      width="md"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="hidden text-[11px] tracking-[0.04em] text-ink-ghost sm:block">
            只保存在这台设备的浏览器里
          </span>
          <div className="flex w-full gap-2.5 sm:w-auto">
            <Button variant="ghost" size="md" onClick={onClose} className="flex-1 sm:flex-none">
              先不写
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 sm:min-w-[120px] sm:flex-none"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
              {isEdit ? '保存修改' : '收进盒子'}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <MiniCalendar value={date} onChange={setDate} maxKey={todayKey()} />
          {errors.date ? (
            <p className="mt-1.5 text-[11.5px] text-[#a4615c]">{errors.date}</p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="memory-content"
            className="mb-2 block text-[11.5px] tracking-[0.08em] text-ink-faint"
          >
            发生了什么
          </label>
          <textarea
            id="memory-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={4}
            maxLength={800}
            placeholder="今天有什么值得偷偷开心的小事吗？"
            aria-invalid={Boolean(errors.content)}
            className={cn(
              'w-full resize-none rounded-2xl border bg-white/70 px-4 py-3.5 text-[13.5px] leading-[1.95] text-ink outline-none transition-colors placeholder:text-ink-ghost/80',
              errors.content
                ? 'border-[#d8a09c] focus:border-[#c98a85]'
                : 'border-white/80 focus:border-lavender',
            )}
          />
          <div className="mt-1.5 flex items-center justify-between">
            {errors.content ? (
              <p className="text-[11.5px] text-[#a4615c]">{errors.content}</p>
            ) : (
              <span />
            )}
            <span className="text-[10.5px] tabular-nums text-ink-ghost">{content.length}/800</span>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[11.5px] tracking-[0.08em] text-ink-faint">
            那时的心情
          </span>
          <div className="flex flex-wrap gap-2">
            {MEMORY_MOOD_LIST.map((item) => {
              const active = mood === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMood(item.id)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-[12px] tracking-[0.04em] transition-all duration-300',
                    active
                      ? 'shadow-[0_6px_16px_-12px_rgba(70,55,92,0.9)]'
                      : 'opacity-65 hover:opacity-100',
                  )}
                  style={{
                    backgroundColor: item.tint,
                    color: item.ink,
                    outline: active ? `1px solid ${item.ink}55` : '1px solid transparent',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[11.5px] tracking-[0.08em] text-ink-faint">
            配一张图 <span className="text-ink-ghost">（可选，会压缩后保存在本地）</span>
          </span>
          {imageUrl ? (
            <div className="relative overflow-hidden rounded-2xl border border-white/70">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="这张记忆的配图预览" className="max-h-[220px] w-full object-cover" />
              <button
                type="button"
                onClick={() => setImage(undefined)}
                aria-label="移除这张图片"
                className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-white/85 text-ink-soft shadow-sm backdrop-blur-sm transition-colors hover:text-ink"
              >
                <X size={14} strokeWidth={1.8} />
              </button>
              {imageSizeLabel ? (
                <span className="absolute bottom-2.5 left-3 rounded-full bg-black/25 px-2 py-0.5 text-[10px] text-[#fff]/90 backdrop-blur-sm">
                  {imageSizeLabel}
                </span>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={preparingImage}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgba(141,133,152,0.35)] bg-white/35 py-5 text-[12px] text-ink-faint transition-colors hover:border-lavender hover:bg-white/55 hover:text-ink-soft disabled:opacity-60"
            >
              {preparingImage ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ImagePlus size={15} strokeWidth={1.6} />
              )}
              {preparingImage ? '正在处理图片…' : '添加一张照片'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </div>

        {/* 回车提交：表单在 Dialog 里，用隐藏按钮承载 submit */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </Dialog>
  );
}
