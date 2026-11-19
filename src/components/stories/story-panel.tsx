'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useStories } from '@/lib/content-stores';
import { STORY_THEME_META } from '@/data/story-themes';
import { cn } from '@/lib/utils';
import type { Emotion, HealingStory } from '@/types';

interface StoryPanelProps {
  onBack: () => void;
  /**
   * 是哪个情绪球进来的。
   *
   * 有些球带自己的故事（`emotion.story`），这时只展示那一篇：
   * 它是为这个情绪写的，掺进通用故事里就散了。
   * 不传或没有专属故事时，仍然从故事集里随机抽。
   */
  emotion?: Emotion;
}

/**
 * 面板里的「看个小故事」。
 *
 * 不跳页、不开第二个弹层 —— 就在这张卡片里把内容换掉，
 * 看完可以「换一篇」或者回到刚才那句话。
 */
export function StoryPanel({ onBack, emotion }: StoryPanelProps) {
  const { items: stories, status } = useStories();
  const [index, setIndex] = useState(() => Math.floor(Math.random() * Math.max(stories.length, 1)));

  /**
   * 专属故事会被包成一条 HealingStory 再走同一套渲染，
   * 这样标题、正文、署名的排版不用写两遍。
   */
  const own = useMemo<HealingStory | null>(() => {
    const story = emotion?.story;
    if (!story) return null;
    return {
      id: `emotion_story_${emotion.id}`,
      title: story.title,
      content: story.content,
      theme: story.theme,
      author: story.author ?? '情绪盒子',
      createdAt: '',
      updatedAt: '',
      isDemo: true,
    };
  }, [emotion]);

  const story = useMemo(() => {
    if (own) return own;
    if (stories.length === 0) return null;
    return stories[index % stories.length] ?? null;
  }, [own, stories, index]);

  const next = useCallback(() => {
    setIndex((prev) => (stories.length <= 1 ? prev : prev + 1 + Math.floor(Math.random() * (stories.length - 1))));
  }, [stories.length]);

  const loading = !own && (status === 'idle' || status === 'loading');
  // 只有一篇时不给「换一篇」：按下去还是同一篇，只会让人以为没反应
  const canSwitch = !own && stories.length > 1;

  /*
   * 正文还有没有没看完的部分。
   *
   * 滚动条是藏起来的，长文（比如焦虑球那篇近 300 字）在小屏上只能露出
   * 前四段，读者会以为文章就到这里 —— 于是在底部做一层淡出，等于说
   * 「下面还有」。滚到底就把淡出撤掉，否则最后一行永远是虚的。
   */
  const bodyRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const update = () => {
      // 留 2px 容差：小数像素会把「刚好到底」算成还有 0.5px
      setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
    // 换故事时要重新量：上一篇可能很短，这一篇可能很长
  }, [story?.id]);

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

          <div
            ref={bodyRef}
            data-story-body=""
            className={cn(
              'mb-scroll-x mt-4 max-h-[36vh] overflow-y-auto overscroll-contain pr-1',
              moreBelow && 'mb-fade-bottom',
            )}
          >
            <p className="mb-deep-body whitespace-pre-wrap text-left text-[13px] leading-[2.05]">
              {story.content}
            </p>
          </div>

          {/* 底部淡出容易让人以为"到底了"，再补一句明确的邀请 */}
          {moreBelow ? (
            <p className="mb-deep-faint mt-1 text-center text-[10px] tracking-[0.14em]">
              下面还有 · 往下滑
            </p>
          ) : null}

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
        {canSwitch ? (
          <button
            type="button"
            onClick={next}
            className="mb-deep-btn inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[12.5px] tracking-[0.04em] transition-colors"
          >
            <RefreshCw size={13} strokeWidth={1.7} aria-hidden="true" />
            换一篇
          </button>
        ) : null}
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
