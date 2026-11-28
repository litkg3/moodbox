'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  EMOTION_CELLS,
  EMOTION_DYADS,
  EMOTION_PETALS,
  INTENSITY_LABEL,
  type EmotionCell,
} from '@/data/emotion-wheel';
import { cn } from '@/lib/utils';

/*
 * ------------------------------------------------------------------
 * 情绪转盘（普拉奇克情绪轮）
 *
 * 中间是一整块实心圆，八种高强度情绪绕圆心拼满这一圈；圆的外沿一道白线，
 * 线外才是花瓣 —— 八片火焰形，底部贴着圆的弧、往外收成尖。每片花瓣再从
 * 外到内分三层，越靠圆心越强烈。相邻两瓣交界处的空白里，各标着一个复合情绪。
 *
 * 交互沿用之前那一版，只是「一格」从扇形变成了「某个花瓣的某一层」：
 * - 桌面端待机时整盘每秒转过 45°，指针下的那一瓣自动被选中；
 * - 悬停任意位置 → 盘停住；点一下 → 锁定，卡片固定在这一瓣；
 * - 再点同一处、点返回、点盘外、按 Esc 都能收起。
 * - 指针在待机时指向「这一瓣的最高强度」，因为自动选中的就是那一层。
 * ------------------------------------------------------------------
 */

/** 每个花瓣占的角度（8 等分）。 */
const PETAL_DEG = 360 / EMOTION_PETALS.length; // 45°

/** 第一个花瓣的左边界从正上方（12 点）开始，顺时针排开。 */
const START_DEG = -90;

/**
 * 自动转动：每步停留多久（毫秒）。0.82s 转 + 约 4.2s 停。
 *
 * 原来是 3 秒（停 2.2s）。八瓣 × 三层，一瓣里三层文字都要读，
 * 2.2 秒只够扫一眼就被带到下一瓣；转到第 8 瓣时人已经跟丢，
 * 只能等一整圈再回来。放到 5 秒是「读完刚好要走」的位置。
 */
const STEP_MS = 5000;

/** 盘的旋转过渡时长（毫秒），必须和 globals.css 里 .emotion-wheel-spin 对上。 */
const SPIN_MS = 820;

/** 转盘 viewBox 尺寸（正方形），所有几何都基于它，再用 CSS 缩放适配。 */
const SIZE = 400;
const CX = SIZE / 2;
const CY = SIZE / 2;

/*
 * 花瓣的几条半径。
 *
 * 形状不是正圆：每瓣从核心圆的边上出发，往外收成一个尖，所以是八片
 * 尖头的火焰，而不是一个均匀的饼。
 */
const R_TIP = 168;
/**
 * 中间那个核心圆的半径。
 *
 * 参考图的最里面不是一块空花心，而是一整块实心圆：八种高强度情绪绕着
 * 圆心排一圈，圆的外沿再画一道白线，把「核心」和外面的花瓣分开。
 *
 * 这条半径同时是两个分界 —— 高强度层的外沿，和中层的内沿。
 */
const R_RING = 90;
/**
 * 中层与最外层的分界。
 *
 * 分界线要落在两层文字中间，不能压字。外层的字在 r=147、中层在 108，
 * 取 126 正好夹在中间，离上下各有十来个单位。
 */
const R_TIER1 = 126;
/**
 * 复合情绪标签所在的半径。
 *
 * 必须落在花瓣尖（R_TIP=168）之外，又不能探出 viewBox（半宽 200）。
 * 词是横排的，两个字加字距宽约 27 单位，所以圆心距最多 200 − 13.5 = 186.5；
 * 取 186：左右两个正好贴边，不越界也不会看着像飘在外头。
 *
 * （早先字是切向旋转的，那时按「旋转后还占十来个单位」估到 192，横排之后
 * 收回来 6 个单位，和瓣尖的关系看起来近多了。）
 */
const R_DYAD = 186;
/**
 * 复合词被「点亮」时，从它往对面那根连线怎么画。
 *
 * 不画整根直径（从这头的词一直连到对面那个词，要横穿整个盘、压掉中间
 * 两层花瓣），只在复合词自己的这一侧画一小截：
 * 内侧从 R_DYAD − 30 起（外面留着花瓣尖和那个「+」），外侧到 198 收住
 * （viewBox 半宽 200，再往外就出框）。
 *
 * 之所以是一小截而不是整根，是因为八个词绕成一圈，八根直径会交在圆心，
 * 盘心那块「颜色汇聚」的地方会被织成一张网 —— 想说明「这两个相反」，
 * 一根从词往外指的短线就够了。
 *
 * 线不加箭头：八个词里总有几个在斜向，那里的词离 viewBox 边只剩几个
 * 单位，箭头伸进去会被裁掉半截，看着像画坏了。不带头的线被裁一点也无妨。
 */
const R_DYAD_LINK_INNER = R_DYAD - 30;
const R_DYAD_LINK_OUTER = 198;

