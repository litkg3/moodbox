/**
 * 拥抱图标（自绘）。
 *
 * 为什么不用 lucide 的 `Heart`：一颗心的意思是「喜欢」，不是「抱一下」。
 *
 * 造型：**两条手臂从左右两侧环过来，在心的下方交叉搂住**，两只手各自搭到
 * 对侧的前臂上 —— 这是「抱住」这个动作最有辨识度的轮廓，比「两侧各一段弧线」
 * 更容易在 13px 下被认出来。被抱住的那颗心压在手臂交叉点上方、靠中间偏上，
 * 露出来的部分足够大，不会糊成一团。
 *
 * 尺寸与视觉重量都按 13px 调过：手臂的竖段尽量直、转角尽量少，
 * 缩小后不会裂成几个孤立的笔画。全部用 `currentColor`，跟随外层已抱 / 未抱的配色。
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
      {/* 左臂：从左上伸下来，绕过心的外侧，小臂横到心的下方、掌心朝里 */}
      <path
        d="M3.3 7.4c-.9 4.3-.1 7.9 2.6 10 1.5 1.2 3.6 1.8 5.5 1.7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 右臂：与左臂镜像，两段小臂在心的正下方几乎接到一起 = 搂紧 */}
      <path
        d="M20.7 7.4c.9 4.3.1 7.9-2.6 10-1.5 1.2-3.6 1.8-5.5 1.7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 中间那颗心：被手臂从下方托住的东西。心填实 = 已经抱过 */}
      <path
        d="M12 15.2c-2.3-1.6-3.5-2.8-3.5-4.2 0-1.1.9-2 2-2 .6 0 1.1.3 1.5.8.4-.5.9-.8 1.5-.8 1.1 0 2 .9 2 2 0 1.4-1.2 2.6-3.5 4.2Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}
