'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { ClearDataDialog } from '@/components/layout/clear-data-dialog';

const ClearDataContext = createContext<() => void>(() => undefined);

/**
 * 「清空数据」是一个动作而不是页面。
 *
 * 它的触发点有两处（桌面端底部导航、移动端顶部轨道），
 * 所以用一个很小的 context 把弹层放在布局层，
 * 避免在两处各挂一份 Dialog 实例。
 */
export function ClearDataProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const requestClear = useMemo(() => () => setOpen(true), []);

  return (
    <ClearDataContext.Provider value={requestClear}>
      {children}
      <ClearDataDialog open={open} onClose={() => setOpen(false)} />
    </ClearDataContext.Provider>
  );
}

export function useClearData(): () => void {
  return useContext(ClearDataContext);
}