/** 极坐标 → 直角坐标。0° 指向正右，传入用「度」。 */
function polar(radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

/**
 * 花瓣在半径 r 处的半角（度）。
 *
 * 这是整个轮盘的形状来源：一瓣占 45°，在核心圆的边上刚好占满（±22.5°，
 * 也就是说八瓣在圆心处严丝合缝地拼成一整块），往外一路收，到尖端收成 0。
 *
 * 为什么不用贝塞尔曲线描一只「叶子」：真画出来是两头尖、中间鼓的叶形，
 * 而参考图的瓣是「底部最宽、往外收尖」的火焰形 —— 因为它的底边就是核心
 * 那个圆的弧。用半角函数描述，形状和「八瓣拼成实心圆」这件事天然一致，
 * 不会出现两瓣之间漏一条缝、或者花瓣自己凹进去一块的情况。
 */
function halfAngleAt(r: number): number {
  const t = (r - R_RING) / (R_TIP - R_RING);
  if (t <= 0) return PETAL_DEG / 2;
  if (t >= 1) return 0;
  /*
   * cos 让尖端收得干净（导数在 t=1 处不为零，收成尖角而不是圆头）；
   * 指数 1.1 把「宽」往根部压，花瓣看起来才挺，不会被削成三角。
   */
  return (PETAL_DEG / 2) * Math.pow(Math.cos((Math.PI / 2) * Math.pow(t, 1.1)), 1.1);
}

/**
 * 沿花瓣的一侧取一串采样点，从半径 rFrom 走到 rTo。
 *
 * sign = -1 是左边界、+1 是右边界。两边的半角都取同一个 halfAngleAt(r)，
 * 所以从哪里切、切多厚，两侧永远对称 —— 用错一边的话，画出来的瓣会
 * 整片歪向一侧，像被风吹过。
 */
function sidePoints(
  startDeg: number,
  endDeg: number,
  rFrom: number,
  rTo: number,
  sign: 1 | -1,
): Array<{ x: number; y: number }> {
  const mid = (startDeg + endDeg) / 2;
  const steps = 10;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const r = rFrom + ((rTo - rFrom) * i) / steps;
    out.push(polar(r, mid + sign * halfAngleAt(r)));
  }
  return out;
}

/** 圆弧上的一串点，从 fromDeg 到 toDeg。 */
function arcPoints(r: number, fromDeg: number, toDeg: number): Array<{ x: number; y: number }> {
  const steps = 6;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push(polar(r, fromDeg + ((toDeg - fromDeg) * i) / steps));
  }
  return out;
}

/**
 * 把一串点连成一条闭合路径。
 *
 * 采样点足够密（每侧十段、每段弧六段），在 620px 的盘上每一小段只有几个
 * 像素，看不出是折线。比硬凑贝塞尔稳：改半径、改胖瘦都不用重算控制点。
 */
function polyPath(points: Array<{ x: number; y: number }>): string {
  const f = (n: number) => n.toFixed(2);
  return `M ${points.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L ')} Z`;
}

/**
 * 某一层的形状：花瓣在 [rInner, rOuter] 之间的那一段。
 *
 * 两条弧各按自己的半径画（外沿宽、内沿窄），两侧沿花瓣的边界收 ——
 * 所以它不是「矩形转个角度」，而是一条上宽下窄的带子，正好贴合这一层。
 */
function petalBandPath(startDeg: number, endDeg: number, rOuter: number, rInner: number): string {
  const mid = (startDeg + endDeg) / 2;
  const wOuter = halfAngleAt(rOuter);
  const wInner = halfAngleAt(rInner);
  const points = [
    // 外沿：左 → 右
    ...arcPoints(rOuter, mid - wOuter, mid + wOuter),
    // 右边界：外 → 内
    ...sidePoints(startDeg, endDeg, rOuter, rInner, 1).slice(1),
    // 内沿：右 → 左
    ...arcPoints(rInner, mid + wInner, mid - wInner).slice(1),
    // 左边界：内 → 外
    ...sidePoints(startDeg, endDeg, rInner, rOuter, -1).slice(1, -1),
  ];
  return polyPath(points);
}

/**
 * 核心：一整块 45° 的扇形，从圆心到 R_RING。
 *
 * 八个扇形拼起来正好填满那个圆 —— 这就是「八种高强度情绪围成一个中心圆」
 * 的几何含义。核心不能沿用花瓣的轮廓：花瓣在圆心处半角是 0，八个拼起来
 * 中间会空出一朵风车，不成圆。
 */
function sectorPath(startDeg: number, endDeg: number, r: number): string {
  const f = (n: number) => n.toFixed(2);
  const a = polar(r, startDeg);
  const b = polar(r, endDeg);
  return [
    `M ${f(CX)} ${f(CY)}`,
    `L ${f(a.x)} ${f(a.y)}`,
    `A ${f(r)} ${f(r)} 0 0 1 ${f(b.x)} ${f(b.y)}`,
    'Z',
  ].join(' ');
}

