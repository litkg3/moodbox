/**
 * 站标图形：一只粉色、开着盖的小方盒。
 *
 * 形象上要「打开」：盖子向后掀起来，盒口露出来 ——
 * 情绪盒子做的事就是「把情绪放进去，也可以再拿出来看」，合上的盒子说不出这件事。
 *
 * 画法：等轴测（isometric），不用透视 —— 透视在 20px 下会歪，
 * 等轴测缩到 20px 仍然是个清楚的方盒。盒身是两个侧面 + 一个菱形顶面（盒口内壁），
 * 盖板最后画、下沿压在盒口上：不遮住盒子，又明确「盖是掀开的」。
 * 三个可见面各给一档粉深浅，只靠明度差立体，不加描边 —— 小尺寸下描边先糊。
 */
import { useId } from 'react';

interface MoodBoxMarkProps {
  className?: string;
}

export function MoodBoxMark({ className }: MoodBoxMarkProps) {
  // 渐变 id 不能写死：同一页里可能出现多处站标（页头 + 页脚），
  // 重复 id 会让后出现的图形引用到前一个的渐变。
  const uid = useId().replace(/:/g, '');
  const lidInner = `mb-lid-inner-${uid}`;
  const left = `mb-left-${uid}`;
  const right = `mb-right-${uid}`;
  const inner = `mb-inner-${uid}`;

  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="presentation"
      focusable="false"
      aria-hidden="true"
    >
      <defs>
        {/* 三个可见面各一档粉：盖板最浅、左前壁次之、右前壁最深，盒口内壁压在最深一档 */}
        <linearGradient id={left} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#FBD5E4" />
          <stop offset="1" stopColor="#F0AEC8" />
        </linearGradient>
        <linearGradient id={right} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E68FB2" />
          <stop offset="1" stopColor="#CE7099" />
        </linearGradient>
        <linearGradient id={inner} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#DF85AA" />
          <stop offset="1" stopColor="#F0AECB" />
        </linearGradient>
        <linearGradient id={lidInner} x1="0.15" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#FDE0EC" />
          <stop offset="1" stopColor="#F5B3CD" />
        </linearGradient>
      </defs>

      {/* 落地的一点影子 */}
      <ellipse cx="16" cy="29.2" rx="8.2" ry="1.7" fill="#C0718F" opacity="0.18" />

      {/* 盒身：左前壁、右前壁、盒口（菱形顶面，颜色最深，暗示里面是空的） */}
      <path d="M4.6 17.4 16 22.7v6.2L4.6 23.6Z" fill={`url(#${left})`} />
      <path d="M16 22.7l11.4-5.3v6.2L16 28.9Z" fill={`url(#${right})`} />
      <path d="M4.6 17.4 16 12.1l11.4 5.3L16 22.7Z" fill={`url(#${inner})`} />

      {/* 盒口前沿的亮边：一条细线，盒子立刻显得「薄」 */}
      <path
        d="M4.6 17.4 16 22.68l11.4-5.28"
        stroke="#FFFFFF"
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.6"
        fill="none"
      />
      {/* 前面那条竖棱：一条更细的亮线，两个侧面就分得开 */}
      <path d="M16 22.9v5.7" stroke="#FFFFFF" strokeWidth="0.55" strokeLinecap="round" opacity="0.4" />

      {/*
        掀起的盖子：一块带圆角的薄板，下沿落在盒口后沿（4.6,17.4 → 16,12.1 → 20.1,14.0），
        向后上方斜倚。用圆角折线收口，不用两条直边拼尖角 —— 尖角看着像漏斗。
        盖板比盒口浅一档、不描边，才像「在盒子后面」而不是一张贴纸。
      */}
      <path
        d="M4.9 17.1 15.9 11.7l4.2 2L17.9 4.9c-.2-.8-1.2-1.1-1.9-.6L6.1 11.6c-1.1.7-1.6 2.1-1.3 3.4.1.7.6 1.4 1.3 1.7Z"
        fill={`url(#${lidInner})`}
      />
      {/* 盖板内侧的一道浅影：贴着盒口的地方暗一点，纸板才有厚度 */}
      <path
        d="M5.6 16.4 15.9 11.4l3.4 1.6-.2-1.1-3.2-1.5-9.9 5.1c-.8.4-1.2 1.4-1 2.3.4-.7 1-1.1 1.6-1.4Z"
        fill="#DE8FB3"
        opacity="0.45"
      />

    </svg>
  );
}
