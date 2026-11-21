'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { Music2, Settings2, Trash2, X } from 'lucide-react';
import { AudioPlayer } from '@/components/audio/audio-player';
import { useClearData } from '@/components/layout/clear-data-provider';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { useOverlayBehavior } from '@/hooks/use-overlay-behavior';

/**
 * 设置面板。
 *
 * 「清空数据」原来直接摆在导航里，和「关于」并排、同一个颜色，
 * 权重高得离谱 —— 一个不可撤销的动作不该长得像一个普通入口。
 * 现在它被收进这里：与主题、音乐放在同一张卡片，但单独一栏、
 * 用危险色、写清楚会删掉什么，点了还要再过一次确认弹层。
 */
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const requestClear = useClearData();
  const { containerRef } = useOverlayBehavior<HTMLDivElement>({ open, onClose });

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-[rgba(26,22,38,0.28)] backdrop-blur-[12px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label="设置"
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="mb-panel relative w-full max-w-[440px] rounded-t-[28px] border border-white/70 p-5 pb-7 shadow-[0_34px_80px_-40px_rgba(40,30,60,0.65)] sm:rounded-[26px] sm:p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 size={15} strokeWidth={1.7} className="text-ink-faint" aria-hidden="true" />
                <h2 className="font-display text-[15px] tracking-[0.1em] text-ink">设置</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭设置"
                className="grid h-8 w-8 place-items-center rounded-full text-ink-ghost transition-colors hover:bg-white/60 hover:text-ink"
              >
                <X size={15} strokeWidth={1.7} />
              </button>
            </div>

            <section aria-label="外观">
              <p className="text-[10.5px] tracking-[0.2em] text-ink-ghost">外观</p>
              <div className="mt-2 space-y-2">
                <Row
                  icon={<span className="block h-[15px] w-[15px] rounded-full bg-[linear-gradient(135deg,#f5dfa4,#f2bfbe)]" />}
                  label="白日 / 星空"
                  hint="换一个时间里的同一间屋子"
                  control={<ThemeToggle withLabel />}
                />
                <Row
                  icon={<Music2 size={14} strokeWidth={1.7} />}
                  label="背景音乐"
                  hint="不自动播放，点开才响"
                  control={<AudioPlayer compact />}
                />
              </div>
            </section>

            {/*
              危险区：单独一栏 + 分隔线 + 危险色。
              这里只是入口，真正的删除在确认弹层里做，并且要勾一句"我知道无法恢复"。
            */}
            <section aria-label="数据" className="mt-6 border-t border-[rgba(141,133,152,0.16)] pt-4">
              <p className="text-[10.5px] tracking-[0.2em] text-[#9a6660]">数据</p>
              <p className="mt-2 text-[11.5px] leading-[1.85] text-ink-ghost">
                你收藏的快乐、记下的情绪只在这台设备上；广场上发过的帖子是公开的。
              </p>
              <Button
                variant="danger"
                size="md"
                className="mt-3 w-full justify-center"
                onClick={() => {
                  onClose();
                  requestClear();
                }}
              >
                <Trash2 size={14} strokeWidth={1.7} />
                清空这台设备上的记录
              </Button>
              <p className="mt-2 text-center text-[10.5px] text-ink-ghost">
                不可撤销，需要再确认一次
              </p>
            </section>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function Row({
  icon,
  label,
  hint,
  control,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-white/60 bg-white/40 px-3.5 py-2.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/70 text-ink-faint">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] text-ink">{label}</span>
        <span className="mt-0.5 block truncate text-[10.5px] text-ink-ghost">{hint}</span>
      </span>
      {control}
    </div>
  );
}