/**
 * 三层的半径区间：从外到内。
 *
 * 用 Record 而不是数组：数组下标在 noUncheckedIndexedAccess 下永远是
 * `T | undefined`，`as const` 也不行 —— 元素里混了 null 之后，取出来
 * 再访问属性一样会被推成可选。按数字键查表就没有这个问题。
 */
const TIER_BANDS: Record<number, { outer: number; inner: number }> = {
  0: { outer: R_TIP, inner: R_TIER1 },
  1: { outer: R_TIER1, inner: R_RING },
  2: { outer: R_RING, inner: 0 },
};

/**
 * 三层文字各自落在哪个半径上。
 *
 * 外两层差 39、中层到核心差 42 —— 看着比字盒（16 高）宽得多，但在左右两瓣
 * 上「径向差」就是「水平间距」：两个 25 宽的词只留 14 个单位，再小就会贴上
 * （上一版差 27 时实测只剩 1 个单位）。
 *
 * 核心那一层收到 66，贴着核心圆的边站成一圈，圆心留出颜色汇聚的那一块 ——
 * 参考图也是这么排的。
 */
const TIER_TEXT_R: Record<number, number> = { 0: 147, 1: 108, 2: 66 };
/** 三层各自的字号（viewBox 单位）。核心那一层略大一点，读作「这一瓣的顶」。 */
const TIER_FONT: Record<number, number> = { 0: 12, 1: 12.5, 2: 13 };

/** 取表里的值，永远给一个明确的兜底 —— 免得每个调用点都要处理 undefined。 */
function tierValue(table: Record<number, number>, tierIndex: number, fallback: number): number {
  return table[tierIndex] ?? fallback;
}

/**
 * 盘下面那四条说明。
 *
 * 「名词：一句话」的对照式，一条一行 —— 四条各说一件不同的事（外低、内高、
 * 渐变方向、没有颜色的那圈缝隙），排成一行长句读起来要断句才能找到自己
 * 关心的那一条；竖着列开，扫一眼就能对上盘上的位置。
 *
 * 写法上和盘里保持同一个方向感：先「外边缘」再「中心圆」，最后才说
 * 「向中心」怎么变 —— 读者顺着盘的半径由外向内看，文字也是这个顺序。
 */
const WHEEL_NOTES: ReadonlyArray<{ term: string; text: string }> = [
  { term: '外边缘', text: '低强度情绪' },
  { term: '中心圆', text: '高强度情绪' },
  { term: '向中心', text: '情绪渐强' },
  { term: '无色区', text: '混合情绪' },
  { term: '对角', text: '混合情绪互为相反' },
];

/** 指针停在哪一格用「第几瓣」。自动步进也是按瓣走。 */
const PETAL_COUNT = EMOTION_PETALS.length;

/** 自动选中时落在哪一层：最高强度那一层，正对圆心方向。 */
const DEFAULT_TIER = 2;

interface EmotionWheelProps {
  className?: string;
}

