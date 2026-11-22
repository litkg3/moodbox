'use client';

import { useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';

type BlobVars = CSSProperties & Record<`--blob-${string}`, string | number>;

/*
 * 四套形状，锚点数完全一致（8 段三次贝塞尔），所以 `d` 可以直接平滑插值。
 * 半径系数在 0.94 – 1.09 之间错开：局部鼓起、局部收拢，但整体仍是圆润的。
 * 生成脚本见 DESIGN.md「五之二」的说明 —— 改形状时重跑一遍即可。
 */
const BLOB_PATHS = [
  'M 260.0 11.0 C 314.7 13.6, 372.3 51.1, 410.9 77.6 C 449.6 104.1, 486.0 135.5, 492.0 170.0 C 498.0 204.5, 485.7 263.2, 447.0 284.5 C 408.3 305.8, 319.1 299.8, 260.0 297.8 C 200.9 295.8, 128.2 293.7, 92.7 272.4 C 57.1 251.1, 48.2 205.1, 46.6 170.0 C 44.9 134.9, 47.3 88.1, 82.8 61.6 C 118.4 35.1, 205.3 8.3, 260.0 11.0 Z',
  'M 260.0 39.4 C 315.8 37.4, 393.9 39.8, 437.2 61.6 C 480.5 83.3, 523.7 136.2, 519.8 170.0 C 516.0 203.8, 457.5 239.3, 414.2 264.4 C 370.9 289.5, 310.9 320.9, 260.0 320.5 C 209.1 320.2, 149.3 287.5, 109.1 262.4 C 68.9 237.3, 19.8 201.5, 18.7 170.0 C 17.6 138.5, 62.3 95.4, 102.5 73.6 C 142.7 51.8, 204.2 41.4, 260.0 39.4 Z',
  'M 260.0 20.9 C 313.0 21.9, 373.2 50.8, 414.2 75.6 C 455.2 100.5, 503.7 137.2, 505.9 170.0 C 508.1 202.8, 468.3 251.1, 427.3 272.4 C 386.3 293.7, 318.5 296.1, 260.0 297.8 C 201.5 299.5, 113.4 303.8, 76.3 282.5 C 39.1 261.2, 34.0 205.5, 37.3 170.0 C 40.6 134.5, 58.8 94.4, 96.0 69.6 C 133.1 44.7, 207.0 19.9, 260.0 20.9 Z',
  'M 260.0 36.5 C 317.4 34.2, 405.8 35.3, 443.7 57.5 C 481.6 79.8, 489.3 133.7, 487.4 170.0 C 485.4 206.3, 470.1 249.9, 432.3 275.4 C 394.4 301.0, 313.9 325.5, 260.0 323.4 C 206.1 321.2, 150.1 287.9, 109.1 262.4 C 68.1 236.8, 15.7 201.8, 14.1 170.0 C 12.4 138.2, 58.2 93.8, 99.2 71.6 C 140.2 49.4, 202.6 38.9, 260.0 36.5 Z',
] as const;

/** 形变序列：首尾相接，SMIL 在相邻两套之间做样条插值，没有跳变。 */
const MORPH_VALUES = [...BLOB_PATHS, BLOB_PATHS[0]].join('; ');
const MORPH_SPLINES = '0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1';

/** 供 CSS `mask-image` 用的静态轮廓：比 SVG 的形状略小一圈，边缘误差藏进描边里。 */
const VEIL_MASK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 340"><path d="M 260.0 11.0 C 314.7 13.6, 372.3 51.1, 410.9 77.6 C 449.6 104.1, 486.0 135.5, 492.0 170.0 C 498.0 204.5, 485.7 263.2, 447.0 284.5 C 408.3 305.8, 319.1 299.8, 260.0 297.8 C 200.9 295.8, 128.2 293.7, 92.7 272.4 C 57.1 251.1, 48.2 205.1, 46.6 170.0 C 44.9 134.9, 47.3 88.1, 82.8 61.6 C 118.4 35.1, 205.3 8.3, 260.0 11.0 Z" fill="#fff" transform="translate(260 170) scale(0.965) translate(-260 -170)"/></svg>`;
const VEIL_MASK_URL = `url("data:image/svg+xml,${encodeURIComponent(VEIL_MASK_SVG)}")`;

/**
 * 中央的液态玻璃气泡（仅桌面端渲染，CSS 控制显隐）。
 *
 * 动画全部交给 SVG：
 * - 形变是 `<animate attributeName="d">`，四套形状 12s 循环，样条插值，
 *   用户看到的是边缘一直在缓慢起伏，而不是「几秒换一个姿势」；
 * - 虹彩是 `linearGradient` 的 `gradientTransform` 在转，颜色沿着轮廓流动；
 * - 液态扰动是 feTurbulence + feDisplacementMap，扰动强度 6→10→6 缓慢呼吸。
 * 没有任何 JS 定时器在改 DOM。
 *
 * `prefers-reduced-motion` 下不渲染任何 `<animate>`，气泡停在第一套形状。
 */
export function LiquidBubble() {
  const reduceMotion = useReducedMotion();

  const morph = reduceMotion ? null : (
    <animate
      attributeName="d"
      dur="12s"
      repeatCount="indefinite"
      calcMode="spline"
      keyTimes="0; 0.25; 0.5; 0.75; 1"
      keySplines={MORPH_SPLINES}
      values={MORPH_VALUES}
    />
  );

  return (
    <>
      {/* 背景模糊层：按静态轮廓裁剪，比 SVG 的形状略小一圈，误差藏进描边里 */}
      <span
        aria-hidden="true"
        className="mb-bubble-veil"
        style={{ '--blob-mask': VEIL_MASK_URL } as BlobVars}
      />

      <svg
        className="mb-blob"
        viewBox="0 0 520 340"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {/* 泡内：乳白向淡紫过渡，透明度压得很低，中间基本是空的 */}
          <radialGradient id="blob-fill" cx="42%" cy="34%" r="72%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
            <stop offset="46%" stopColor="#f4effb" stopOpacity="0.16" />
            <stop offset="78%" stopColor="#cfc2ee" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#cfc2ee" stopOpacity="0.16" />
          </radialGradient>

          {/*
           * 虹彩边缘：粉 → 薰衣草 → 蓝 → 青 → 奶油黄，沿轮廓自然过渡。
           * gradientTransform 在转，颜色于是沿着边缘慢慢流。
           */}
          <linearGradient
            id="blob-irid"
            gradientUnits="userSpaceOnUse"
            x1="40"
            y1="60"
            x2="480"
            y2="290"
          >
            <stop offset="0%" stopColor="#ffe0b0" />
            <stop offset="14%" stopColor="#ffce9a" />
            <stop offset="28%" stopColor="#ffa8cf" />
            <stop offset="42%" stopColor="#c9a2f8" />
            <stop offset="56%" stopColor="#8fbdf6" />
            <stop offset="70%" stopColor="#7fd4f0" />
            <stop offset="84%" stopColor="#8eeccb" />
            <stop offset="100%" stopColor="#ffe0b0" />
            {!reduceMotion && (
              <animateTransform
                attributeName="gradientTransform"
                type="rotate"
                from="0 260 170"
                to="360 260 170"
                dur="26s"
                repeatCount="indefinite"
              />
            )}
          </linearGradient>

          {/* 镜面高光：只有一小段是白的，转起来就是边缘上游走的一道光 */}
          <linearGradient
            id="blob-spec"
            gradientUnits="userSpaceOnUse"
            x1="40"
            y1="60"
            x2="480"
            y2="290"
          >
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="16%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="30%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="62%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="76%" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            {!reduceMotion && (
              <animateTransform
                attributeName="gradientTransform"
                type="rotate"
                from="360 260 170"
                to="0 260 170"
                dur="18s"
                repeatCount="indefinite"
              />
            )}
          </linearGradient>

          {/* 泡内的粉色与紫色光斑 */}
          <filter id="blob-soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="18" />
          </filter>

          {/* 液态边缘：低频噪声把整条轮廓往各个方向推一点点，强度缓慢呼吸 */}
          <filter id="blob-liquid" x="-12%" y="-12%" width="124%" height="124%">
            <feTurbulence type="fractalNoise" baseFrequency="0.011 0.015" numOctaves="2" seed="11" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G">
              {!reduceMotion && (
                <animate attributeName="scale" values="6;11;6" dur="9s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" keyTimes="0; 0.5; 1" />
              )}
            </feDisplacementMap>
          </filter>

          {/* 虹彩外圈先糊一道，让颜色像渗进玻璃里，而不是浮在表面 */}
          <filter id="blob-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4.5" />
          </filter>
        </defs>

        <g filter="url(#blob-liquid)">
          <path d={BLOB_PATHS[0]} fill="url(#blob-fill)">
            {morph}
          </path>

          {/* 泡内的两团柔光：粉色在左上，紫色在右下 */}
          <g filter="url(#blob-soft)" opacity="0.5">
            <ellipse cx="180" cy="120" rx="88" ry="56" fill="#ffd7e6" opacity="0.34" />
            <ellipse cx="345" cy="215" rx="96" ry="60" fill="#cdb4f4" opacity="0.3" />
          </g>

          {/* 虹彩晕：粗一点、糊一点，垫在细线下面 */}
          <path
            d={BLOB_PATHS[0]}
            fill="none"
            stroke="url(#blob-irid)"
            strokeWidth="9"
            strokeOpacity="0.6"
            filter="url(#blob-glow)"
          >
            {morph}
          </path>

          {/* 虹彩细线：真正的「泡壁」，2px，清晰但不过亮 */}
          <path
            d={BLOB_PATHS[0]}
            fill="none"
            stroke="url(#blob-irid)"
            strokeWidth="2.4"
            strokeOpacity="0.92"
          >
            {morph}
          </path>

          {/* 镜面高光：在虹彩之上走的一道白 */}
          <path
            d={BLOB_PATHS[0]}
            fill="none"
            stroke="url(#blob-spec)"
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            {morph}
          </path>
        </g>
      </svg>
    </>
  );
}
