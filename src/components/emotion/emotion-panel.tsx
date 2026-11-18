'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BookOpen, BookmarkPlus, Check, HeartHandshake, Mail, Sparkles, Sun, Wind } from 'lucide-react';
import { StoryPanel } from '@/components/stories/story-panel';
import { GlassSheet } from '@/components/ui/glass-sheet';
import { useToast } from '@/components/ui/toast';
import { pickMessage } from '@/lib/emotions';
import { lettersStore } from '@/lib/content-stores';
import { moodBoxStore } from '@/lib/moodbox-store';
import type { Emotion } from '@/types';

interface EmotionPanelProps {
  emotion: Emotion | null;
  onClose: () => void;
  /** 选择「捏爆它」：卡片退场，球在主页碎裂消失 */
  onBurst: (emotion: Emotion) => void;
}

/** 情绪陪伴面板：点击球体后出现，内容逐条切换，绝不生硬跳页。 */
export function EmotionPanel({ emotion, onClose, onBurst }: EmotionPanelProps) {
  // 退场动画期间还需要内容，所以「关闭后」多留一小会儿
  const [held, setHeld] = useState<Emotion | null>(emotion);

  useEffect(() => {
    if (emotion) {
      setHeld(emotion);
      return;
    }
    const timer = window.setTimeout(() => setHeld(null), 360);
    return () => window.clearTimeout(timer);
  }, [emotion]);

  return (
    <GlassSheet
      open={emotion !== null}
      onClose={onClose}
      tone="deep"
      width="md"
      labelledBy="emotion-panel-title"
      glowColor={held ? held.palette.mid : undefined}
    >
      {held ? (
        <EmotionPanelContent
          key={held.id}
          emotion={held}
          onClose={onClose}
          onBurst={onBurst}
        />
      ) : null}
    </GlassSheet>
  );
}

