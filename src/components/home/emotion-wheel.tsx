'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { EMOTION_SLICES, type EmotionSlice } from '@/data/emotion-wheel';
import { cn } from '@/lib/utils';

/*
 * ------------------------------------------------------------------
 * 情绪转盘
 *
 * - 桌面端待机时整盘匀速步进：每秒转过 45°，让下一个扇形的文字转到
 *   正上方的指针下。每次加载从一个随机扇形开始，不是永远从「迷茫」起。
 *   转到 45° 的整数倍才停，所以停下来时永远是「一个扇形正对指针」。
 * - 指针下那一格就是「自动选中」的那一格：盘停稳后，它旁边会滑出一张
 *   横向卡片，内容随之切换 —— 不用动手也能看到有人在讲这些情绪。
 * - 扇形里的文字跟着盘走，但自身反向旋转同样的角度，于是无论盘转到
 *   哪一格，文字始终是水平的、可读的（见 .emotion-wheel-counter）。
 * - 鼠标悬停任意扇形 → 盘立即停住，卡片切到这一格，指针跟着挪过去；
 *   移开后从这一格继续自动转。
 * - 手动点任意一个扇形 → 停住并锁定，被点的扇形放大并投下阴影，其余
 *   缩小半透明，卡片固定在这一格。
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
/*
 * 外圈几乎贴着 viewBox 边缘（180 / 200）。放大与阴影会越过 viewBox，
 * 靠 .emotion-wheel-svg 的 overflow: visible 露出来。
 */
const R_OUTER = 190;
const R_INNER = 86;

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

/** 扇形内文字的锚点：取扇形中间角度、半径约 60% 处。 */
function labelAnchor(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number) {
  const midDeg = (startDeg + endDeg) / 2;
  const r = rInner + (rOuter - rInner) * 0.6;
  return polar(cx, cy, r, midDeg);
}

interface EmotionWheelProps {
  className?: string;
}

