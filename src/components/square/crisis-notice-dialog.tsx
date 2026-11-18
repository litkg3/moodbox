'use client';

import { HeartHandshake, LifeBuoy, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { CRISIS_CARE_LINE, CRISIS_RESOURCES } from '@/lib/crisis';

interface CrisisNoticeDialogProps {
  open: boolean;
  /** 选择「先不发」 */
  onClose: () => void;
  /** 选择「仍然发出去」 */
  onPublish: () => void;
  publishLabel?: string;
}

/**
 * 自伤 / 自杀相关表达的温柔提示。
 *
 * 三个刻意的设计决定：
 * 1. **不拦截**。用户可以看完提示后照常发布 —— 把话堵回去，
 *    往往比让它留在树洞里更危险；
 * 2. **不做诊断**。通篇没有"你有抑郁倾向"这类句子，只表达"我有点担心你"；
 * 3. **给出具体电话**。只说"请寻求帮助"而不给号码，等于什么都没说。
 */
export function CrisisNoticeDialog({
  open,
  onClose,
  onPublish,
  publishLabel = '仍然发出去',
}: CrisisNoticeDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="你写的这些，让我有点担心你"
      description="我不认识你，也没办法替你做判断 —— 但我想认真地问一句：你现在还好吗？"
      width="md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="md" onClick={onPublish}>
            {publishLabel}
          </Button>
          <Button variant="primary" size="md" onClick={onClose}>
            <HeartHandshake size={15} strokeWidth={1.6} />
            先不给别人看
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-pretty text-[13.5px] leading-[2] text-ink-soft">
          你不需要一个人扛。下面这些电话是免费的，接电话的人受过训练，
          他们听过很多和你此刻相似的话 —— 你不需要先把事情讲清楚，才配被打扰。
        </p>

        <ul className="space-y-2.5">
          {CRISIS_RESOURCES.map((resource) => (
            <li
              key={resource.contact}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/45 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[12.5px] text-ink">{resource.name}</p>
                <p className="mt-0.5 text-[11px] text-ink-ghost">{resource.note}</p>
              </div>
              <a
                href={`tel:${resource.contact.replace(/-/g, '')}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[rgba(201,182,232,0.22)] px-3 py-1.5 text-[12.5px] tabular-nums text-ink-soft transition-colors hover:bg-[rgba(201,182,232,0.36)]"
              >
                <Phone size={12} strokeWidth={1.7} aria-hidden="true" />
                {resource.contact}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex gap-3 rounded-2xl border border-[rgba(158,95,92,0.18)] bg-[rgba(247,231,228,0.5)] px-4 py-3.5">
          <LifeBuoy
            size={15}
            strokeWidth={1.6}
            className="mt-[3px] shrink-0 text-[#9a6660]"
            aria-hidden="true"
          />
          <p className="text-[11.5px] leading-[1.85] text-[#8a6360]">{CRISIS_CARE_LINE}</p>
        </div>

        <p className="text-[11.5px] leading-[1.9] text-ink-ghost">
          这条内容你仍然可以选择发出去。要不要说出口，由你决定。
        </p>
      </div>
    </Dialog>
  );
}
