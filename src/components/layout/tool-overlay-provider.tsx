'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { JarOverlay } from '@/components/jar/jar-overlay';
import { LettersOverlay } from '@/components/letters/letters-overlay';

/** 可以在主页之上直接打开卡片的功能（不走路由）。 */
export type OverlayTool = 'jar' | 'letters';

interface ToolOverlayContextValue {
  activeTool: OverlayTool | null;
  openTool: (tool: OverlayTool) => void;
  closeTool: () => void;
}

const ToolOverlayContext = createContext<ToolOverlayContextValue | null>(null);

/**
 * 「卡片式功能」的宿主。
 *
 * 开心罐和心事信箱原来是两个独立页面，现在都在这里打开：
 * 导航只负责调用 openTool，卡片自己管数据。
 * 挂在根布局上，所以任何页面（比如情绪足迹里点「补记一件开心事」）
 * 都能把罐子叫出来，而不是跳走。
 */
export function ToolOverlayProvider({ children }: { children: ReactNode }) {
  const [activeTool, setActiveTool] = useState<OverlayTool | null>(null);

  const openTool = useCallback((tool: OverlayTool) => setActiveTool(tool), []);
  const closeTool = useCallback(() => setActiveTool(null), []);

  const value = useMemo(
    () => ({ activeTool, openTool, closeTool }),
    [activeTool, openTool, closeTool],
  );

  return (
    <ToolOverlayContext.Provider value={value}>
      {children}
      <JarOverlay open={activeTool === 'jar'} onClose={closeTool} />
      <LettersOverlay open={activeTool === 'letters'} onClose={closeTool} />
    </ToolOverlayContext.Provider>
  );
}

export function useToolOverlay(): ToolOverlayContextValue {
  const context = useContext(ToolOverlayContext);
  if (!context) {
    throw new Error('useToolOverlay 必须在 ToolOverlayProvider 内使用');
  }
  return context;
}
