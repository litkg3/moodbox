/**
 * 功能入口的唯一数据源。
 *
 * 桌面端顶部导航条、移动端「更多」面板都从这里读取。
 * `kind` 决定点击后发生什么：
 * - `route`   跳转到一个独立页面；
 * - `overlay` 在主页之上打开一张统一的毛玻璃卡片（不跳页）；
 * - `action`  页面内动作（如清空数据），不产生新界面。
 */

export type ToolKey =
  | 'chat'
  | 'jar'
  | 'letters'
  | 'calendar'
  | 'breathe'
  | 'quiz'
  | 'square'
  | 'about'
  | 'settings'
  | 'clear';

export type ToolKind = 'route' | 'overlay' | 'action';

export interface ToolItem {
  key: ToolKey;
  label: string;
  kind: ToolKind;
  /** kind 为 route 时的目标地址 */
  href?: string;
  /** 一句话说明，用于悬浮提示与「更多」面板 */
  hint: string;
}

export const TOOL_ITEMS: readonly ToolItem[] = [
  /*
   * 「AI 陪聊」排第一：它不是又一个工具，而是"不知道点哪儿时"的入口。
   * 桌面导航和手机「更多」都按这个顺序渲染。
   */
  { key: 'chat', label: 'AI 陪聊', kind: 'route', href: '/chat', hint: '说说话，有人在听' },
  { key: 'jar', label: '开心罐', kind: 'overlay', hint: '把开心的事叠成纸条，收进罐子里' },
  { key: 'letters', label: '心事信箱', kind: 'overlay', hint: '写下说不出口的事，封存或让它过去' },
  { key: 'calendar', label: '情绪足迹', kind: 'route', href: '/calendar', hint: '一个月里，你都经历了什么' },
  { key: 'breathe', label: '呼吸放松', kind: 'route', href: '/breathe', hint: '跟着圆环，慢慢呼吸几十秒' },
  { key: 'quiz', label: '情绪测试', kind: 'route', href: '/quiz', hint: '六个问题，看看此刻的你' },
  { key: 'square', label: '树洞广场', kind: 'route', href: '/square', hint: '小球装不下的时候，来这里说说' },
  { key: 'about', label: '关于', kind: 'route', href: '/about', hint: '这个盒子为什么存在' },
  /*
   * 「清空数据」原本和「关于」并排、同一个颜色，看起来像一个普通入口。
   * 现在它收进设置面板，用危险色单独摆在一栏，还要再确认一次。
   */
  { key: 'settings', label: '设置', kind: 'action', hint: '主题、音乐与数据' },
] as const;

/**
 * 「更多」面板的分区。
 *
 * 手机屏幕只有那么高，九项平铺会变成一张密密麻麻的表格。所以按
 * 「常来 → 偶尔 → 这里」分三层：常用项在上，关于/设置在下方次级区，
 * AI 陪聊单独拎出来当主入口（它同时还是页头那颗实心按钮）。
 */
export const MORE_MENU_PRIMARY: readonly ToolKey[] = ['chat'] as const;
export const MORE_MENU_COMMON: readonly ToolKey[] = [
  'breathe',
  'quiz',
  'square',
  'jar',
  'letters',
  'calendar',
] as const;
export const MORE_MENU_SECONDARY: readonly ToolKey[] = ['about', 'settings'] as const;

export const ALL_TOOLS: readonly ToolItem[] = TOOL_ITEMS;

/** 顶部导航条里真正的页面入口（不含「清空数据」这类动作）。 */
export const NAV_TOOLS: readonly ToolItem[] = TOOL_ITEMS.filter((tool) => tool.kind !== 'action');

export function findTool(key: ToolKey): ToolItem | undefined {
  return TOOL_ITEMS.find((tool) => tool.key === key);
}
