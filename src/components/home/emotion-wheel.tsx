'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EMOTION_SLICES, type EmotionSlice } from '@/data/emotion-wheel';
import { cn } from '@/lib/utils';

/*
 * ------------------------------------------------------------------
 * 情绪转盘：8 个彩色扇形 + 中心一个低头连帽的小孩，站在路灯下。
 *
 * 交互约定：
 * - 点一个扇形 → 它放大一点、投下阴影，其余扇形缩小并半透明；
 *   旁边浮出一张卡片，把「是为了获得……」和「处理方法」讲完整；
 * - 再点一下已选中的扇形、点返回按钮，或点转盘外的空白处，都能收起；
 * - 过渡全部用 CSS `transform` + `opacity`，0.45s，带一点缓动；
 *   不碰布局属性，所以不触发重排，动画也顺。
 *
 * 结构上把「转盘」和「详情卡」拆成两个兄弟节点，中间没有包一层会
 * 改变定位上下文的容器，这样点空白关闭的「遮罩」可以铺满整个 section。
 * ------------------------------------------------------------------
 */

/** 每个扇形占的角度（8 等分）。 */
const SLICE_DEG = 360 / EMOTION_SLICES.length; // 45°

/** 扇形从正上方（12 点方向）开始，顺时针依次排开。 */
const START_DEG = -90;

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
 * 生成一个扇形（饼形）的 `d` 路径。
 * 从圆心出发 → 走到起始边 → 沿弧到终止边 → 回到圆心。
 * 圆心到两条边的距离用「小半径」外扩一点，让相邻扇形之间留一条缝，
 * 看起来是 8 块拼起来的转盘，而不是一个实心圆硬切几刀。
 */
