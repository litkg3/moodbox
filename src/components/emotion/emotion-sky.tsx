'use client';

import { useEffect, useRef, useState } from 'react';
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

/** 天空被压矮时先让位的四颗（画面最外圈，通常是上排与下排的边角） */
const OUTER_RING: readonly EmotionId[] = ['emo', 'joy', 'exam', 'worry'];

/**
 * 情绪天空：14 种情绪球以预先编排的坐标分布，避开中央文字区。
 * 坐标写在数据层（data/emotions.ts），新增情绪时无需改这里。
 *
 * 被捏爆的球会消失两秒，然后自己飘回来（见 home-experience 里的定时器）——
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
  const sectionRef = useRef<HTMLElement | null>(null);

  /*
   * 球是按「天空的百分比」摆放的，所以天空高度一变，所有球会一起缩放。
   * 移动端上天空高度会因为浏览器地址栏收放、输入法弹出、旋转屏幕而跳动，
   * 若只给一个 `top-[72px] bottom-0`，天空会在这些瞬间被压得很矮：
   * 球横向挤在一起、最下面那颗被推出屏幕外 —— 用户看到的就是「少了几颗球」。
   *
   * 这里把天空的高度固定成「页面第一次可见时的高度」：
   * - visualViewport 排除输入法与动态地址栏，得到的是真正画得出东西的区域；
   * - 只用最大高度，不用当前高度，所以地址栏再出现也不会把天空压矮；
   * - 屏幕转横（宽度变大）时重新量一次，横屏能利用上更多高度。
   * JS 未执行前由 `min-height` 兜底，不会出现首帧塌陷。
   */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    let maxHeight = 0;
    let lastWidth = window.innerWidth;

    const measure = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const top = el.getBoundingClientRect().top;
      const available = Math.round(viewportHeight - top);
      if (available <= 0) return;
      // 只在「第一次量」或「宽高都变大」时更新，避免地址栏收放把天空反复缩放
      if (available > maxHeight || window.innerWidth > lastWidth) {
        maxHeight = available;
        el.style.height = `${available}px`;
      }
      lastWidth = window.innerWidth;
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, []);

  /*
   * 键盘弹出、分屏、横屏等把可视高度压到很矮时（< 520px），
   * 14 颗球挤在不到 400px 的天空里必然互相压住。
   * 这时隐去最外圈的四颗，留给画面一点呼吸 —— 代价是暂时看不到这几种情绪，
   * 但比「球叠在一起、有的还被切掉一半」要好。键盘收起后自动回来。
   */
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    // 桌面端窗口可以自由拉小，但那里不是「手机弹出键盘」的场景，
    // 降级只对窄屏生效，免得把桌面窗口活生生裁掉几颗球
    const query = window.matchMedia('(max-width: 1023px) and (max-height: 519px)');
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-label="情绪球"
      className={cn(
        // 天空的起点要在页头之下 —— 桌面端页头还多一条九项导航，
        // 否则最上面那颗球会压在导航条上。
        // 高度由上面的脚本按 visualViewport 钉住（见注释），这里给一个兜底值。
        'emotion-sky pointer-events-none absolute inset-x-0 top-[72px] min-h-[440px] transition-[opacity,transform] duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)] lg:top-[80px]',
        receded && 'scale-[0.965] opacity-30',
        // 天空被压矮时的降级：只留内圈，避免 14 颗球挤成一团
        compact && 'emotion-sky-compact',
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
            compactHidden={OUTER_RING.includes(emotion.id)}
            onSelect={onSelect}
            onBurstComplete={onBurstComplete}
          />
        );
      })}
    </section>
  );
}
