'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
  writeThemePreference,
  type ThemeMode,
  type ThemePreference,
} from '@/lib/theme';

interface ThemeController {
  /** 当前实际生效的主题 */
  theme: ThemeMode;
  /** 用户的偏好（含「跟随系统」） */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** 在白日 / 星空之间切换，并把偏好固定下来 */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeController | null>(null);

/**
 * 主题控制器。
 *
 * 注意：视觉切换完全由 `html[data-theme]` 驱动，本组件只负责
 * 「读写偏好」和「跟随系统」的监听，不参与任何样式渲染，
 * 因此主题变化不会引起整棵树的重新渲染。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('auto');
  const [prefersDark, setPrefersDark] = useState(false);
  // 每分钟走一次，用来在 22:00 / 05:00 两个整点自动切主题
  const [now, setNow] = useState(() => new Date());

  // 挂载后读取真实偏好（首帧由内联脚本处理，这里只是把状态对齐）
  useEffect(() => {
    setPreferenceState(readThemePreference());
    setPrefersDark(systemPrefersDark());
    setNow(new Date());
  }, []);

  // 跨过夜间时段的边界时，页面要自己换过去，不能等用户手动点
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  // 监听系统主题变化：只有在「跟随系统」时才真正影响页面
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const theme = resolveTheme(preference, prefersDark, now);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeThemePreference(next);
  }, []);

  const toggle = useCallback(() => {
    // 以当前生效的主题为基准取反，而不是读偏好，
    // 否则「跟随系统 = 星空」时点一下会看起来没反应。
    setPreference(theme === 'night' ? 'day' : 'night');
  }, [setPreference, theme]);

  const value = useMemo<ThemeController>(
    () => ({ theme, preference, setPreference, toggle }),
    [theme, preference, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeController {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme 必须在 ThemeProvider 内使用。');
  return context;
}
