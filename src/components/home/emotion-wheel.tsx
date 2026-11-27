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
 * 形状是一朵八瓣的花：八个花瓣各是一种基础情绪，每瓣从外到内分三层，
 * 越靠圆心越强烈。相邻两瓣交界处的空白里，各标着一个复合情绪。
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

/** 自动转动：每步停留多久（毫秒）。0.82s 转 + 约 2.2s 停，够读一个词。 */
const STEP_MS = 3000;

/** 盘的旋转过渡时长（毫秒），必须和 globals.css 里 .emotion-wheel-spin 对上。 */
const SPIN_MS = 820;

/** 转盘 viewBox 尺寸（正方形），所有几何都基于它，再用 CSS 缩放适配。 */
const SIZE = 400;
const CX = SIZE / 2;
const CY = SIZE / 2;

/*
 * 花瓣的几条半径。
 *
 * 形状不是正圆：每瓣从圆心伸出去，尖端在 R_TIP，两瓣之间收进 R_VALLEY，
 * 所以是八个凸起的叶瓣，而不是一个均匀的饼。
 */
const R_TIP = 162;
/**
 * 两瓣交界处离圆心多远。
 *
 * 这个值决定花瓣「胖瘦」。取 96（比尖端小一半）时每瓣像一根细长的柳叶，
 * 三个词塞不下、字全挤在中线上；取 138 后又太瘦，外层放字的位置只剩
 * 二十几个单位宽。145 是实测下来「瓣形好看」和「放得下字」的交点。
 */
const R_VALLEY = 145;
/**
 * 层与层的分界（从外往里数）。
 *
 * 分界线要落在两层文字中间，不能压字。三层锚点是 88 / 110 / 135，
 * 所以两条线取在 99 和 123 —— 各自离上下的字都有十来个单位。
 */
const R_TIER1 = 123;
const R_TIER2 = 99;
/**
 * 内层一直收到这里。
 *
 * 这个值决定内层词离圆心多远，是这一版调得最久的一个数。
 *
 * 八个花瓣在圆心交汇，内层词的锚点只要落到 r≈70 以内，相邻两瓣的
 * 笔画就会顶在一起（实测 r=71 时「憎恶」和「惊悚」的下缘已经叠上）。
 * 收到 62 之后锚点落到 r≈90，八个词才围成一圈、彼此让开。
 * 圆心因此空出一块 —— 参考图里那块空是白圆，这里留空也一样成立。
 */
const R_CORE = 62;
/**
 * 复合情绪标签所在的半径。
 *
 * 必须落在花瓣尖（R_TIP=162）之外。190 是「再往外就顶到 viewBox 边缘」
 * 的位置：200 是半宽，字旋转后还要占十来个单位，取 190 刚好贴边不溢出。
 */
const R_DYAD = 190;

