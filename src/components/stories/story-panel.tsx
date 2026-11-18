'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useStories } from '@/lib/content-stores';
import { STORY_THEME_META } from '@/data/story-themes';

interface StoryPanelProps {
  onBack: () => void;
}

/**
 * 面板里的「看个小故事」。
 *
 * 不跳页、不开第二个弹层 —— 就在这张卡片里把内容换掉，
 * 看完可以「换一篇」或者回到刚才那句话。
 */
export function StoryPanel({ onBack }: StoryPanelProps) {
  const { items: stories, status } = useStories();
  const [index, setIndex] = useState(() => Math.floor(Math.random() * Math.max(stories.length, 1)));

  const story = useMemo(() => {
    if (stories.length === 0) return null;
    return stories[index % stories.length] ?? null;
  }, [stories, index]);

  const next = useCallback(() => {
    setIndex((prev) => (stories.length <= 1 ? prev : prev + 1 + Math.floor(Math.random() * (stories.length - 1))));
  }, [stories.length]);

  const loading = status === 'idle' || status === 'loading';

  return (
    <div className="flex flex-col">
      <p className="mb-deep-faint text-center text-[10px] uppercase tracking-[0.4em]">
        A short story
      </p>

      {loading ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((row) => (
            <div key={row} className="mb-deep-skeleton h-3 animate-pulse rounded-full" />
          ))}
        </div>
      ) : story ? (
        <motion.div
          key={story.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5"
        >
          <div className="flex items-center justify-center gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-[10.5px] tracking-[0.1em]"
              style={{
                backgroundColor: STORY_THEME_META[story.theme]?.tint,
                color: STORY_THEME_META[story.theme]?.ink,
              }}
            >
              {STORY_THEME_META[story.theme]?.label ?? '故事'}
            </span>
          </div>

          <h3 className="mb-deep-strong mt-3 text-center font-display text-[18px] font-normal tracking-[0.06em] sm:text-[19px]">
            {story.title}
          </h3>

          <div className="mb-scroll-x mt-4 max-h-[36vh] overflow-y-auto overscroll-contain pr-1">
            <p className="mb-deep-body whitespace-pre-wrap text-left text-[13px] leading-[2.05]">
              {story.content}
            </p>
          </div>

          <p className="mb-deep-faint mt-3 text-center text-[10.5px] tracking-[0.08em]">
            {story.author}
          </p>
        </motion.div>
      ) : (
        <p className="mb-deep-muted mt-8 text-center text-[13px] leading-[1.9]">
          故事都还在路上。先回到刚才那句话吧。
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={next}
          disabled={stories.length <= 1}
          className="mb-deep-btn inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[12.5px] tracking-[0.04em] transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} strokeWidth={1.7} aria-hidden="true" />
          换一篇
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mb-deep-btn inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[12.5px] tracking-[0.04em] transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={1.7} aria-hidden="true" />
          回到刚才
        </button>
      </div>
    </div>
  );
}
