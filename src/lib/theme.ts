/**
 * 主题（白日 / 星空）。
 *
 * 设计要点：
 * 1. 主题只影响 `<html data-theme>`，所有颜色都由 CSS 变量派生，
 *    因此切换主题不会导致任何 React 重渲染，也不会触发水合不一致；
 * 2. 首帧由 `layout.tsx` 里的内联脚本写入，避免「先白一下再变暗」的闪屏；
 * 3. 用户可以选择「跟随系统」，此时监听 `prefers-color-scheme` 变化。
 */

export const THEME_STORAGE_KEY = 'moodbox-theme';

export type ThemeMode = 'day' | 'night';
/** 用户偏好：显式指定，或交给系统 */
export type ThemePreference = 'auto' | ThemeMode;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'auto';

export const THEME_COLORS: Record<ThemeMode, string> = {
  day: '#fbf7f3',
  night: '#0a0917',
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'day' || value === 'night';
}

export function normalizePreference(value: unknown): ThemePreference {
  if (value === 'auto' || value === 'day' || value === 'night') return value;
  return DEFAULT_THEME_PREFERENCE;
}

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return DEFAULT_THEME_PREFERENCE;
  try {
    return normalizePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    if (preference === 'auto') {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // 隐私模式下写入会抛错，此时只是不记住偏好，不影响使用
  }
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ThemeMode {
  if (preference === 'auto') return prefersDark ? 'night' : 'day';
  return preference;
}

/** 把主题写到文档上，并同步浏览器地址栏颜色。 */
export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
}

/**
 * 首帧前执行的内联脚本。放在 <head> 里，先于任何样式绘制，
 * 因此不会出现白底闪一下再切到星空的情况。
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var p=localStorage.getItem(k);if(p!=='day'&&p!=='night'){p=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'night':'day';}document.documentElement.dataset.theme=p;}catch(e){document.documentElement.dataset.theme='day';}})();`;
