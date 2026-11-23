'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { EMOTION_SLICES, type EmotionSlice } from '@/data/emotion-wheel';
import { cn } from '@/lib/utils';

/*
 * ------------------------------------------------------------------
 * 情绪转盘
 *
 * - 桌面端待机时整盘匀速步进：每秒转过 45°，让下一个扇形的文字转到
 *   正上方的指针下。转到 45° 的整数倍才停，所以停下来时永远是「一个
 *   扇形正对指针」，不会停在两块中间。
 * - 扇形里的文字跟着盘走，但自身反向旋转同样的角度，于是无论盘转到
 *   哪一格，文字始终是水平的、可读的（见 .emotion-wheel-counter）。
 * - 手动点任意一个扇形 → 停止自动转动，被点的扇形放大并投下阴影，
 *   其余缩小半透明，详情卡出现在它所在的一侧（左 / 右）。
 * - 再点一次已选中的扇形、点返回、点转盘外的空白、按 Esc，都能收起，
 *   收起后重新开始自动转动。
 * ------------------------------------------------------------------
 */

/** 每个扇形占的角度（8 等分）。 */
const SLICE_DEG = 360 / EMOTION_SLICES.length; // 45°

/** 第一个扇形的左边界从正上方（12 点）开始，顺时针排开。 */
const START_DEG = -90;

/**
 * 自动转动：每步停留多久（毫秒）。
 * 每一步的旋转过渡是 0.82s，写在 globals.css 的 .emotion-wheel-spin 上，
 * 比这里短一点，留一小段停顿让人看清指针下的文字。
 */
const STEP_MS = 1000;

/** 转盘 viewBox 尺寸（正方形），所有几何都基于它，再用 CSS 缩放适配。 */
const SIZE = 400;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUTER = 180;
const R_INNER = 84;

/**
 * 把「角度 + 半径」换算成 SVG 坐标。
 * 圆心在 (cx, cy)，0° 指向正右，本组件统一用「度」传入，内部转弧度。
 */
function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

/**
 * 生成一个扇环的 `d` 路径。
 * 内外两条弧之间是一条有厚度的扇形，相邻两块之间靠 stroke 分开。
 */
