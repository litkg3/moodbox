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
  'M 260.0 22.0 C 314.7 22.1, 383.3 42.3, 423.7 66.9 C 464.0 91.6, 501.8 135.5, 502.1 170.0 C 502.3 204.5, 465.7 249.0, 425.3 274.1 C 385.0 299.3, 314.7 321.2, 260.0 321.0 C 205.3 320.7, 136.9 297.7, 97.2 272.6 C 57.4 247.4, 21.8 204.4, 21.5 170.0 C 21.2 135.6, 55.7 91.1, 95.5 66.4 C 135.2 41.7, 205.3 21.9, 260.0 22.0 Z',
  'M 260.0 19.0 C 315.9 19.0, 389.3 39.1, 427.8 64.3 C 466.4 89.5, 490.9 134.4, 491.5 170.0 C 492.0 205.6, 469.7 253.4, 431.2 277.8 C 392.6 302.2, 316.8 316.7, 260.0 316.5 C 203.2 316.3, 128.9 301.2, 90.5 276.7 C 52.1 252.3, 29.4 205.4, 29.7 170.0 C 30.0 134.6, 53.8 89.5, 92.2 64.3 C 130.6 39.1, 204.1 19.0, 260.0 19.0 Z',
  'M 260.0 23.5 C 316.2 23.0, 391.6 37.8, 431.2 62.2 C 470.7 86.6, 498.6 134.9, 497.4 170.0 C 496.1 205.1, 463.2 248.0, 423.7 273.1 C 384.1 298.1, 314.7 320.1, 260.0 320.2 C 205.3 320.3, 135.8 298.6, 95.5 273.6 C 55.1 248.6, 18.2 204.7, 17.9 170.0 C 17.7 135.3, 53.5 89.8, 93.8 65.3 C 134.2 40.9, 203.8 24.0, 260.0 23.5 Z',
  'M 260.0 19.8 C 315.5 20.2, 384.6 41.4, 424.5 66.4 C 464.5 91.4, 499.1 135.1, 499.7 170.0 C 500.3 204.9, 467.8 251.4, 427.8 275.7 C 387.9 300.0, 316.5 315.4, 260.0 315.8 C 203.5 316.1, 127.8 302.1, 88.8 277.8 C 49.9 253.5, 25.8 205.7, 26.2 170.0 C 26.6 134.3, 52.4 88.8, 91.3 63.8 C 130.3 38.7, 204.5 19.3, 260.0 19.8 Z',
] as const;

/** 形变序列：首尾相接，SMIL 在相邻两套之间做样条插值，没有跳变。 */
const MORPH_VALUES = [...BLOB_PATHS, BLOB_PATHS[0]].join('; ');
const MORPH_SPLINES = '0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1; 0.42 0 0.58 1';

/** 供 CSS `mask-image` 用的静态轮廓：比 SVG 的形状略小一圈，边缘误差藏进描边里。 */
const VEIL_MASK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 340"><path d="M 260.0 22.0 C 314.7 22.1, 383.3 42.3, 423.7 66.9 C 464.0 91.6, 501.8 135.5, 502.1 170.0 C 502.3 204.5, 465.7 249.0, 425.3 274.1 C 385.0 299.3, 314.7 321.2, 260.0 321.0 C 205.3 320.7, 136.9 297.7, 97.2 272.6 C 57.4 247.4, 21.8 204.4, 21.5 170.0 C 21.2 135.6, 55.7 91.1, 95.5 66.4 C 135.2 41.7, 205.3 21.9, 260.0 22.0 Z" fill="#fff" transform="translate(260 170) scale(0.965) translate(-260 -170)"/></svg>`;
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
      dur="13s"
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
                <animate attributeName="scale" values="3;6;3" dur="9s" repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" keyTimes="0; 0.5; 1" />
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
            strokeWidth="6"
            strokeOpacity="0.45"
            filter="url(#blob-glow)"
          >
            {morph}
          </path>

          {/* 虹彩细线：真正的「泡壁」，2px，清晰但不过亮 */}
          <path
            d={BLOB_PATHS[0]}
            fill="none"
            stroke="url(#blob-irid)"
            strokeWidth="1.8"
            strokeOpacity="0.8"
          >
            {morph}
          </path>

          {/* 镜面高光：在虹彩之上走的一道白 */}
          <path
            d={BLOB_PATHS[0]}
            fill="none"
            stroke="url(#blob-spec)"
            strokeWidth="2"
            strokeLinecap="round"
          >
            {morph}
          </path>
        </g>
      </svg>
    </>
  );
}