function slicePath(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, rOuter, startDeg);
  const end = polar(cx, cy, rOuter, endDeg);
  const innerStart = polar(cx, cy, rInner, startDeg);
  const innerEnd = polar(cx, cy, rInner, endDeg);

  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  // 从圆心出发，先到内圈起点，再撑到外圈，走外弧，收回来
  return [
    `M ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    'Z',
  ].join(' ');
}

/**
 * 扇形内文字的锚点：取扇形中间角度、半径一半偏外的地方，
 * 标题与「是为了获得……」两行叠在一起。
 */
function sliceLabelAnchor(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number) {
  const midDeg = (startDeg + endDeg) / 2;
  const r = rInner + (rOuter - rInner) * 0.62;
  return polar(cx, cy, r, midDeg);
}

/** 转盘 viewBox 尺寸（正方形），所有几何都基于它，再用 CSS 缩放适配。 */
const SIZE = 400;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUTER = 192;
const R_INNER = 88;

interface EmotionWheelProps {
  className?: string;
}

export function EmotionWheel({ className }: EmotionWheelProps) {
  const reduceMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<string | null>(null);
  const titleId = useId();
  const wheelRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);

  const active = useMemo(
    () => EMOTION_SLICES.find((slice) => slice.id === activeId) ?? null,
    [activeId],
  );

  const selectSlice = useCallback((slice: EmotionSlice) => {
    setActiveId((current) => (current === slice.id ? null : slice.id));
  }, []);

  const close = useCallback(() => setActiveId(null), []);

  /*
   * 点击转盘外的空白处关闭。
   * 用全局 click 监听判断点击点是否落在转盘与详情卡之外；
   * 转盘和详情卡各自 stopPropagation，这里的判断就足够稳。
   */
  useEffect(() => {
    if (!activeId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (wheelRef.current && wheelRef.current.contains(target)) return;
      setActiveId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [activeId]);

  // Esc 关闭，方便键盘用户
  useEffect(() => {
    if (!activeId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeId]);

  /*
   * 选中后详情卡出现在转盘下方，可能落在视口外。
   * 只在卡片超出可视区时才把它平滑带进来（block:'nearest'），
   * 转盘本身仍在原地，不会因为点一下就把整页顶走。
   */
  useEffect(() => {
    if (!activeId) return;
    const timer = window.setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [activeId, reduceMotion]);

  return (
    <section
      ref={wheelRef}
      aria-labelledby={titleId}
      className={cn('emotion-wheel relative flex flex-col items-center', className)}
    >
      <h2 id={titleId} className="sr-only">
        情绪转盘
      </h2>

      <div className="relative w-full max-w-[440px] select-none">
        {/* 转盘本体 */}
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="radiogroup"
          aria-label="情绪转盘，点击一个扇形查看说明"
          className="block w-full"
        >
          {EMOTION_SLICES.map((slice, index) => {
            const startDeg = START_DEG + index * SLICE_DEG;
            const endDeg = startDeg + SLICE_DEG;
            const d = slicePath(CX, CY, R_OUTER, R_INNER, startDeg, endDeg);
            const anchor = sliceLabelAnchor(CX, CY, R_OUTER, R_INNER, startDeg, endDeg);
            const isActive = activeId === slice.id;
            const isDimmed = activeId !== null && !isActive;

            return (
              <g
                key={slice.id}
                role="radio"
                tabIndex={0}
                aria-checked={isActive}
                aria-label={`${slice.label}：${slice.needs}`}
                onClick={() => selectSlice(slice)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectSlice(slice);
                  }
                }}
                className={cn('emotion-wheel-slice focus:outline-none', isDimmed && 'emotion-wheel-slice-dim')}
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
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  className="emotion-wheel-slice-shape"
                />

                {/* 扇形文字：标题 + 「是为了获得……」 */}
                <text
                  textAnchor="middle"
                  className="pointer-events-none"
                  transform={`translate(${anchor.x.toFixed(2)} ${anchor.y.toFixed(2)})`}
                >
                  <tspan
                    x="0"
                    dy="-0.2em"
                    className="emotion-wheel-slice-label"
                    fill={slice.ink}
                    fontSize="20"
                    fontWeight="600"
                    letterSpacing="0.06em"
                  >
                    {slice.label}
                  </tspan>
                  <tspan
                    x="0"
                    dy="1.7em"
                    className="emotion-wheel-slice-sub"
                    fill={slice.ink}
                    fontSize="11.5"
                    opacity="0.82"
                  >
                    是为了获得…
                  </tspan>
                </text>
              </g>
            );
          })}

          {/* 中心：低头连帽的小孩，站在路灯下（线稿插画） */}
          <g className="pointer-events-none">
            <CenterChild />
          </g>
        </svg>

        {/* 详情卡：点中后浮出，讲解完整信息 */}
        {active && (
          <motion.aside
            key={active.id}
            ref={cardRef}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="false"
            aria-label={`${active.label}：${active.needs}`}
            className="emotion-wheel-card pointer-events-auto mt-6 w-full rounded-3xl p-6 text-left shadow-[0_28px_70px_-32px_rgba(70,55,92,0.45)] sm:p-7"
            style={
              {
                '--slice-color': active.color,
                '--slice-edge': active.edge,
                '--slice-ink': active.ink,
              } as React.CSSProperties
            }
          >
            <div className="mb-3 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-full"
                style={{ background: active.color, boxShadow: `0 0 0 3px ${active.edge}55` }}
              />
              <h3 className="font-display text-[22px] font-medium tracking-[0.08em] text-ink">
                {active.label}
              </h3>
            </div>

            <p className="mb-4 text-[14px] leading-[1.9] text-ink-soft">
              <span className="mr-1 font-medium text-ink">是为了获得：</span>
              {active.needs}
            </p>

            <p className="rounded-2xl bg-white/60 px-4 py-3 text-[13.5px] leading-[1.9] text-ink-soft">
              <span className="mr-1 font-medium text-ink">处理方法：</span>
              {active.method}
            </p>

            <button
              type="button"
              onClick={close}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] tracking-[0.04em] text-ink-faint transition-colors duration-300 hover:text-ink"
            >
              <span aria-hidden="true" className="text-[15px] leading-none">
                ←
              </span>
              返回转盘
            </button>
          </motion.aside>
        )}
      </div>
    </section>
  );
}

/**
 * 中心简笔小孩：一个低头、戴着帽兜、站在一盏路灯下的小人。
 * 纯 SVG 线稿，颜色跟着转盘的雾面色走，不做成抢眼的视觉焦点。
 */
function CenterChild() {
  return (
    <g transform={`translate(${CX} ${CY})`}>
      {/* 头顶的路灯光 */}
      <g stroke="#C9B6E8" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.9">
        <line x1="0" y1="-62" x2="0" y2="-44" />
        <path d="M -14 -62 Q 0 -72 14 -62" />
      </g>
      <circle cx="0" cy="-66" r="6" fill="#F5DFA4" opacity="0.9" />
      <circle cx="0" cy="-66" r="13" fill="#F5DFA4" opacity="0.18" />

      {/* 小孩身体：低头，所以脸只露出一小块 */}
      <g transform="translate(0 8)">
        {/* 身体 */}
        <path
          d="M -22 18 C -22 -6 -14 -18 0 -18 C 14 -18 22 -6 22 18 Z"
          fill="#D8D2EE"
          stroke="#A79ED0"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {/* 帽兜（低头，兜帽盖住后脑） */}
        <path
          d="M -18 -14 C -18 -32 -8 -40 2 -40 C 12 -40 20 -32 20 -14 C 18 -24 10 -30 2 -30 C -8 -30 -16 -24 -18 -14 Z"
          fill="#CBB6E8"
          stroke="#9C80C8"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {/* 脸：低头只露下巴一线，用更浅的色点一下 */}
        <ellipse cx="0" cy="-14" rx="7" ry="4" fill="#F4EFFB" />
        {/* 双手插兜，两条短袖口 */}
        <path d="M -20 2 C -26 6 -24 16 -18 20" stroke="#A79ED0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M 20 2 C 26 6 24 16 18 20" stroke="#A79ED0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}
