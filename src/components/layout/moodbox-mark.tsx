/**
 * 站标图形：一只粉色、盖子半掀着的长方体小盒子。
 *
 * 照用户给的那只粉盒来：薄纸板、浅粉、盖子上掀（不是全打开），
 * 盒口里塞着一排小纸条 —— 一张纸一种心情。
 *
 * 画法：正交等轴测（2:1 斜度），不用透视 —— 透视在 20px 下会歪。
 * 顶点按"长 72 / 宽 44 / 高 40"算好后写成常量。长明显大于宽、宽大于高，
 * 所以看过去是一只能装东西的长盒，而不是一只骰子（之前那版就是太方了）。
 *
 * 三个可见面各一档粉，只靠明暗分面；不加描边 —— 小尺寸下描边先糊。
 */
import { useId } from "react";

interface MoodBoxMarkProps {
  className?: string;
}

/** 等轴测顶点（viewBox 200×200）。改比例请按 e1/e2/e3 重算整组，别单点微调。 */
const FL = [84, 176] as const;
const FR = [148.4, 143.8] as const;
const BR = [109, 124.1] as const;
const tFL = [84, 136] as const;
const tFR = [148.4, 103.8] as const;
const tBL = [44.6, 116.3] as const;
const tBR = [109, 84.1] as const;

/** 盖子：以盒口后沿 tFR→tBR 为铰链，向外上方张开 58°（半掀）。 */
const lid3 = [91.4, 43.8] as const;
const lid4 = [130.8, 63.5] as const;

const pt = (p: readonly number[]) => `${p[0]!.toFixed(1)} ${p[1]!.toFixed(1)}`;
const poly = (...pts: readonly (readonly number[])[]) =>
  `M${pts.map(pt).join("L")}Z`;

export function MoodBoxMark({ className }: MoodBoxMarkProps) {
  // 渐变 id 不能写死：同一页可能出现多处站标，重复 id 会互相抢引用
  const uid = useId().replace(/:/g, "");
  const g = (name: string) => `mb-${name}-${uid}`;

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="presentation"
      focusable="false"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={g("left")} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#FDDCE9" />
          <stop offset="1" stopColor="#F2AEC8" />
        </linearGradient>
        <linearGradient id={g("right")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EB95B6" />
          <stop offset="1" stopColor="#D1709A" />
        </linearGradient>
        <linearGradient id={g("in")} x1="0.1" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#C15F89" />
          <stop offset="1" stopColor="#E68FB2" />
        </linearGradient>
        <linearGradient id={g("lid")} x1="0.1" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#FFEDF5" />
          <stop offset="1" stopColor="#F9BFD6" />
        </linearGradient>
      </defs>

      {/*
        整体缩小到 78% 并上移：等轴测的盒子最宽的一条对角线本来就是斜的，
        不缩的话盖顶会顶到画框、底角也会贴边；缩完四周留边，页头里才不挤。
      */}
      <g transform="translate(100 100) scale(0.78) translate(-100 -100) translate(0 -6)">
        {/* 落地影子：贴着盒子底边拉长一点，盒子才站得住 */}
        <ellipse
          cx="98"
          cy="180"
          rx="40"
          ry="5.6"
          fill="#C0718F"
          opacity="0.15"
        />

        {/* 盒身：左前壁 / 右前壁 / 盒口内壁 */}
        <path d={poly(FL, FR, tFR, tFL)} fill={`url(#${g("left")})`} />
        <path d={poly(FR, BR, tBR, tFR)} fill={`url(#${g("right")})`} />
        <path d={poly(tFL, tFR, tBR, tBL)} fill={`url(#${g("in")})`} />

        {/*
        盒口里那一小片纸条：只画几笔平行细条，沿长边方向排开。
        纸条是参考图里最要紧的细节 —— 盒子里装的是"心情"，不是空的。
        四种浅色交替，像一叠不同心情的小纸片。
      */}
        <g opacity="0.95">
          {(
            [
              ["M47 118 103 90", "#FFE7B4"],
              ["M47 122 103 94", "#FFE7B4"],
              ["M52 123 108 95", "#CBEDDC"],
              ["M60 124 116 96", "#FBC7DC"],
              ["M70 124 126 96", "#FFEFC9"],
              ["M80 123 136 95", "#DDE9F7"],
            ] as const
          ).map(([d, c]) => (
            <path
              key={d}
              d={d}
              stroke={c}
              strokeWidth="3.4"
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* 盒口前沿与前面那条竖棱：两道细亮线，棱线立刻清楚 */}
        <path
          d={`M${pt(tFL)}L${pt(FL)}L${pt(FR)}L${pt(tFR)}`}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.7"
          strokeLinejoin="round"
          opacity="0.5"
        />

        {/* 正面的表情：两点眼睛 + 一点腮红。盒子一有表情，整套形象就立住了 */}
        <ellipse
          cx="90"
          cy="150"
          rx="6"
          ry="3.2"
          fill="#F07AA5"
          opacity="0.26"
        />
        <ellipse
          cx="98"
          cy="145"
          rx="2.6"
          ry="3.2"
          fill="#6B4A5C"
          opacity="0.82"
        />
        <ellipse
          cx="110"
          cy="139"
          rx="2.6"
          ry="3.2"
          fill="#6B4A5C"
          opacity="0.82"
        />
        <circle cx="97.2" cy="143.8" r="0.9" fill="#FFFFFF" />
        <circle cx="109.2" cy="137.8" r="0.9" fill="#FFFFFF" />

        {/* 盖子：半掀，从后沿翻起，浅一档 + 白边，才像一块纸板而不是贴纸 */}
        <path d={poly(tFR, tBR, lid3, lid4)} fill={`url(#${g("lid")})`} />
        <path
          d={poly(tFR, tBR, lid3, lid4)}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.7"
          strokeLinejoin="round"
          opacity="0.72"
        />
        {/* 铰链那一条：稍深，盖子与盒口才接得上 */}
        <path
          d={`M${pt(tFR)}L${pt(tBR)}`}
          stroke="#DE8FB4"
          strokeWidth="1.3"
          strokeLinecap="round"
          opacity="0.4"
        />
      </g>
    </svg>
  );
}