function slicePath(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, rOuter, startDeg);
  const end = polar(cx, cy, rOuter, endDeg);
  const innerStart = polar(cx, cy, rInner, startDeg);
  const innerEnd = polar(cx, cy, rInner, endDeg);

  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  return [
    `M ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    'Z',
  ].join(' ');
}

/** 扇形内文字的锚点：取扇形中间角度、半径约 58% 处。 */
function labelAnchor(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number) {
  const midDeg = (startDeg + endDeg) / 2;
  const r = rInner + (rOuter - rInner) * 0.58;
  return polar(cx, cy, r, midDeg);
}

interface EmotionWheelProps {
  className?: string;
}

export function EmotionWheel({ className }: EmotionWheelProps) {
  const reduceMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<string | null>(null);
  /** 自动转动走到第几步（每步 45°）。 */
  const [step, setStep] = useState(0);
  /** 手动点过之后就不再自动转，直到收起。 */
  const [autoOn, setAutoOn] = useState(true);
  /** 只有桌面端才自动转（手机上自动转会分散注意力）。 */
  const [isDesktop, setIsDesktop] = useState(false);
  const titleId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const active = useMemo(
    () => EMOTION_SLICES.find((slice) => slice.id === activeId) ?? null,
    [activeId],
  );

  // 桌面判定：跟 CSS 的 lg 断点一致
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const autoActive = isDesktop && !reduceMotion && autoOn && activeId === null;

  /*
   * 停止自动转动的「硬开关」。
   *
   * setState 是异步的，点击那一瞬如果定时器正好排到点上，还会再走一格；
   * 用一个 ref 在事件里同步关掉，已经排队的那一拍进来会直接 return。
   */
  const autoRef = useRef(false);
  autoRef.current = autoActive;

  // 自动转动：每 STEP_MS 推进一步
  useEffect(() => {
    if (!autoActive) return;
    const timer = window.setInterval(() => {
      if (!autoRef.current) return;
      setStep((current) => current + 1);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [autoActive]);

  /** 整盘旋转角度：让第 step 个扇形的中心正好停在正上方。 */
  const rotation = -SLICE_DEG / 2 - step * SLICE_DEG;

  /** 正对指针的扇形下标（只在自动转动时有意义）。 */
  const topIndex = autoActive
    ? ((step % EMOTION_SLICES.length) + EMOTION_SLICES.length) % EMOTION_SLICES.length
    : -1;

  const selectSlice = useCallback(
    (slice: EmotionSlice) => {
      if (activeId === slice.id) {
        // 再点一次同一个：收起，继续自动转
        setActiveId(null);
        setAutoOn(true);
        return;
      }
      // 先同步掐掉定时器，再改状态
      autoRef.current = false;
      setActiveId(slice.id);
      setAutoOn(false);
    },
    [activeId],
  );

  const close = useCallback(() => {
    setActiveId(null);
    setAutoOn(true);
  }, []);

  /*
   * 点击转盘外的空白处关闭。
   * 只判断是否落在整个转盘舞台上，转盘内部空白（圆环中间）不会误关。
   */
  useEffect(() => {
    if (!activeId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (stageRef.current && stageRef.current.contains(target)) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [activeId, close]);

  // Esc 关闭，方便键盘用户
  useEffect(() => {
    if (!activeId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeId, close]);

  /*
   * 用户可能只滚了一半就点开扇形，卡片会落在视口外。
   * 只在卡片真的超出可视区时才把它带进来；已经看得见就一动不动，
   * 免得点一下页面自己往上跳。
   */
  useEffect(() => {
    if (!activeId) return;
    const timer = window.setTimeout(() => {
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const viewport = window.innerHeight;
      if (rect.top < 0 || rect.bottom > viewport) {
        card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [activeId, reduceMotion]);

  /*
   * 卡片放在被点扇形的同一侧：算一下它在屏幕上的角度，
   * cos > 0 在右半圈，卡片去右边；否则去左边。
   */
  const activeIndex = active ? EMOTION_SLICES.findIndex((slice) => slice.id === active.id) : -1;
  const activeAngle = START_DEG + SLICE_DEG / 2 + SLICE_DEG * activeIndex + rotation;
  const cardSide = Math.cos((activeAngle * Math.PI) / 180) >= 0 ? 'right' : 'left';

  return (
    <section
      aria-labelledby={titleId}
      className={cn('emotion-wheel', activeId && 'has-active', className)}
    >
      <h2 id={titleId} className="sr-only">
        情绪转盘
      </h2>

      <div ref={stageRef} className="emotion-wheel-stage">
        <div className="emotion-wheel-board">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="radiogroup"
            aria-label="情绪转盘，点一个扇形看它的需求与处理方法"
            className="emotion-wheel-svg"
          >
            {/* 整盘旋转层：扇形与文字都在里面 */}
            <g className="emotion-wheel-spin" style={{ transform: `rotate(${rotation}deg)` }}>
              {EMOTION_SLICES.map((slice, index) => {
                const startDeg = START_DEG + index * SLICE_DEG;
                const endDeg = startDeg + SLICE_DEG;
                const d = slicePath(CX, CY, R_OUTER, R_INNER, startDeg, endDeg);
                const anchor = labelAnchor(CX, CY, R_OUTER, R_INNER, startDeg, endDeg);
                const isActive = activeId === slice.id;
                const isDimmed = activeId !== null && !isActive;
                const isTop = index === topIndex;

                return (
                  <g
                    key={slice.id}
                    role="radio"
                    tabIndex={0}
                    aria-checked={isActive}
                    aria-label={`${slice.label}：是为了获得${slice.need}`}
                    onClick={() => selectSlice(slice)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectSlice(slice);
                      }
                    }}
                    className={cn(
                      'emotion-wheel-slice focus:outline-none',
                      isDimmed && 'emotion-wheel-slice-dim',
                      isTop && 'emotion-wheel-slice-top',
                    )}
                    style={
                      {
                        '--slice-color': slice.color,
                        '--slice-edge': slice.edge,
                        '--slice-ink': slice.ink,
                        transformOrigin: `${CX}px ${CY}px`,
                      } as React.CSSProperties
                    }
                  >
                    <path
                      d={d}
                      fill={slice.color}
                      stroke={slice.edge}
                      strokeWidth={1.4}
                      strokeLinejoin="round"
                      className="emotion-wheel-slice-shape"
                    />

                    {/*
                      扇形文字：两层组。
                      外层用 transform 属性移到扇形锚点；
                      内层用 CSS 反向旋转，抵消整盘的转动，让文字始终水平。
                      两层分开是必须的 —— CSS transform 会覆盖 SVG 的
                      transform 属性，写在一起translate 就丢了。
                    */}
                    <g transform={`translate(${anchor.x.toFixed(2)} ${anchor.y.toFixed(2)})`}>
                      <g
                        className="emotion-wheel-counter"
                        style={{ transform: `rotate(${-rotation}deg)` }}
                      >
                        <text
                          textAnchor="middle"
                          className="emotion-wheel-slice-label"
                          fill={slice.ink}
                          fontSize="19"
                          fontWeight="600"
                          letterSpacing="0.08em"
                          y="-3"
                        >
                          {slice.label}
                        </text>
                        <text
                          textAnchor="middle"
                          className="emotion-wheel-slice-sub"
                          fill={slice.ink}
                          fontSize="10"
                          opacity="0.8"
                          letterSpacing="0.02em"
                          y="16"
                        >
                          是为了获得{slice.need}
                        </text>
                      </g>
                    </g>
                  </g>
                );
              })}
            </g>

            {/* 正上方的固定指针：自动转动时指向当前那一格 */}
            <g
              aria-hidden="true"
              className={cn('emotion-wheel-pointer', autoActive && 'is-on')}
            >
              <path d="M 200 27 L 189 7 L 211 7 Z" fill="var(--color-ink-ghost, #9a90a8)" opacity="0.75" />
            </g>
          </svg>
        </div>

        {active && (
          <div className="emotion-wheel-card-slot" data-side={cardSide}>
            <div
              key={active.id}
              ref={cardRef}
              role="dialog"
              aria-modal="false"
              aria-label={`${active.label}：是为了获得${active.need}`}
              className="emotion-wheel-card"
              style={
                {
                  '--slice-color': active.color,
                  '--slice-edge': active.edge,
                  '--slice-ink': active.ink,
                } as React.CSSProperties
              }
            >
              <header className="emotion-wheel-card-head">
                <span className="emotion-wheel-card-dot" aria-hidden="true" />
                <div>
                  <p className="emotion-wheel-card-eyebrow">情绪的背后</p>
                  <h3 className="emotion-wheel-card-title">{active.label}</h3>
                </div>
              </header>

              <div className="emotion-wheel-card-need">
                <span className="emotion-wheel-card-key">是为了获得</span>
                <span className="emotion-wheel-card-needword">{active.need}</span>
                <p className="emotion-wheel-card-text">{active.needs}</p>
              </div>

              <div className="emotion-wheel-card-method">
                <span className="emotion-wheel-card-key">处理方法</span>
                <p className="emotion-wheel-card-text">{active.method}</p>
              </div>

              <button type="button" onClick={close} className="emotion-wheel-card-close">
                <span aria-hidden="true">←</span>
                返回转盘
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
