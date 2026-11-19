/**
 * 拥抱图标（自绘）。
 *
 * 为什么不用 lucide 的 `Heart`：一颗心的意思是「喜欢」，不是「抱一下」。
 * 这里画的是「从背后环过来的两条胳膊 + 中间那颗心」—— 两条弧线是手臂，
 * 末端的小圆是手，缩在中间的心才是被抱住的东西。
 *
 * 尺寸沿用原来的 13px 视口（`size` 默认 13），strokeWidth 也保持同一档，
 * 所以按钮的行高、间距都不会因为换图而变。全部用 `currentColor`，
 * 跟随外层的已抱 / 未抱配色。
 */
export function HugIcon({
  size = 13,
  strokeWidth = 1.7,
  filled = false,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  /** 抱过之后把中间那颗心填实（与原来「心填满」的反馈一致） */
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/*
        两条手臂：从下方伸出去、在心的两侧向上收，末端是手掌。
        之前是「两个大括号一样的弧线」，在 13px 下会被读成一个圆环；
        也不能张得太开，开口比心宽太多时小尺寸只剩两个括号。
        这里起点压在心上沿附近（y≈13.4），末端收在心的下缘外侧。
      */}
      <path
        d="M4.9 13.4c-.9 2.5-.3 5.4 1.5 7.1 1 .9 2.2 1.4 3.4 1.6"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M19.1 13.4c.9 2.5.3 5.4-1.5 7.1-1 .9-2.2 1.4-3.4 1.6"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />

      {/* 两只手：向里收一下，正好托在心的下缘 */}
      <path
        d="M9.4 22.1c-1.1-.1-2-.8-2.5-1.8"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M14.6 22.1c1.1-.1 2-.8 2.5-1.8"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.9"
      />

      {/* 中间那颗心：被抱住的东西。心填实 = 已经抱过 */}
      <path
        d="M12 15c-2.2-1.6-3.4-2.8-3.4-4.2 0-1.1.9-2 2-2 .6 0 1.1.3 1.4.8.3-.5.8-.8 1.4-.8 1.1 0 2 .9 2 2 0 1.4-1.2 2.6-3.4 4.2Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}
