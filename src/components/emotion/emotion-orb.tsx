'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useMemo, type CSSProperties } from 'react';
import type { Emotion } from '@/types';
import { cn } from '@/lib/utils';

type OrbStyleVars = CSSProperties & Record<`--orb-${string}`, string | number>;

export interface EmotionOrbProps {
  emotion: Emotion;
  index: number;
  /** 面板打开时，其他球退到背景 */
  dimmed?: boolean;
  active?: boolean;
  receded?: boolean;
  /** 正在被捏爆：播放碎裂动画，结束后由父级把它从天空里移除 */
  bursting?: boolean;
  onSelect: (emotion: Emotion) => void;
  onBurstComplete?: (emotionId: Emotion['id']) => void;
}

/** 碎片的方向与大小用固定种子生成，避免每次渲染都不一样。 */
function buildShards(): { x: number; y: number; size: number; duration: number }[] {
  let seed = 20261112;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: 14 }, () => {
    const angle = random() * Math.PI * 2;
    const distance = 46 + random() * 54;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      size: 2.5 + random() * 5,
      duration: 0.62 + random() * 0.34,
    };
  });
}

const SHARDS = buildShards();

/**
 * 一颗漂浮的情绪球。
 *
 * 性能设计：
 * - 持续漂浮与呼吸交给 CSS keyframes（transform，可被合成器接管），
 *   不经过 React 渲染；
 * - 仅入场、悬停、选中/变暗、碎裂这些离散状态由 Motion 驱动；
 * - 悬浮光晕用预先存在的元素切换 opacity，避免悬停时新增滤镜。
 */
export function EmotionOrb({
  emotion,
  index,
  dimmed = false,
  active = false,
  receded = false,
  bursting = false,
  onSelect,
  onBurstComplete,
}: EmotionOrbProps) {
  const desktop = emotion.placement.desktop;
  const mobile = emotion.placement.mobile;
  const short = emotion.placement.short ?? mobile ?? desktop;
  const reduceMotion = useReducedMotion();

  const style: OrbStyleVars = useMemo(
    () => ({
      '--orb-x': `${desktop.x}%`,
      '--orb-y': `${desktop.y}%`,
      '--orb-scale': desktop.scale,
      '--orb-x-m': `${mobile?.x ?? desktop.x}%`,
      '--orb-y-m': `${mobile?.y ?? desktop.y}%`,
      '--orb-scale-m': mobile?.scale ?? desktop.scale,
      // 矮屏（横屏 / 分屏）用第三套坐标；没有就退回移动端那套
      '--orb-x-s': `${short.x}%`,
      '--orb-y-s': `${short.y}%`,
      '--orb-scale-s': short.scale,
      '--orb-duration': `${desktop.duration}s`,
      '--orb-delay': `${desktop.delay}s`,
      '--orb-drift-x': `${desktop.driftX}px`,
      '--orb-drift-y': `${desktop.driftY}px`,
      '--orb-light': emotion.palette.light,
      '--orb-mid': emotion.palette.mid,
      '--orb-deep': emotion.palette.deep,
      '--orb-glow': emotion.palette.glow,
      '--orb-ink': emotion.palette.ink,
    }),
    [desktop, mobile, short, emotion.palette],
  );

  return (
    <div
      className={cn('orb-anchor pointer-events-none', !mobile && 'orb-desktop-only')}
      style={style}
    >
      <div className="orb-breath relative h-full w-full">
        <motion.button
          type="button"
          onClick={() => onSelect(emotion)}
          aria-label={`${emotion.label}：${emotion.whisper}`}
          aria-hidden={bursting ? true : undefined}
          tabIndex={bursting ? -1 : undefined}
          className="group pointer-events-auto relative block h-full w-full rounded-full focus-visible:outline-offset-[10px]"
          initial={{ opacity: 0, scale: 0.55 }}
          animate={
            bursting
              ? { opacity: [1, 1, 0], scale: [1, 1.26, 0.2] }
              : {
                  opacity: receded ? 0.18 : dimmed ? 0.34 : 1,
                  scale: active ? 1.06 : dimmed ? 0.94 : 1,
                }
          }
          transition={
            bursting
              ? {
                  duration: reduceMotion ? 0.2 : 0.72,
                  times: [0, 0.32, 1],
                  ease: 'easeOut',
                }
              : {
                  duration: active || dimmed ? 0.8 : 1.1,
                  delay: active || dimmed || receded ? 0 : 0.45 + index * 0.085,
                  ease: [0.22, 1, 0.36, 1],
                }
          }
          onAnimationComplete={() => {
            if (bursting) onBurstComplete?.(emotion.id);
          }}
          whileHover={bursting ? undefined : { scale: active ? 1.1 : 1.055 }}
          whileTap={bursting ? undefined : { scale: 0.98 }}
        >
          {/* 悬停时的柔光，不额外触发模糊 */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-[-14%] rounded-full opacity-0 blur-xl transition-opacity duration-700 group-hover:opacity-90 group-focus-visible:opacity-90"
            style={{ background: 'var(--orb-glow)' }}
          />

          <span className="orb-surface flex h-full w-full flex-col items-center justify-center">
            <span className="orb-label text-[0.82rem] font-medium sm:text-[0.95rem] lg:text-[1.05rem]">
              {emotion.label}
            </span>
            {/* 英文副标题只在悬停/聚焦时出现：常态保持球面干净 */}
            <span className="mt-[3px] hidden text-[7.5px] uppercase tracking-[0.26em] text-[#fff]/0 transition-colors duration-500 group-hover:text-[#fff]/85 group-focus-visible:text-[#fff]/85 sm:block">
              {emotion.latin}
            </span>
          </span>
        </motion.button>

        {/*
          碎裂：一层扩散的光环 + 若干碎片。
          只在 bursting 时挂载，动画跑完就被父级连同球一起移除，
          不会在静止时留下任何额外的合成层。
        */}
        {bursting && !reduceMotion ? (
          <>
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
              style={{
                border: '1px solid var(--orb-light)',
                boxShadow: '0 0 22px 2px var(--orb-glow)',
              }}
              initial={{ x: '-50%', y: '-50%', width: '96%', height: '96%', opacity: 0.8 }}
              animate={{ width: '230%', height: '230%', opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
            {SHARDS.map((shard, shardIndex) => (
              <motion.span
                key={shardIndex}
                aria-hidden="true"
                className="orb-shard"
                style={{ width: shard.size, height: shard.size }}
                initial={{ x: '-50%', y: '-50%', opacity: 1, scale: 1 }}
                animate={{ x: `calc(-50% + ${shard.x}px)`, y: `calc(-50% + ${shard.y}px)`, opacity: 0, scale: 0.3 }}
                transition={{ duration: shard.duration, ease: 'easeOut' }}
              />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