function EmotionPanelContent({
  emotion,
  onClose,
  onBurst,
}: {
  emotion: Emotion;
  onClose: () => void;
  onBurst: (emotion: Emotion) => void;
}) {
  const [entry, setEntry] = useState(() => pickMessage(emotion.messages));
  const [recorded, setRecorded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [reading, setReading] = useState(false);
  const [letterDraft, setLetterDraft] = useState('');
  const [letterBusy, setLetterBusy] = useState(false);
  const reduce = useReducedMotion();
  const { showToast } = useToast();

  function warmUp() {
    setEntry((prev) => pickMessage(emotion.messages, prev.recent));
  }

  /** 面板里写完的心事，直接封存进心事信箱（与信箱卡片是同一份数据）。 */
  async function keepLetter() {
    const text = letterDraft.trim();
    if (!text || letterBusy) return;
    setLetterBusy(true);
    try {
      await lettersStore.write(text);
      setLetterDraft('');
      showToast('收好了。它现在只属于这封信。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '没能收好，请稍后再试。', 'caution');
    } finally {
      setLetterBusy(false);
    }
  }

  async function recordMoment() {
    if (recorded || recording) return;
    setRecording(true);
    try {
      await moodBoxStore.checkInEmotion(emotion.id);
      setRecorded(true);
      showToast('这份心情，已经被今天的你记住了。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '暂时没能记录，请稍后再试。', 'caution');
    } finally {
      setRecording(false);
    }
  }

  if (reading) {
    return (
      <>
        {/* 读故事时卡片标题换成故事，但 aria-labelledby 仍然要有落点 */}
        <h2 id="emotion-panel-title" className="sr-only">
          {emotion.label}
        </h2>
        <StoryPanel onBack={() => setReading(false)} />
      </>
    );
  }

  return (
    <div className="pt-2">
      {/* 球本身 + 名字 */}
      <div className="flex flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="h-12 w-12 rounded-full shadow-[0_14px_30px_-16px_rgba(0,0,0,0.9)]"
          style={{
            background: `radial-gradient(120% 120% at 30% 22%, #ffffff 0%, ${emotion.palette.mid} 55%, ${emotion.palette.deep} 100%)`,
          }}
        />
        <h2
          id="emotion-panel-title"
          className="mb-deep-strong mt-4 font-display text-[20px] font-normal tracking-[0.16em] sm:text-[22px]"
        >
          {emotion.label}
        </h2>
        <p className="mb-deep-faint mt-1 text-[9.5px] uppercase tracking-[0.34em]">
          {emotion.latin}
        </p>
      </div>

      {/* 主体那句话：白色、居中、慢慢换 */}
      <div className="mt-7 flex min-h-[132px] items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={entry.message}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(3px)' }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="mb-deep-strong text-balance text-center font-display text-[16.5px] font-light leading-[2.05] tracking-[0.03em] sm:text-[17.5px]"
            aria-live="polite"
          >
            {entry.message}
          </motion.p>
        </AnimatePresence>
      </div>

      {/*
        「捏爆它」紧跟安慰语、居中、做得显眼：
        它是最直接的释放动作，不该缩在两个小字旁边。
      */}
      <button
        type="button"
        onClick={() => onBurst(emotion)}
        className="mb-burst-btn group mx-auto mt-3 flex h-11 items-center justify-center gap-2 rounded-full px-7 text-[13px] tracking-[0.06em] transition-colors active:scale-[0.99]"
        title="把这颗球捏碎，让这股劲儿散掉"
      >
        <Wind
          size={15}
          strokeWidth={1.7}
          aria-hidden="true"
          className="transition-transform duration-500 group-hover:-rotate-12"
        />
        捏爆它，释放情绪
      </button>

      {/* 三个主按钮，居中排一排（窄屏换行也保持居中） */}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={warmUp}
          className="mb-deep-btn-primary inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[12.5px] tracking-[0.04em] transition-all duration-300 active:scale-[0.98]"
        >
          <Sparkles size={14} strokeWidth={1.7} aria-hidden="true" />
          再给我一点温暖
        </button>
        <button
          type="button"
          onClick={() => setReading(true)}
          className="mb-deep-btn inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[12.5px] tracking-[0.04em] transition-colors"
        >
          <BookOpen size={14} strokeWidth={1.7} aria-hidden="true" />
          看个小故事
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mb-deep-btn inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[12.5px] tracking-[0.04em] transition-colors"
        >
          <Sun size={14} strokeWidth={1.7} aria-hidden="true" />
          我感觉好一点了
        </button>
      </div>

      {/* 次要动作：记录此刻的情绪 */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={recordMoment}
          disabled={recorded || recording}
          aria-live="polite"
          className="mb-deep-muted inline-flex items-center gap-1.5 rounded-full text-[11.5px] tracking-[0.05em] transition-opacity hover:opacity-75 disabled:cursor-default disabled:opacity-45"
        >
          {recorded ? (
            <Check size={13} strokeWidth={1.8} />
          ) : (
            <BookmarkPlus size={13} strokeWidth={1.6} />
          )}
          {recorded ? '已收进今天的情绪里' : recording ? '正在记录…' : '记录此刻的情绪'}
        </button>
      </div>

      {/* 分隔线：下半部分给心事信箱，让这块卡片也能直接写一封 */}
      <div className="mt-6 pt-1">
        <div aria-hidden="true" className="mb-deep-divider mb-5" />
        <div className="mb-deep-muted flex items-center justify-center gap-1.5 text-[11.5px] tracking-[0.06em]">
          <Mail size={13} strokeWidth={1.6} aria-hidden="true" />
          心事信箱
        </div>
        <p className="mb-deep-faint mt-1.5 text-center text-[11px] leading-relaxed">
          不想说给别人听的话，写在这里，封起来交给它保管。
        </p>

        <div className="relative mt-3">
          <textarea
            value={letterDraft}
            onChange={(event) => setLetterDraft(event.target.value)}
            placeholder="此刻的心里话…"
            rows={3}
            maxLength={800}
            aria-label="心事内容"
            className="mb-deep-field w-full resize-none rounded-2xl px-4 pb-11 pt-3 text-[12.5px] leading-[1.9] outline-none"
          />
          <button
            type="button"
            onClick={() => void keepLetter()}
            disabled={!letterDraft.trim() || letterBusy}
            className="mb-deep-btn-primary absolute bottom-2.5 right-2.5 inline-flex h-8 items-center gap-1 rounded-full px-3.5 text-[11.5px] tracking-[0.04em] transition-all duration-300 disabled:cursor-default disabled:opacity-45"
          >
            <Check size={12} strokeWidth={1.9} aria-hidden="true" />
            {letterBusy ? '收好中…' : '收好这条心事'}
          </button>
        </div>
        <p className="mb-deep-faint mt-2 text-right text-[10.5px]">
          {letterDraft.length} / 800
        </p>
      </div>

      {/* 允许情绪存在，也承认有些情绪需要人帮忙 */}
      {emotion.supportNote ? (
        <div className="mb-support-note mt-5 flex gap-3 rounded-2xl px-4 py-3.5">
          <HeartHandshake
            size={15}
            strokeWidth={1.5}
            className="mb-deep-muted mt-[3px] shrink-0"
            aria-hidden="true"
          />
          <p className="mb-deep-muted text-[11.5px] leading-[1.85]">{emotion.supportNote}</p>
        </div>
      ) : null}
    </div>
  );
}
