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

    // 真正画得出来的高度：visualViewport 会扣掉动态地址栏与键盘，
    // innerHeight 在某些安卓 WebView 里仍包含地址栏，两者取小的更稳
    const visibleHeight = () =>
      Math.min(window.visualViewport?.height ?? Number.POSITIVE_INFINITY, window.innerHeight);

    const measure = () => {
      // 用「相对文档的顶部偏移」而不是 getBoundingClientRect().top：
      // 后者会随页面滚动变成负数，导致滚动时把天空越量越高、球跟着重排错位。
      const top = el.offsetTop;
      const available = Math.round(visibleHeight() - top);
      if (available <= 0) return;
      // 只在「第一次量」或「宽高都变大」时更新，避免地址栏收放把天空反复缩放
      if (available > maxHeight || window.innerWidth > lastWidth) {
        maxHeight = available;
        el.dataset.skyHeight = String(available);
        el.style.height = `${available}px`;
      }
      lastWidth = window.innerWidth;
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.visualViewport?.addEventListener('resize', measure);
    // 从后台切回来时地址栏/工具栏可能已经变了，补量一次
    document.addEventListener('visibilitychange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', measure);
    };
  }, []);

  /*
   * 矮屏（手机横屏、分屏、地址栏占满屏幕的浏览器）不裁球，而是换一套坐标。
   *
   * 早先的做法是「可视高度 < 520 就先隐去四颗」，但那样和用户要的
   * 「别让球少掉」正好相反：他只是把手机转了个方向，回来就少了几颗。
   * 现在改成 `.emotion-sky-short`：14 颗球照旧，只是重新排进更扁的舞台。
   */
  const [short, setShort] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-height: 519px)');
    const sync = () => setShort(query.matches);
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
        // 矮屏换一套扁舞台的坐标，球一颗不少
        short && 'emotion-sky-short',
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