export function EmotionWheel({ className }: EmotionWheelProps) {
  const reduceMotion = useReducedMotion();
  /** 点中并锁定的那一格（cell.id）；为空表示「跟着指针自动走」。 */
  const [lockedId, setLockedId] = useState<string | null>(null);
  /**
   * 自动转动走到第几步（每步 45°）。
   *
   * 允许是小数：收起卡片时要把盘从"当前实际角度"接回自动步进，
   * 只有小数步长才能让两者严丝合缝对上。读瓣号时一律先 Math.round。
   */
  const [step, setStep] = useState(0);
  /** 鼠标悬停暂停时停在哪一格（cell 下标）；为空表示没有悬停。 */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /** 点中时把盘面角度原样冻住，锁定之后一步不动。 */
  const [frozenSpin, setFrozenSpin] = useState<number | null>(null);
  /** 手动点过之后就不再自动转，直到收起。 */
  const [autoOn, setAutoOn] = useState(true);
  /** 卡片显隐：follow 跟随指针 / locked 锁定 / off 用户主动收起。 */
  const [cardMode, setCardMode] = useState<'follow' | 'locked' | 'off'>('follow');
  /** 当前用键盘聚焦的那一格（cell 下标）。 */
  const [keyboardFocus, setKeyboardFocus] = useState<number | null>(null);
  /**
   * 被点亮的那一对相反情绪（复合词的名字）。为空表示没点亮。
   *
   * 悬停或聚焦某个复合词时它亮起来，对面那个也一起亮 —— 这两个词说的是
   * 同一件相反的事。点亮时再朝外画一小截箭头，连到画面边缘暗示「相反的
   * 在对面」，而不是横穿盘心画一根线（八根会织成一张网）。
   */
  const [litDyad, setLitDyad] = useState<string | null>(null);
  /** 只有桌面端才自动转（手机上自动转会分散注意力）。 */
  const [isDesktop, setIsDesktop] = useState(false);
  const titleId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  /** 盘面那层 <g>：点击时要读它的**实际**角度。 */
  const spinRef = useRef<SVGGElement>(null);
  /** 盘（正方形那块）的引用，用来判断"点到盘外了没有"。 */
  const boardRef = useRef<HTMLDivElement>(null);
  /** 盘面目标角度的最新值，供闭包里的回调读取。 */
  const spinTargetRef = useRef(0);
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

  /** 停止自动转动的「硬开关」：setState 是异步的，这一拍要同步关掉。 */
  const autoRef = useRef(false);
  autoRef.current = autoActive && !hovering;

  /*
   * 指针停在哪一格，用 ref 记着。
   *
   * 盘在转，鼠标不动时指针底下那一格每转一格就换一个元素，Enter/Leave
   * 会一轮轮地重放。所以只认「鼠标真的动过」：松手移动时记下鼠标位置
   * 和那一刻指针指着的格子；之后盘怎么转都不改，鼠标一动就重新记。
   */
  const hoveredRef = useRef<number | null>(null);
  hoveredRef.current = hoverIndex;
  const pointerPos = useRef<{ x: number; y: number } | null>(null);

  /*
   * 转盘被滚出视口就不再自动转 —— 首页两屏都是 100dvh，转盘在第二屏，
   * 进页面时它整个在视口之外，照转只是空跑定时器。
   */
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry ? entry.isIntersecting : false),
      { threshold: 0.3 },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  /* 自动转动：悬停、锁定、收起都会让这个 effect 重跑，定时器随之停掉。 */
  useEffect(() => {
    if (!autoActive || !inView) return;
    const timer = window.setInterval(() => {
      if (!autoRef.current) return;
      // floor + 1：step 可能是小数，先归到下一整瓣，别停在两瓣之间
      setStep((current) => Math.floor(current) + 1);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [autoActive, inView]);

  /**
   * 鼠标压在哪一格。
   *
   * 只记「指针现在落在谁身上」，绝不参与旋转角度的计算 —— 否则鼠标每挪
   * 1px 盘就跟着补一段角度，格子从指针底下跑掉、指针又落到新格上，越挪越乱。
   */
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
      const index = target ? Number(target.getAttribute('data-cell-index')) : NaN;
      const next = Number.isFinite(index) ? index : null;
      if (next === hoveredRef.current) return;
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

  /* 起始那一瓣在挂载后才摇：写在 useState 初值里会让服务端与客户端对不上。 */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setStep(Math.floor(Math.random() * PETAL_COUNT));
    setReady(true);
  }, []);

  /** 起始瓣还没摇出来之前，盘先停在 0°。 */
  const initialSpin = -PETAL_DEG / 2;

  const mod = (value: number) => ((value % PETAL_COUNT) + PETAL_COUNT) % PETAL_COUNT;

  /*
   * 整盘旋转角度。目标要求「那一瓣的瓣心 = -90°」，反解出整盘要转多少度，
   * 再补整圈保证永远朝一个方向转 —— 不会为了归位突然倒着甩回去。
   */
  const baseSpin = -PETAL_DEG / 2 - step * PETAL_DEG;

  /**
   * 盘此刻**实际**停在多少度。
   *
   * CSS 过渡要 0.82s，React 里的 baseSpin 早就跳到终点了。过渡途中读它，
   * 读到的是"它要去哪"，不是"它现在在哪"。点击时若冻错值，盘会自己把
   * 剩下那半格走完 —— 看起来就是"点完它自己跑到指针下面去了"。
   */
  const readLiveSpin = () => {
    const el = spinRef.current;
    const target = spinTargetRef.current;
    if (!el) return target;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    const raw = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
    const turns = Math.round((target - raw) / 360);
    return raw + turns * 360;
  };

  /** 锁定的那一格下标；没锁定就是 null。 */
  const lockIndex = lockedId
    ? Math.max(0, EMOTION_CELLS.findIndex((cell) => cell.id === lockedId))
    : null;

  /*
   * 盘面的角度只有两个来源，都不看鼠标：
   *   1. 锁定中 → 用点下去那一刻冻结的角度；
   *   2. 待机   → 用自动步进算出来的角度。
   */
  const spinGroup = frozenSpin !== null ? frozenSpin : ready ? baseSpin : initialSpin;
  spinTargetRef.current = spinGroup;

  /*
   * 盘还「在路上」。高亮/卡片跟着鼠标切换时，盘刚被停住但过渡还没走完，
   * 鼠标底下那一格随时会换人。这段时间统一用「指针下那一格」当展示格，
   * 等盘站定了再交给悬停记下的那一格。
   */
  const [settled, setSettled] = useState(true);
  useEffect(() => {
    if (hoverIndex === null && frozenSpin === null) {
      setSettled(true);
      return;
    }
    setSettled(false);
    const timer = window.setTimeout(() => setSettled(true), SPIN_MS + 40);
    return () => window.clearTimeout(timer);
  }, [hoverIndex, frozenSpin]);

  /** 待机时「指针下那一格」= 指针下那一瓣的最高强度层。 */
  const defaultCellIndex = (petalIndex: number) => petalIndex * 3 + DEFAULT_TIER;

  /*
   * 当前"被展示"的那一格。
   *   锁定 → 被点中的那格；悬停 → 鼠标压着的那格；待机 → 步进走到的那瓣的顶层。
   * 锁定分支必须取 lockIndex：锁定后 step 不再前进，两者可能差一格。
   */
  const hoverFocus = hovering
    ? settled
      ? hoverIndex
      : defaultCellIndex(mod(Math.round(step)))
    : null;
  const focusIndex = lockIndex ?? hoverFocus ?? defaultCellIndex(mod(Math.round(step)));

  const focused: EmotionCell = EMOTION_CELLS[focusIndex] ?? (EMOTION_CELLS[0] as EmotionCell);
  const isLocked = lockedId !== null;

  /** 正对指针的那一瓣，用来给那一瓣的最高层打 .emotion-wheel-slice-top。 */
  const pointerPetal = focused.petalIndex;

  /*
   * 卡片出在哪一侧：看被展示的那一瓣此刻在屏幕的左半圈还是右半圈。
   * 瓣心角（盘没转时）是 -90 + 45i；加上整盘转过的角度就是它在屏幕上的角度。
   */
  const pointerAngle = START_DEG + focused.petalIndex * PETAL_DEG + spinGroup;
  const cardSide: 'left' | 'right' = Math.cos((pointerAngle * Math.PI) / 180) >= 0 ? 'right' : 'left';

  /**
   * 把盘从"当前实际角度"接回自动步进，一次不出戏。
   * step 允许小数正是为了这一步：反解出使 baseSpin 恰好等于 live 的 step。
   */
  const handBackToAuto = (live: number) => {
    setStep((-PETAL_DEG / 2 - live) / PETAL_DEG);
    setFrozenSpin(null);
    setAutoOn(true);
  };

  const selectCell = useCallback(
    (cell: EmotionCell) => {
      if (lockedId === cell.id) {
        // 再点一次同一格：收起，继续自动转。用 off 而不是 follow，
        // 否则自动态下卡片等于"刚收起又冒出来"。
        handBackToAuto(readLiveSpin());
        setLockedId(null);
        setHoverIndex(null);
        setCardMode('off');
        return;
      }
      /*
       * 点下去那一刻盘停在哪就冻在哪，取的是**实际角度**。
       * 再加上 .is-locked 把过渡收到 0.22s，观感是"被指尖按停"。
       */
      setFrozenSpin(readLiveSpin());
      setHoverIndex(null);
      autoRef.current = false;
      setLockedId(cell.id);
      setAutoOn(false);
      setCardMode('locked');
    },
    [lockedId],
  );

  const close = useCallback(() => {
    handBackToAuto(readLiveSpin());
    setLockedId(null);
    setHoverIndex(null);
    setCardMode('off');
  }, []);

  /*
   * 点击「转盘以外」关闭。两个例外必须放行：
   *   1. 盘的舞台内部；2. 详情卡片内部（卡片是 stage 的兄弟节点）。
   * 真凶是 pointerdown 比 click 早：手指按下去卡就收了，返回按钮的 click 落空。
   */
  useEffect(() => {
    if (!lockedId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (boardRef.current && boardRef.current.contains(target)) return;
      if (cardRef.current && cardRef.current.contains(target)) return;
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

  /** 卡片到底要不要渲染。自动态只在「桌面 + 没被收起 + 转盘真的在眼前」时成立。 */
  const showCard = cardMode !== 'off' && (isLocked || (isDesktop && autoActive && inView));

  return (
    <section
      aria-labelledby={titleId}
      className={cn('emotion-wheel', lockedId && 'has-active', className)}
      /*
        待机节拍写进 DOM：e2e 里那些「等一格」「跨过两个步进点」的断言
        要按真实间隔算，不能把 3000 抄进测试 —— 一改节拍就红一片，
        而且红的地方看起来像"转盘坏了"，其实只是测试记着旧数字。
      */
      data-step-ms={STEP_MS}
    >
      <h2 id={titleId} className="sr-only">
        情绪转盘
      </h2>

      <div ref={stageRef} className="emotion-wheel-stage">
        <div ref={boardRef} className="emotion-wheel-board">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="radiogroup"
            aria-label="情绪转盘：八种基础情绪，每瓣从外到内越来越强烈，点一格看它的说明"
            className="emotion-wheel-svg"
          >
            <g ref={spinRef} className="emotion-wheel-spin" style={{ transform: `rotate(${spinGroup}deg)` }}>
              {EMOTION_PETALS.map((petal, petalIndex) => {
                const startDeg = START_DEG + petalIndex * PETAL_DEG;
                const endDeg = startDeg + PETAL_DEG;
                const midDeg = startDeg + PETAL_DEG / 2;

                return (
                  <g key={petal.id} className="emotion-wheel-petal" data-petal={petal.family}>
                    {petal.tiers.map((tier, tierIndex) => {
                      const cellIndex = petalIndex * 3 + tierIndex;
                      const cell = EMOTION_CELLS[cellIndex] as EmotionCell;
                      const band = TIER_BANDS[tierIndex] ?? { outer: R_RING, inner: 0 };
                      /*
                       * 核心那一层没有内沿：它一直铺到圆心，是这八个花瓣共同的
                       * 底盘。其余两层是「外沿弧到内沿弧」的一条环带。
                       */
                      const solidCore = band.inner <= 0;
                      const anchor = polar(tierValue(TIER_TEXT_R, tierIndex, 111), midDeg);
                      const isActive = lockedId === cell.id;
                      const isDimmed = lockedId !== null && !isActive;
                      const isTop = petalIndex === pointerPetal && tierIndex === DEFAULT_TIER;
                      const isHovered = hoverIndex === cellIndex && keyboardFocus === null;
                      const fontSize = tierValue(TIER_FONT, tierIndex, 12);

                      return (
                        <g
                          key={cell.id}
                          role="radio"
                          tabIndex={0}
                          aria-checked={isActive}
                          aria-label={`${cell.label}，${INTENSITY_LABEL[cell.intensity]}`}
                          data-cell-index={cellIndex}
                          data-slice-index={cellIndex}
                          data-petal-index={petalIndex}
                          data-tier={tierIndex}
                          onClick={() => selectCell(cell)}
                          onFocus={() => setKeyboardFocus(cellIndex)}
                          onBlur={() =>
                            setKeyboardFocus((current) => (current === cellIndex ? null : current))
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              selectCell(cell);
                              return;
                            }
                            /*
                             * 方向键：上/下在同一瓣的三层之间走（外 → 内 = 强度升高），
                             * 左/右跨到相邻花瓣的同一层。
                             */
                            let next = cellIndex;
                            if (event.key === 'ArrowDown') next = Math.min(petalIndex * 3 + 2, cellIndex + 1);
                            else if (event.key === 'ArrowUp') next = Math.max(petalIndex * 3, cellIndex - 1);
                            else if (event.key === 'ArrowRight')
                              next = ((petalIndex + 1) % PETAL_COUNT) * 3 + tierIndex;
                            else if (event.key === 'ArrowLeft')
                              next = ((petalIndex - 1 + PETAL_COUNT) % PETAL_COUNT) * 3 + tierIndex;
                            else return;
                            event.preventDefault();
                            setKeyboardFocus(next);
                            const el = stageRef.current?.querySelector<SVGGElement>(
                              `[data-cell-index="${next}"]`,
                            );
                            el?.focus();
                          }}
                          className={cn(
                            'emotion-wheel-slice focus:outline-none',
                            isDimmed && 'emotion-wheel-slice-dim',
                            isTop && 'emotion-wheel-slice-top',
                            isHovered && 'emotion-wheel-slice-hot',
                            keyboardFocus === cellIndex && 'emotion-wheel-slice-focus',
                          )}
                          style={
                            {
                              '--slice-color': petal.color,
                              '--slice-edge': petal.edge,
                              '--slice-ink': petal.ink,
                            } as React.CSSProperties
                          }
                        >
                          {/*
                            这一格的形状 —— 一条 path 既是色块，也是可点区域。

                            以前这里是「整瓣轮廓 + clipPath 取圆环」，同一个格子
                            要画两条 path（一条上色、一条透明接点击），因为
                            命中测试只认 path 自己的几何。现在带子的路径是直接
                            算出来的，画出来的形状就是点得到的形状，一条够。

                            核心那一层不是带子，是扇形：八个扇形拼成一个整圆。
                          */}
                          <path
                            d={
                              solidCore
                                ? sectorPath(startDeg, endDeg, band.outer)
                                : petalBandPath(startDeg, endDeg, band.outer, band.inner)
                            }
                            fill={petal.color}
                            stroke={petal.edge}
                            strokeWidth={0.9}
                            strokeOpacity={0.5}
                            strokeLinejoin="round"
                            className="emotion-wheel-slice-shape"
                          />

                          {/*
                            词一律横排、且不动。

                            三层靠半径分开（147 / 108 / 66），差着 39 和 42，
                            比一个字盒（16 高）宽得多，所以不需要任何角度上的
                            技巧。上一版在切向上错开 ±11 的做法也随之取消了。

                            外层那个 -spinGroup 是抵消盘面的转动：盘在转，
                            字不能跟着转，否则读不了。
                          */}
                          <g transform={`translate(${anchor.x.toFixed(2)} ${anchor.y.toFixed(2)})`} pointerEvents="none">
                            <g className="emotion-wheel-counter" style={{ transform: `rotate(${-spinGroup}deg)` }}>
                              <g key={`label-${cell.id}`} className="emotion-wheel-slice-caption">
                                <text
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  className="emotion-wheel-slice-label"
                                  fill={petal.ink}
                                  fontSize={fontSize}
                                  fontWeight="600"
                                  letterSpacing="0.04em"
                                >
                                  {cell.label}
                                </text>
                              </g>
                            </g>
                          </g>
                        </g>
                      );
                    })}

                    {/* 花瓣尖端到复合词之间那个「+」：说明这两瓣混出了旁边那个词 */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="emotion-wheel-plus"
                      fill={petal.ink}
                      fontSize="9"
                      opacity="0.55"
                      transform={`translate(${polar(R_TIP - 8, startDeg).x.toFixed(2)} ${polar(R_TIP - 8, startDeg).y.toFixed(2)})`}
                      aria-hidden="true"
                    >
                      +
                    </text>
                  </g>
                );
              })}

              {/*
                核心圆的那道白圈。

                它就是参考图里最里面那个圆 —— 圈内是八种高强度情绪，圈外
                才开始分层。半径取高强度层的外沿，正好压在那条分界上；
                pointer-events 关掉，它只管好看，不跟底下的格子抢点击。
              */}
              <circle
                cx={CX}
                cy={CY}
                r={R_RING}
                fill="none"
                className="emotion-wheel-core-ring"
                pointerEvents="none"
              />

              {/*
                复合情绪：八个只读标签，落在相邻两瓣的夹角上。
                它们不参与点击 —— 点开能看的仍然是那二十四层的词。

                角度必须是 i × 45°（第 i 瓣的**起始边**），不是 i × 45° + 22.5°。
                后者是这一瓣自己的中线 —— 词会跑到瓣尖正上方，看着像给
                这一瓣起了个别名，而它本该说的是「左边这一瓣 + 右边这一瓣」。
                第 0 个落在第 7 瓣与第 0 瓣之间（乐观 = 期待 + 喜悦），
                后面依次顺时针跟上去。

                字和花瓣里的词一样是横排、且抵消整盘转动。早先这里跟着
                角度切向转，盘一转，绕到下半圈的那几个就成了倒字（乐观、
                喜爱直接头朝下）—— 一圈里八个方向的字，总有一半是歪的。
                横排之后八个词读法一致；半径也从 192 收到 186，正好把左右
                那两个收进 viewBox。
              */}
              {EMOTION_DYADS.map((dyad, index) => {
                const angle = START_DEG + index * PETAL_DEG;
                const pos = polar(R_DYAD, angle);
                /*
                 * 这一对里有没有人被点亮：自己亮，或者对面那个亮 ——
                 * 两个都要亮，因为它们说的正是「相反」这件事。
                 */
                const isLit =
                  litDyad !== null && (dyad.label === litDyad || dyad.opposite === litDyad);

                return (
                  <g
                    key={dyad.label}
                    className={cn('emotion-wheel-dyad', isLit && 'is-lit')}
                    transform={`translate(${pos.x.toFixed(2)} ${pos.y.toFixed(2)})`}
                    data-dyad={dyad.label}
                    data-opposite={dyad.opposite}
                    /*
                     * 可聚焦但不进 tab 序列（tabIndex -1）：键盘用户不需要
                     * 为八个只读标注多按八下跳格；但用读写器去「读到这里」
                     * 时，它得能被聚焦，否则点亮这件事只有鼠标能做。
                     */
                    tabIndex={-1}
                    onPointerEnter={() => setLitDyad(dyad.label)}
                    onPointerLeave={() => setLitDyad((current) => (current === dyad.label ? null : current))}
                    onFocus={() => setLitDyad(dyad.label)}
                    onBlur={() => setLitDyad((current) => (current === dyad.label ? null : current))}
                  >
                    {/*
                      朝外的那一小截线，只在点亮时出现 —— 它说的是「相反的
                      在对面的那一头」。从词的内侧往外画，不越过文字。
                    */}
                    <line
                      className="emotion-wheel-dyad-link"
                      x1={0}
                      y1={-(R_DYAD - R_DYAD_LINK_INNER)}
                      x2={0}
                      y2={-(R_DYAD_LINK_OUTER - R_DYAD)}
                      stroke="currentColor"
                      strokeWidth={1.2}
                      strokeLinecap="round"
                      aria-hidden="true"
                    />
                    <g className="emotion-wheel-counter" style={{ transform: `rotate(${-spinGroup}deg)` }}>
                      <text textAnchor="middle" dominantBaseline="middle" className="emotion-wheel-dyad-text">
                        {dyad.label}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>

            {/* 正上方的固定指针：自动转动时指着当前那一瓣 */}
            <g
              aria-hidden="true"
              className={cn('emotion-wheel-pointer', autoActive && 'is-on', isLocked && 'is-locked')}
            >
              <path d="M 200 26 L 189 6 L 211 6 Z" fill="var(--color-ink-ghost, #9a90a8)" opacity="0.75" />
            </g>
          </svg>
        </div>

        {/*
          盘下面这组是读盘的说明书。

          没有它，第一次看到这个盘的人只会看到一堆颜色：为什么同一个词
          出现三次、为什么越往里越「重」、外面那些转着的小字是什么关系 ——
          全靠自己猜。
        */}
        <dl className="emotion-wheel-note">
          {WHEEL_NOTES.map((item) => (
            <div key={item.term} className="emotion-wheel-note-row">
              <dt>{item.term}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>

        {showCard && (
          <div
            className="emotion-wheel-card-slot"
            data-visible="true"
            data-locked={isLocked ? 'true' : 'false'}
            data-side={cardSide}
          >
            {/*
              卡片本体不按情绪 key 重挂：盘每转一格就重挂一张卡会每秒重放
              一遍入场动画，看起来在闪。外壳一直在，只有内部几块按 key 换。
            */}
            <div
              ref={cardRef}
              /*
               * 用 region + aria-live 而不是 dialog：它不是模态框，桌面端
               * 还一直在跟着盘更新；叫 dialog 会和情绪球那个真正的弹层撞 name。
               */
              role="region"
              aria-live="polite"
              aria-label={`${focused.label}，${INTENSITY_LABEL[focused.intensity]}`}
              className="emotion-wheel-card"
              style={
                {
                  '--slice-color': focused.petal.color,
                  '--slice-edge': focused.petal.edge,
                  '--slice-ink': focused.petal.ink,
                } as React.CSSProperties
              }
            >
              <span className="emotion-wheel-card-bar" aria-hidden="true" />

              {/* 换内容时的柔光画在卡片自己的 background 上，不另起盒子 ——
                  绝对定位的放大元素会把自己算进 scrollHeight，卡片凭空多出可滚高度。 */}
              <span
                key={`glow-${focused.id}`}
                aria-hidden="true"
                className={cn('emotion-wheel-card-flash', isLocked && 'emotion-wheel-card-flash-strong')}
              />

              {isLocked ? (
                <span
                  key={`burst-${lockedId}`}
                  aria-hidden="true"
                  className="emotion-wheel-card-burst"
                  data-side={cardSide}
                />
              ) : null}

              <h3 key={`t-${focused.id}`} className="emotion-wheel-card-title emotion-wheel-card-swap">
                <span className="emotion-wheel-card-dot" aria-hidden="true" />                {focused.label}
              </h3>

              {/*
                这一格属于哪一瓣、强度走到哪一层。原来这里是「是为了获得X」
                加一句解释 —— 换成情绪轮之后，每一格要回答的是「它有多强、
                和谁同源」，不再是「它想跟你要什么」。
              */}
              <p key={`l-${focused.id}`} className="emotion-wheel-card-lead emotion-wheel-card-swap">
                <b>{INTENSITY_LABEL[focused.intensity]}</b>
                <span className="emotion-wheel-card-lead-text">
                  {focused.petal.tiers[0].label} · {focused.petal.tiers[1].label} ·{' '}
                  {focused.petal.tiers[2].label}这一瓣
                </span>
              </p>

              {/*
                这一瓣两侧各长出一个复合情绪，两个都说，每个再补一句它的对立面。

                为什么把「相反」放在这里：复合词本身是只读标注，不弹卡片，
                而「对面是谁」这件事只有在点开某一格时才说得出口。给每对
                加一行「相反 · 乐观」，比单独说一句「乐观是期待加喜悦」
                更能让人记住这个盘的结构 —— 它的八个混合情绪是对称的。
              */}
              {focused.dyads.length > 0 ? (
                <ul
                  key={`d-${focused.id}`}
                  className="emotion-wheel-card-mixed emotion-wheel-card-swap emotion-wheel-card-swap-late"
                >
                  {focused.dyads.map((dyad) => (
                    <li key={dyad.label} className="emotion-wheel-card-mixed-row">
                      <div className="emotion-wheel-card-mixed-line">
                        <span className="emotion-wheel-card-mixed-label">{dyad.label}</span>
                        <span className="emotion-wheel-card-mixed-form">
                          {dyad.from[0]} + {dyad.from[1]}
                        </span>
                      </div>
                      <div className="emotion-wheel-card-mixed-line">
                        <span className="emotion-wheel-card-mixed-opp-key">相反</span>
                        <span className="emotion-wheel-card-mixed-opp">{dyad.opposite}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/*
                这一格的具体说明。文案还没写，所以这一块先不渲染 ——
                留白比塞一句凑数的话强。
              */}
              {focused.note ? (
                <div
                  key={`m-${focused.id}`}
                  className="emotion-wheel-card-method emotion-wheel-card-swap emotion-wheel-card-swap-late"
                >
                  <span className="emotion-wheel-card-key">可以这样</span>
                  <p className="emotion-wheel-card-text">{focused.note}</p>
                </div>
              ) : null}

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