export function EmotionWheel({ className }: EmotionWheelProps) {
  const reduceMotion = useReducedMotion();
  /** 鼠标点中、锁定的那一格；为空表示「跟着指针自动走」。 */
  const [lockedId, setLockedId] = useState<string | null>(null);
  /**
   * 自动转动走到第几步（每步 45°）。
   * 起始步数是随机的：每次进页面，指针第一次指着的扇形都不一样，
   * 不然永远是同一个情绪打头，看着像写死的。
   */
  const [step, setStep] = useState(0);
  /** 鼠标悬停暂停时停在哪一格；为空表示没有悬停。 */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /** 手动点过之后就不再自动转，直到收起。 */
  const [autoOn, setAutoOn] = useState(true);
  /**
   * 卡片显隐只有一个开关，避免「自动态想显示」和「用户想收起」两套状态打架。
   *
   * - follow：跟着指针自动切换（桌面端待机时的默认样子）
   * - locked：点住了某一格，卡片定住（点开时会自动进这个态，锁的是 lockedId）
   * - off   ：用户主动收起了卡片（点空白 / Esc / 再点一次 / 返回），
   *           在桌面自动态下也要一直收着，不能又跟着指针冒出来。
   *           这个态会一直保留，直到用户下一次点扇形重新打开。
   */
  const [cardMode, setCardMode] = useState<'follow' | 'locked' | 'off'>('follow');
  /** 只有桌面端才自动转（手机上自动转会分散注意力）。 */
  const [isDesktop, setIsDesktop] = useState(false);
  const titleId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  /** 锁定的那一格也用 ref 存一份，供 window 级事件读取最新值。 */
  const lockedRef = useRef<string | null>(null);
  lockedRef.current = lockedId;


  // 桌面判定：跟 CSS 的 lg 断点一致
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const autoActive = isDesktop && !reduceMotion && autoOn && lockedId === null;
  /** 正在悬停：盘先停住，等移开再继续。 */
  const hovering = autoActive && hoverIndex !== null;

  /*
   * 停止自动转动的「硬开关」。
   *
   * setState 是异步的，点击那一瞬如果定时器正好排到点上，还会再走一格；
   * 用一个 ref 在事件里同步关掉，已经排队的那一拍进来会直接 return。
   */
  const autoRef = useRef(false);
  autoRef.current = autoActive && !hovering;

  /*
   * 指针停在哪一格，用 ref 记着。
   *
   * 盘在转，鼠标不动时指针底下那一格每转一格就换一个元素，Enter/Leave
   * 会一轮轮地重放。如果按「鼠标进了哪一格」来记，指针就会跟着转、盘
   * 也跟着转（盘一转指针又变），越转越乱。
   * 所以只认「鼠标真的动过」：松手移动时记下鼠标位置和那一刻指针指着的
   * 格子；之后盘怎么转都不改，鼠标一动就重新记。
   */
  const hoveredRef = useRef<number | null>(null);
  hoveredRef.current = hoverIndex;
  const pointerPos = useRef<{ x: number; y: number } | null>(null);

  /*
   * 自动转动：悬停、锁定、收起都会让这个 effect 重跑，定时器随之停掉。
   *
   * 悬停的判定放在定时器里做，不在事件里做 —— 少了这个 effect 反复
   * 重启，盘也就不会一卡一卡。
   */
  useEffect(() => {
    if (!autoActive) return;
    const timer = window.setInterval(() => {
      if (!autoRef.current) return;
      setStep((current) => current + 1);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [autoActive]);

  const syncPointer = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || lockedRef.current || !autoActive) return;
      const moved =
        !pointerPos.current ||
        Math.abs(event.clientX - pointerPos.current.x) > 1 ||
        Math.abs(event.clientY - pointerPos.current.y) > 1;
      if (!moved) return;
      pointerPos.current = { x: event.clientX, y: event.clientY };
      const target = (event.target as Element | null)?.closest?.('.emotion-wheel-slice');
      const index = target ? Number(target.getAttribute('data-slice-index')) : NaN;
      const next = Number.isFinite(index) ? index : null;
      if (next === hoveredRef.current) return;
      /*
       * 悬停时盘要停在「当时指针指着的那一格」。
       *
       * 角度不用另算 —— 只要把 hoverIndex 设上，渲染时 displayIndex 取它，
       * 下面的 spinGroup 会自己算到「这一格正对指针」，还顺带补整圈。
       * 鼠标停在原地时盘会继续转到对齐位置，再往下转就卡住不动了。
       */
      setHoverIndex(next);
    },
    [autoActive],
  );

  const clearPointer = useCallback(() => {
    if (hoveredRef.current === null) return;
    pointerPos.current = null;
    setHoverIndex(null);
  }, []);

  useEffect(() => {
    if (!autoActive) return;
    window.addEventListener('pointermove', syncPointer, { passive: true });
    window.addEventListener('pointerleave', clearPointer);
    return () => {
      window.removeEventListener('pointermove', syncPointer);
      window.removeEventListener('pointerleave', clearPointer);
    };
  }, [autoActive, syncPointer, clearPointer]);

  /*
   * 起始那一格在挂载后才摇：直接写在 useState 初值里会让服务端渲染出
   * 一个数、客户端又摇出另一个，水合对不上（每次刷新还会报警告）。
   */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setStep(Math.floor(Math.random() * EMOTION_SLICES.length));
    setReady(true);
  }, []);

  /** 起始格还没摇出来之前，盘先停在 0°（正对「迷茫」，也就是数组第一个）。 */
  const initialSpin = -SLICE_DEG / 2;

  const count = EMOTION_SLICES.length;
  const mod = (value: number) => ((value % count) + count) % count;

  /** 盘停在「第几格」：锁定的那一格、悬停的那一格，或者自动走到的那一格。 */
  const displayIndex = lockedId
    ? Math.max(0, EMOTION_SLICES.findIndex((slice) => slice.id === lockedId))
    : hoverIndex ?? (autoActive ? mod(step) : mod(step));

  /**
   * 整盘旋转角度。
   *
   * 视角上「指针在正上方」，要让它指向 displayIndex 那一格，就得把
   * 那一格的扇心转到 -90°：旋转量 = -90 - (扇心角 + 当前累计转角)。
   * 外面再补若干个整圈，保证一直是同一个方向往前转，不会为了归位
   * 突然倒着甩回去。
   */
  const baseSpin = -SLICE_DEG / 2 - step * SLICE_DEG;
  const targetAngle = START_DEG + SLICE_DEG / 2 + displayIndex * SLICE_DEG;
  const desiredSpin = START_DEG - targetAngle;
  // 摇出随机起始格之后才允许「补整圈」：第一帧不该从 0° 甩到某个大角度
  const spinGroup = ready ? desiredSpin + 360 * Math.ceil((baseSpin - desiredSpin) / 360) : initialSpin;

  /** 指针指的是哪一格。 */
  const pointerIndex = hoverIndex ?? mod(step);

  /** 卡片展示的情绪：锁定的优先，否则跟着指针走。 */
  const focusIndex = lockedId
    ? Math.max(0, EMOTION_SLICES.findIndex((slice) => slice.id === lockedId))
    : pointerIndex;
  // 显式收窄类型：EMOTION_SLICES 是 readonly 数组，索引访问会被推成可能为空
  const focused =
    EMOTION_SLICES[focusIndex] ?? (EMOTION_SLICES[0] as EmotionSlice);
  const isLocked = lockedId !== null;
  /*
   * 卡片要不要出现：
   * - locked：一定显示（手机端点开就是这一种）
   * - follow：只在桌面端的自动态显示，跟着指针换内容
   * - off   ：收起，连自动态也不显示
   */
  const cardVisible = cardMode !== 'off' && (isLocked || (isDesktop && autoActive));

  const selectSlice = useCallback(
    (slice: EmotionSlice) => {
      if (lockedId === slice.id) {
        /*
         * 再点一次同一个：收起，继续自动转。
         *
         * 注意这里是 cardMode='off' 而不是 'follow' —— 自动态下卡片是常驻的，
         * 回到 follow 等于「刚收起又冒出来」，用户会以为没点中。
         */
        setLockedId(null);
        setHoverIndex(null);
        setAutoOn(true);
        setCardMode('off');
        return;
      }
      // 先同步掐掉定时器，再改状态
      autoRef.current = false;
      setLockedId(slice.id);
      setHoverIndex(null);
      setAutoOn(false);
      setCardMode('locked');
    },
    [lockedId],
  );

  const close = useCallback(() => {
    setLockedId(null);
    setHoverIndex(null);
    setAutoOn(true);
    // 收起之后不再让卡片跟着指针冒出来，用户是主动想关掉它
    setCardMode('off');
  }, []);

  /*
   * 点击转盘外的空白处关闭。
   * 只判断是否落在整个转盘舞台上，转盘内部空白（圆环中间）不会误关。
   */
  useEffect(() => {
    if (!lockedId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (stageRef.current && stageRef.current.contains(target)) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [lockedId, close]);

  // Esc 关闭，方便键盘用户
  useEffect(() => {
    if (!lockedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lockedId, close]);

  /*
   * 用户可能只滚了一半就点开扇形，卡片会落在视口外。
   * 只在卡片真的超出可视区时才把它带进来；已经看得见就一动不动，
   * 免得点一下页面自己往上跳。
   */
  useEffect(() => {
    if (!lockedId) return;
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
  }, [lockedId, reduceMotion]);

  const showCard = cardVisible;

  return (
    <section
      aria-labelledby={titleId}
      className={cn('emotion-wheel', lockedId && 'has-active', className)}
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
            <g className="emotion-wheel-spin" style={{ transform: `rotate(${spinGroup}deg)` }}>
              {EMOTION_SLICES.map((slice, index) => {
                const startDeg = START_DEG + index * SLICE_DEG;
                const endDeg = startDeg + SLICE_DEG;
                const d = slicePath(CX, CY, R_OUTER, R_INNER, startDeg, endDeg);
                const anchor = labelAnchor(CX, CY, R_OUTER, R_INNER, startDeg, endDeg);
                const isActive = lockedId === slice.id;
                const isDimmed = lockedId !== null && !isActive;
                const isTop = index === pointerIndex;

                return (
                  <g
                    key={slice.id}
                    role="radio"
                    tabIndex={0}
                    aria-checked={isActive}
                    aria-label={`${slice.label}：是为了获得${slice.need}`}
                    data-slice-index={index}
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
                      hoverIndex === index && 'emotion-wheel-slice-hot',
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
                        style={{ transform: `rotate(${-spinGroup}deg)` }}
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
              className={cn('emotion-wheel-pointer', (autoActive || isLocked) && 'is-on')}
            >
              <path d="M 200 27 L 189 7 L 211 7 Z" fill="var(--color-ink-ghost, #9a90a8)" opacity="0.75" />
            </g>
          </svg>
        </div>

        {showCard && (
          <div
            className="emotion-wheel-card-slot"
            data-visible="true"
            data-locked={isLocked ? 'true' : 'false'}
          >
            <div
              key={focused.id}
              ref={cardRef}
              /*
               * 用 region + aria-live 而不是 dialog。
               *
               * 它不是模态框，桌面端还一直在跟着盘更新；叫 dialog 会和
               * 情绪球那个真正的弹层（role="dialog"）撞 name，屏幕阅读器
               * 与测试里的 getByRole('dialog', { name:/焦虑/ }) 都会同时命中。
               */
              role="region"
              aria-live="polite"
              aria-label={`${focused.label}：是为了获得${focused.need}`}
              className="emotion-wheel-card"
              style={
                {
                  '--slice-color': focused.color,
                  '--slice-edge': focused.edge,
                  '--slice-ink': focused.ink,
                } as React.CSSProperties
              }
            >
              {/* 顶部那条跟着情绪走的细色条，只做一点点提示 */}
              <span className="emotion-wheel-card-bar" aria-hidden="true" />

              {/*
                三块直接挂在卡片上，宽屏才能用栅格把它们摆成「左栏标题 + 需求，
                右栏处理方法」两栏。中间不要再包一层 —— 包了之后栅格就只看到
                一个块，子元素再怎么设 grid-area 都无效。
              */}
              <div className="emotion-wheel-card-title-wrap">
                <span className="emotion-wheel-card-dot" aria-hidden="true" />
                <div>
                  <p className="emotion-wheel-card-eyebrow">情绪的背后</p>
                  <h3 className="emotion-wheel-card-title">{focused.label}</h3>
                </div>
              </div>

              <div className="emotion-wheel-card-need">
                <span className="emotion-wheel-card-key">是为了获得</span>
                <span className="emotion-wheel-card-needword">{focused.need}</span>
                <p className="emotion-wheel-card-text">{focused.needs}</p>
              </div>

              <div className="emotion-wheel-card-method">
                <span className="emotion-wheel-card-key">处理方法</span>
                <p className="emotion-wheel-card-text">{focused.method}</p>
              </div>

              {isLocked ? (
                <button type="button" onClick={close} className="emotion-wheel-card-close">
                  <span aria-hidden="true">←</span>
                  返回转盘
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
