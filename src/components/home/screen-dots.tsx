'use client';

import { cn } from '@/lib/utils';

export interface ScreenNavItem {
  id: string;
  label: string;
}

/**
 * 右侧圆点导航（只在桌面端出现）。
 *
 * 点击走 scrollIntoView({ behavior: 'smooth' })，位置由 CSS 吸附点决定，
 * 不自己算偏移 —— 页面结构一改（加一屏、换一屏高度），这里不用动。
 *
 * 转盘卡片打开时整组淡出：卡片就浮在右侧，两颗东西叠在一起谁都看不清。
 * 用 :has 交给 CSS 判断，省得把转盘状态提到首页再传下来。
 */
export function ScreenDots({
  items,
  active,
  onSelect,
}: {
  items: readonly ScreenNavItem[];
  active: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="首页分屏导航" className="mb-screen-nav">
      <ol>
        {items.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-label={`前往${item.label}`}
              aria-current={index === active ? 'true' : undefined}
              className={cn('mb-screen-dot', index === active && 'is-active')}
            >
              <span aria-hidden="true" />
              <em>{item.label}</em>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
