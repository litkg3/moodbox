'use client';

import { useEffect } from 'react';

/**
 * 在客户端挂载完成后给 <html> 打一个标记。
 *
 * 用途：
 * 1. 端到端测试可以等到 React 真正接管再开始点击，避免“点了但页面还没水合”；
 * 2. 后续如需在首帧关闭入场动画（避免闪烁），也可以基于这个属性写 CSS。
 * 不渲染任何可见内容。
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
    return () => {
      delete document.documentElement.dataset.hydrated;
    };
  }, []);

  return null;
}
