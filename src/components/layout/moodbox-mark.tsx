/**
 * 站标图形：一只卡通小盒子。
 *
 * 以前这里是一颗玻璃球，和页面里的情绪球撞了形象 —— 球是「情绪」，
 * 盒子才是「盒子」。所以换成带盖的纸盒：浅紫渐变、圆角、两只小眼睛，
 * 32px 下也能认出是个盒子而不是一坨色块（眼睛给了它拟人的落点）。
 *
 * 用 SVG 而不是拼 div：盖子、盒身、缝、眼睛都是精确坐标，
 * 放大到 64 或缩到 20 都不会错位。
 */
import { useId } from 'react';

interface MoodBoxMarkProps {
  className?: string;
}

export function MoodBoxMark({ className }: MoodBoxMarkProps) {
  // 渐变 id 不能写死：同一页里可能出现多处站标（页头 + 页脚），
  // 重复 id 会让后出现的图形引用到前一个的渐变。
  const uid = useId().replace(/:/g, '');
  const lid = `mb-lid-${uid}`;
  const body = `mb-body-${uid}`;

  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="presentation"
      focusable="false"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={lid} x1="0.2" y1="0" x2="0.55" y2="1">
          <stop offset="0" stopColor="#FCF9FF" />
          <stop offset="1" stopColor="#DCCBF3" />
        </linearGradient>
        <linearGradient id={body} x1="0.12" y1="0" x2="0.82" y2="1">
          <stop offset="0" stopColor="#F5EEFD" />
          <stop offset="0.52" stopColor="#DDCCF3" />
          <stop offset="1" stopColor="#BFA6E4" />
        </linearGradient>
      </defs>

      {/* 落地的一点影子，让盒子不像贴在玻璃上 */}
      <ellipse cx="16" cy="29.1" rx="7.6" ry="1.7" fill="#8E76B8" opacity="0.16" />

      {/* 盒身 */}
      <rect x="5.4" y="13.4" width="21.2" height="14.8" rx="3.6" fill={`url(#${body})`} />

      {/* 盖子：比盒身宽一圈，卡通盒子靠这一圈「宽出来的边」显得憨 */}
      <rect x="3" y="7.9" width="26" height="7.6" rx="2.8" fill={`url(#${lid})`} />

      {/* 盖沿与盒身之间那道缝 */}
      <path
        d="M4.6 15.2h22.8"
        stroke="#A98FD2"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.4"
      />

      {/* 盖子上的高光 */}
      <path
        d="M6.4 10.3c2.6-1.1 6.4-1.3 8.6-0.9"
        stroke="#FFFFFF"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* 盒身左侧的高光，跟球体的受光方向一致 */}
      <path
        d="M8.4 17.6c0.8-0.8 1.9-1.2 2.6-1.3"
        stroke="#FFFFFF"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* 两只眼睛 + 一张小嘴：盒子的「卡通」全靠这三笔 */}
      <g fill="#6C5694" opacity="0.72">
        <circle cx="12.4" cy="20.6" r="1.5" />
        <circle cx="19.6" cy="20.6" r="1.5" />
      </g>
      <g fill="#FFFFFF" opacity="0.9">
        <circle cx="11.9" cy="20.1" r="0.5" />
        <circle cx="19.1" cy="20.1" r="0.5" />
      </g>
      <path
        d="M14.7 23.9c0.9 0.75 1.7 0.75 2.6 0"
        stroke="#6C5694"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );
}
