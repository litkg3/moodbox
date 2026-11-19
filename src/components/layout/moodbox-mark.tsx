/**
 * 站标图形：一只粉色、盖子半掀着的长方体小盒子。
 *
 * 照用户给的那只粉盒来：薄纸板、浅粉、盖子上掀（不是全打开），
 * 盒口里塞着一排小纸条 —— 一张纸一种心情。
 *
 * 画法：正交等轴测（2:1 斜度），不用透视 —— 透视在 20px 下会歪。
 * 长 72 / 宽 44 / 高 40，长明显大于宽，看过去是只能装东西的长盒而不是骰子。
 * 所有顶点都由 L / W / H 与盖角推出来，改比例只改这四个数。
 *
 * 盖子铰在**远侧那条长边**上（72 那条），掀过竖直往后仰 10°：
 * 盖板宽度横跨整个盒口，一眼就能看出"长盒 + 长边翻盖"；
 * 之前铰在短边上，盖板立在侧面，像贴了一块小板子。
 * 盖子要画在盒身**之前** —— 它立在盒口后沿，下半截本来就该被盒口挡住。
 *
 * 三个可见面各一档粉，只靠明暗分面；不加描边 —— 小尺寸下描边先糊。
 */
import { useId } from "react";

interface MoodBoxMarkProps {
  className?: string;
}

/** 尺寸（等轴测单位）。改这三个数，整只盒子跟着变。 */
const L = 72;
const W = 44;
const H = 40;

/** 等轴测两个水平轴：E1 沿长边向右后，E2 沿宽边向左后，斜率都是 1:2。 */
const E1 = [0.8944, -0.4472] as const;
const E2 = [-0.8944, -0.4472] as const;

/** 最近的底角，整只盒子从这里长出去。 */
const O = [84, 176] as const;

/** 盒子局部坐标：i 沿长、j 沿宽、k 向上。 */
const at = (i: number, j: number, k: number): [number, number] => [
  O[0] + i * L * E1[0] + j * W * E2[0],
  O[1] + i * L * E1[1] + j * W * E2[1] - k * H,
];

const FL = at(0, 0, 0);
const FR = at(1, 0, 0);
const BR = at(1, 1, 0);
const tFL = at(0, 0, 1);
const tFR = at(1, 0, 1);
const tBR = at(1, 1, 1);
const tBL = at(0, 1, 1);

/**
 * 盖子：以远侧长边 tBL→tBR 为铰链，掀过竖直、往后仰 10°（100°）—— 这才叫半掀。
 * 掀起的位移 = 宽 ×（cosθ 沿近侧水平方向 + sinθ 沿垂直向上）。
 */
const LID_ANGLE = (100 * Math.PI) / 180;
const LID_DX = W * Math.cos(LID_ANGLE) * -E2[0];
const LID_DY = W * Math.cos(LID_ANGLE) * -E2[1] - W * Math.sin(LID_ANGLE);
const lidA: [number, number] = [tBL[0] + LID_DX, tBL[1] + LID_DY];
const lidB: [number, number] = [tBR[0] + LID_DX, tBR[1] + LID_DY];

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
          <stop offset="0" stopColor="#FDE3EE" />
          <stop offset="1" stopColor="#F5B8D0" />
        </linearGradient>
        <linearGradient id={g("right")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBD8E5" />
          <stop offset="1" stopColor="#EFA9C2" />
        </linearGradient>
        <linearGradient id={g("in")} x1="0.1" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#CE7FA0" />
          <stop offset="1" stopColor="#E8A6C2" />
        </linearGradient>
        <linearGradient id={g("lid")} x1="0.1" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#FDE6F1" />
          <stop offset="1" stopColor="#F6BCD3" />
        </linearGradient>
      </defs>

      {/*
        整体缩到 82% 并上移：等轴测盒子的外接框是斜的，不缩盖顶会顶到画框；
        盖子改到长边之后盒身变矮变宽，重心偏下，所以多抬一点。
      */}
      <g transform="translate(100 100) scale(0.86) translate(-100 -100) translate(0 -14)">
        {/* 落地影子：贴着盒子底边拉长一点，盒子才站得住 */}
        <ellipse
          cx="98"
          cy="180"
          rx="40"
          ry="5.6"
          fill="#C0718F"
          opacity="0.15"
        />

        {/*
        盖子先画，盒身压在上面 —— 盖子是立在盒口后沿的，下半截本来就该
        被盒口挡住。顺序反了的话，盖板整片浮在盒口之上，看着就像搭了张纸。
        顶上那条 3.4 的深边是纸板厚度，别省。
        */}
        <path
          d={poly(lidA, lidB, [lidB[0], lidB[1] - 3.4], [lidA[0], lidA[1] - 3.4])}
          fill="#F5B9D0"
          opacity="0.85"
        />
        <path d={poly(tBL, tBR, lidB, lidA)} fill={`url(#${g("lid")})`} />
        <path
          d={poly(tBL, tBR, lidB, lidA)}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.7"
          strokeLinejoin="round"
          opacity="0.72"
        />
        {/* 盒身：左前壁 / 右前壁 / 盒口内壁 —— 三面都是粉，只差明度 */}
        <path d={poly(FL, FR, tFR, tFL)} fill={`url(#${g("left")})`} />
        <path d={poly(FR, BR, tBR, tFR)} fill={`url(#${g("right")})`} />
        <path d={poly(tFL, tFR, tBR, tBL)} fill={`url(#${g("in")})`} />

        {/* 折痕：盖子根压住盒口后沿的那道暗，缺了它盖子和盒口是"拼接"的 */}
        <path
          d={`M${pt(tBL)}L${pt(tBR)}`}
          stroke="#B96A8B"
          strokeWidth="2.6"
          strokeLinecap="round"
          opacity="0.18"
        />

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

      </g>
    </svg>
  );
}
