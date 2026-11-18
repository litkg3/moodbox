'use client';

import { EMOTIONS } from '@/data/emotions';
import { EmotionOrb } from '@/components/emotion/emotion-orb';
import type { Emotion, EmotionId } from '@/types';
import { cn } from '@/lib/utils';

interface EmotionSkyProps {
  activeId: EmotionId | null;
  /** “我不开心了”体验打开时整片天空退到背景 */
  receded?: boolean;
  /** 已经被捏爆、要从天空里拿掉的情绪 */
  bursts: readonly EmotionId[];
  /** 正在播放碎裂动画的那一颗（动画结束后才写进 bursts） */
  burstingId?: EmotionId | null;
  onSelect: (emotion: Emotion) => void;
  onBurstComplete?: (emotionId: EmotionId) => void;
  className?: string;
}

/**
 * 情绪天空：11 颗球以预先编排的坐标分布，避开中央文字区。
 * 坐标写在数据层（data/emotions.ts），新增情绪时无需改这里。
 *
 * 被捏爆的球会消失几秒，然后自己飘回来（见 home-experience 里的定时器）——
 * 这个动作的意义是释放，不是永久删除。
 */
export function EmotionSky({
  activeId,
  receded = false,
  bursts,
  burstingId = null,
  onSelect,
  onBurstComplete,
  className,
}: EmotionSkyProps) {
  return (
    <section
      aria-label="情绪球"
      className={cn(
        // 天空的起点要在页头之下 —— 桌面端页头还多一条九项导航，
        // 否则最上面那颗球会压在导航条上
        'emotion-sky pointer-events-none absolute inset-x-0 bottom-0 top-[72px] transition-[opacity,transform] duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)] lg:top-[80px]',
        receded && 'scale-[0.965] opacity-30',
        className,
      )}
    >
      <h2 className="sr-only">选择此刻最接近你的情绪</h2>
      {EMOTIONS.map((emotion, index) => {
        if (bursts.includes(emotion.id)) return null;
        return (
          <EmotionOrb
            key={emotion.id}
            emotion={emotion}
            index={index}
            active={activeId === emotion.id}
            dimmed={activeId !== null}
            receded={receded}
            bursting={burstingId === emotion.id}
            onSelect={onSelect}
            onBurstComplete={onBurstComplete}
          />
        );
      })}
    </section>
  );
}