/** 极坐标 → 直角坐标。0° 指向正右，传入用「度」。 */
function polar(radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

/**
 * 把「瓣心角」换算成文字该转的角度，保证字正着读。
 *
 * 瓣心角 midDeg 是从 12 点顺时针量的，单独照着它转，下半圈那几瓣的字
 * 会整个倒过来（读的人得把屏幕转 180° 才看得懂）。
 *
 * 文字是横切半径的，所以先按 midDeg - 90 把基线摆成切向（中轴线在 12 点
 * 时即水平），再归一到 (-180, 180]，超出 ±90 就翻 180° —— 翻过来之后
 * 它仍是切向，只是朝里朝外互换，读起来一样。
 */
function uprightDeg(_midDeg: number): number {
  /*
   * 文字一律横排。
   *
   * 试过竖排和斜排，都不行：竖排会在左半圈倒着读，斜排（45°）的中文笔画
   * 全是斜的，八瓣里还有四瓣歪向不同方向。横排是唯一既好读、又能在每个
   * 圆环里放下两个字的排法 —— 层与层之间靠半径和切向同时错开来分。
   *
   * 横排就不需要转任何角度了：字本来就是正的。这里恒返回 0，留着这个
   * 函数是因为 counter 那一层还要按它算偏移 —— 将来若要重新考虑斜排，
   * 改动点也只在这一处。
   */
  return 0;
}

/**
 * 一个花瓣的轮廓。
 *
 * 用四段三次贝塞尔描一个「叶瓣」：圆心 → 尖端 → 回到圆心。
 * 关键在于控制点要贴着自己那一侧走 —— 一开始我把控制点放在半径 R_TIP×0.62
 * 的弧上，那等于把花瓣从中间掐住，画出来是八根尖刺，不是八片叶。
 */
function petalOutline(startDeg: number, endDeg: number): string {
  const mid = (startDeg + endDeg) / 2;
  const tip = polar(R_TIP, mid);
  // 两侧谷底：就落在相邻两瓣的分界方向上
  const valleyL = polar(R_VALLEY, startDeg);
  const valleyR = polar(R_VALLEY, endDeg);
  const f = (n: number) => n.toFixed(2);

  /*
   * 四段控制点，围出来的是一只饱满的叶瓣。
   *
   * 圆心 → 尖端：控制点要**贴着本瓣的边界**斜着拉出去，花瓣才会从腰部
   * 鼓起来；如果把控制点放在中线上，画出来是一根细针。
   * 尖端 → 谷底：反过来，控制点要往谷的方向收，尖端才不会变成一根刺。
   */
  const c1 = polar(R_TIP * 0.34, startDeg + PETAL_DEG * 0.06);
  const c2 = polar(R_TIP * 0.88, mid - PETAL_DEG * 0.3);
  const c3 = polar(R_TIP * 0.88, mid + PETAL_DEG * 0.3);
  const c4 = polar(R_VALLEY, endDeg - PETAL_DEG * 0.1);

  return [
    `M ${CX} ${CY}`,
    `C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(tip.x)} ${f(tip.y)}`,
    `C ${f(c3.x)} ${f(c3.y)} ${f(c4.x)} ${f(c4.y)} ${f(valleyR.x)} ${f(valleyR.y)}`,
    // 沿两瓣之间的山谷回到圆心，走一条略微内凹的弧，让腰部收得干净
    `Q ${CX} ${CY} ${f(valleyL.x)} ${f(valleyL.y)}`,
    'Z',
  ].join(' ');
}

/**
 * 某一层花瓣的填充。
 *
 * 做法：取「这一瓣的轮廓」与「半径区间 [rInner, rOuter] 的圆环」的交集。
 *
 * 直接用花瓣曲线按比例缩半径是不行的 —— 半径一小，花瓣就窄成一条，字放不下。
 * 交集则天然保留了每一层的真实形状：外层是贴着瓣边的宽叶，往里逐层变瘦，
 * 但每一层在该半径处的宽度就是花瓣本身的宽度，跟参考图那种「同心分层」一致。
 *
 * 交集没法直接写成一条 path，所以用 circle 的 clip 思路反过来做：
 * 这里只负责给出「花瓣形状 ∩ 圆环」，靠 SVG 的 clipPath 在渲染时完成裁切。
 */
/**
 * 某一格的完整形状：外沿弧与内沿弧之间、被两条瓣侧夹住的那一块。
 *
 * 只用来接收指针 —— fill 设成透明，靠 pointer-events="all" 生效。
 * 为什么不能直接复用色块那条 path：命中测试看的是 path 自己的几何，
 * clipPath 不参与判定，所以三层的色块（d 都是整瓣轮廓）会互相盖死。
 *
 * 填法用 evenodd（不是 nonzero）：外沿顺时针、内沿逆时针不必刻意配平，
 * 两条环之间自然留空，就不必再挂一层 clipPath 去掉圆心那一块。
 */
function tierBandPath(startDeg: number, endDeg: number, rOuter: number, rInner: number): string {
  const f = (n: number) => n.toFixed(2);
  const mid = (startDeg + endDeg) / 2;
  /*
   * 两层弧用同一套控制点比例（控制点落在本半径的 0.88 处、沿弧偏 0.3 个
   * 瓣宽），和 petalOutline 里 valley 段那条贝塞尔是同一种走法 —— 这样
   * 可点区域的边和画出来的瓣边严丝合缝，不会差出一圈缝。
   */
  const arc = (r: number) => {
    const l = polar(r, startDeg);
    const rp = polar(r, endDeg);
    const c1 = polar(r * 0.88, mid - PETAL_DEG * 0.3);
    const c2 = polar(r * 0.88, mid + PETAL_DEG * 0.3);
    return { l, rp, c1, c2 };
  };
  const out = arc(rOuter);
  const inn = arc(rInner);
  return [
    // 外沿：瓣左 → 瓣右
    `M ${f(out.l.x)} ${f(out.l.y)}`,
    `C ${f(out.c1.x)} ${f(out.c1.y)} ${f(out.c2.x)} ${f(out.c2.y)} ${f(out.rp.x)} ${f(out.rp.y)}`,
    // 径向收到内沿，再由内沿弧走回来
    `L ${f(inn.rp.x)} ${f(inn.rp.y)}`,
    `C ${f(inn.c2.x)} ${f(inn.c2.y)} ${f(inn.c1.x)} ${f(inn.c1.y)} ${f(inn.l.x)} ${f(inn.l.y)}`,
    'Z',
  ].join(' ');
}

function ringPath(rOuter: number, rInner: number): string {
  const f = (n: number) => n.toFixed(2);
  // 外圆顺时针、内圆逆时针，中间的环形就是填充区（nonzero 规则）
  return [
    `M ${CX} ${CY - rOuter}`,
    `A ${f(rOuter)} ${f(rOuter)} 0 1 1 ${CX} ${CY + rOuter}`,
    `A ${f(rOuter)} ${f(rOuter)} 0 1 1 ${CX} ${CY - rOuter}`,
    `M ${CX} ${CY - rInner}`,
    `A ${f(rInner)} ${f(rInner)} 0 1 0 ${CX} ${CY + rInner}`,
    `A ${f(rInner)} ${f(rInner)} 0 1 0 ${CX} ${CY - rInner}`,
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
  1: { outer: R_TIER1, inner: R_TIER2 },
  2: { outer: R_TIER2, inner: R_CORE },
};

/**
 * 三层文字的落点（实测值）：半径 + 沿切向的偏移。
 *
 * 三个词不是沿一个方向排开的，而是"往里收 + 切向错开"一起用 —— 这样
 * 每个词都落在自己那个圆环的正中，前后、左右都不撞。
 */
const TIER_TEXT_GEO: Record<number, { r: number; shift: number }> = {
  0: { r: 134, shift: 11 },
  1: { r: 112, shift: 0 },
  2: { r: 90, shift: -11 },
};
/** 三层各自的字号（viewBox 单位）。径向排布不受花瓣宽度限制，可以给足。 */
const TIER_FONT: Record<number, number> = { 0: 12, 1: 12.5, 2: 12 };

/** 取表里的值，永远给一个明确的兜底 —— 免得每个调用点都要处理 undefined。 */
function tierValue(table: Record<number, number>, tierIndex: number, fallback: number): number {
  return table[tierIndex] ?? fallback;
}

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
                    {/*
                      描边单独画在最底层，填充不画。

                      原来这道描边挂在「花瓣底色」那个 path 上，于是它同时是
                      三层的共同底 —— 高亮某一层时，整片几何一起变色，看着像
                      三格连成了一体。现在描边只管轮廓，填充交给每个可点的
                      层自己画（.emotion-wheel-slice-shape），这样 hover、
                      选中、聚焦才能只作用在被指着的那一格上。
                    */}
                    <path
                      d={petalOutline(startDeg, endDeg)}
                      fill="none"
                      stroke={petal.edge}
                      strokeWidth={1.6}
                      strokeLinejoin="round"
                      className="emotion-wheel-petal-outline"
                      pointerEvents="none"
                    />

                    {petal.tiers.map((tier, tierIndex) => {
                      const cellIndex = petalIndex * 3 + tierIndex;
                      const cell = EMOTION_CELLS[cellIndex] as EmotionCell;
                      const band = TIER_BANDS[tierIndex] ?? { outer: R_TIER2, inner: R_CORE };
                      const clipId = `${titleId}-t${petalIndex}-${tierIndex}`;
                      /*
                       * 三层落在哪：先沿瓣中线取到锚点，再沿「层叠方向」
                       * 偏移 —— 外圈朝外、内圈朝内、中层居中。
                       *
                       * 偏移是垂直或平行于瓣轴线的方向（见 layerShiftAngle），
                       * 所以外层往外推 SPACING、内层往里收 SPACING，三层在
                       * 画面上就是整齐的一列（或一行），间距恒定。
                       */
                      /*
                       * 三层的落点，全是写死的：外 / 中 / 内 = 半径 134 / 112 / 90，
                       * 各自沿瓣中线（切向）让开 11 / 0 / -11。
                       *
                       * 这些数是量出来的，不是推出来的 —— 字盒实测 25×16（两个字），
                       * 而这一瓣在 r=112 处切向只有 33 单位、径向有 44 单位，所以
                       * 三个词能排开，靠的是"切向错开 ±11、径向同时收 22"，两个方向
                       * 一起用。只错一个方向，半径小的地方就一定会顶到隔壁层。
                       */
                      const tierGeo = TIER_TEXT_GEO[tierIndex] ?? { r: 90, shift: -11 };
                      const anchor = polar(tierGeo.r, midDeg + tierGeo.shift);
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
                            这一层的填充：花瓣轮廓 ∩ 半径区间。

                            不用「把花瓣曲线按比例缩半径」那一套 —— 半径一小
                            花瓣就窄成一条，内层会缩成一根尖刺，字放不下。
                            这里让 clipPath 取圆环，形状用整瓣的轮廓，交集
                            自然就是「贴着瓣边、按半径切开」的那一块，
                            和参考图那种同心分层是同一种结构。
                          */}
                          <clipPath id={clipId}>
                            <path d={ringPath(band.outer, band.inner)} />
                          </clipPath>
                          <clipPath id={`${clipId}-petal`}>
                            <path d={petalOutline(startDeg, endDeg)} />
                          </clipPath>

                          {/*
                            可点区域 —— 必须单独再画一遍，不能指望上面那个被裁过的色块。

                            命中测试看的是 path 自己的几何，clipPath 只影响绘制：
                            那个 <path> 的 d 是整瓣轮廓，于是三层的可点区域都是
                            同一整瓣，谁在上面谁吃掉全部点击（实测内层把外两层
                            全盖住了）。这里按「外沿弧 + 两条瓣侧」画出这一层真正的
                            范围，再用 clipPath 把圆环以内切掉，正好剩下这一格。

                            填充是透明的，但 pointer-events="all" 让它照样接收指针 ——
                            视觉上什么也没多，可点区域和看得见的那块终于对上了。
                          */}
                          <path
                            d={tierBandPath(startDeg, endDeg, band.outer, band.inner)}
                            fill="transparent"
                            stroke="none"
                            fillRule="evenodd"
                            pointerEvents="all"
                          />

                          <g clipPath={`url(#${clipId})`}>
                            <path
                              d={petalOutline(startDeg, endDeg)}
                              fill={petal.color}
                              stroke="none"
                              className="emotion-wheel-slice-shape"
                            />
                          </g>
                          {/*
                            分界线：这一层的内沿。

                            三个裁剪条件缺一不可 —— 圆环（不然整圈都在）、
                            花瓣（不然横穿旁边的空白）、以及排除圆心那一块。
                            放在被裁的组外面画，是因为它正好压在裁剪边界上，
                            放进去会被自己那刀裁掉一半。
                          */}
                          <g clipPath={`url(#${clipId}-petal)`} pointerEvents="none">
                            <circle
                              r={band.inner}
                              cx={CX}
                              cy={CY}
                              fill="none"
                              stroke={petal.edge}
                              strokeWidth={1.2}
                              strokeOpacity={0.62}
                              className="emotion-wheel-divider"
                            />
                          </g>

                          {/*
                            词的方向：横切半径，但要保证「正着读」。

                            最早试过三种，只有最后这种排得开：

                            1. 水平横排 —— 斜向花瓣在同一半径上只剩一条斜缝，
                               两个字放不下，出界。
                            2. 沿半径竖着排 —— 字能放下，但两个字要占 20 多个
                               单位长，而层与层的间距只有 22~25 单位，同一瓣
                               三层的词首尾相接，糊成一条（"伤感悲伤悲痛"）。
                            3. 横切半径（现在这种）—— 文字基线垂直于这一瓣的
                               中轴线，正好压在圆环的切线方向上。每个词只占
                               一个字的宽度（约 12 单位）在径向上，三层之间
                               因此稳稳隔开；切向那边由花瓣的宽度兜底，
                               外宽内窄，正好对上字号由大到小。

                            再加一步翻正：切向角度如果让字上下颠倒，就翻 180°，
                            让它落在「右半边朝外、左半边朝内」这个可读区间。
                            原图里八瓣的字也都是正立或轻微倾斜，没有倒着的。
                          */}
                          <g transform={`translate(${anchor.x.toFixed(2)} ${anchor.y.toFixed(2)})`} pointerEvents="none">
                            <g
                              className="emotion-wheel-counter"
                              style={{ transform: `rotate(${-spinGroup + uprightDeg(midDeg)}deg)` }}
                            >
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
                复合情绪：八个只读标签，落在相邻两瓣的夹角上。
                它们不参与点击 —— 点开能看的仍然是那二十四层的词。
              */}
              {EMOTION_DYADS.map((dyad, index) => {
                const angle = START_DEG + index * PETAL_DEG + PETAL_DEG / 2;
                const pos = polar(R_DYAD, angle);
                return (
                  <g
                    key={dyad}
                    className="emotion-wheel-dyad"
                    transform={`translate(${pos.x.toFixed(2)} ${pos.y.toFixed(2)})`}
                    aria-hidden="true"
                  >
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="emotion-wheel-dyad-text"
                      transform={`rotate(${angle + 90})`}
                    >
                      {dyad}
                    </text>
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
