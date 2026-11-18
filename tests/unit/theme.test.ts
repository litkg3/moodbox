import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_PREFERENCE,
  isNightHour,
  isThemeMode,
  normalizePreference,
  resolveTheme,
  THEME_COLORS,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from '@/lib/theme';

/** 白日时段（14:00），避免测试结果跟着跑测试的钟点变化 */
const DAYTIME = new Date(2026, 10, 18, 14, 0, 0);
/** 夜间时段（23:30） */
const NIGHTTIME = new Date(2026, 10, 18, 23, 30, 0);

describe('主题解析', () => {
  it('跟随系统时由 prefers-color-scheme 决定', () => {
    expect(resolveTheme('auto', true, DAYTIME)).toBe('night');
    expect(resolveTheme('auto', false, DAYTIME)).toBe('day');
  });

  it('22:00 – 次日 05:00 自动进入夜间，与系统是否为深色无关', () => {
    expect(isNightHour(new Date(2026, 10, 18, 22, 0, 0))).toBe(true);
    expect(isNightHour(new Date(2026, 10, 18, 23, 59, 0))).toBe(true);
    expect(isNightHour(new Date(2026, 10, 19, 0, 30, 0))).toBe(true);
    expect(isNightHour(new Date(2026, 10, 19, 4, 59, 0))).toBe(true);
    expect(isNightHour(new Date(2026, 10, 19, 5, 0, 0))).toBe(false);
    expect(isNightHour(new Date(2026, 10, 18, 21, 59, 0))).toBe(false);

    expect(resolveTheme('auto', false, NIGHTTIME)).toBe('night');
    expect(resolveTheme('auto', true, DAYTIME)).toBe('night');
  });

  it('手动锁定的主题不会被夜间时段覆盖', () => {
    expect(resolveTheme('day', false, NIGHTTIME)).toBe('day');
    expect(resolveTheme('night', false, DAYTIME)).toBe('night');
  });

  it('手动指定优先于系统偏好', () => {
    expect(resolveTheme('day', true, DAYTIME)).toBe('day');
    expect(resolveTheme('night', false, DAYTIME)).toBe('night');
  });

  it('非法值一律退回默认的「跟随系统」', () => {
    expect(normalizePreference('dark')).toBe(DEFAULT_THEME_PREFERENCE);
    expect(normalizePreference(null)).toBe(DEFAULT_THEME_PREFERENCE);
    expect(normalizePreference('day')).toBe('day');
    expect(DEFAULT_THEME_PREFERENCE).toBe('auto');
  });

  it('类型守卫只认 day / night', () => {
    expect(isThemeMode('day')).toBe(true);
    expect(isThemeMode('night')).toBe(true);
    expect(isThemeMode('auto')).toBe(false);
  });

  it('两套主题都有地址栏颜色，且深色明显更暗', () => {
    expect(THEME_COLORS.day).toMatch(/^#[0-9a-f]{6}$/i);
    expect(THEME_COLORS.night).toMatch(/^#[0-9a-f]{6}$/i);
    const luminance = (hex: string) => Number.parseInt(hex.slice(1, 3), 16);
    expect(luminance(THEME_COLORS.night)).toBeLessThan(luminance(THEME_COLORS.day));
  });

  it('首帧脚本自带兜底：读不到偏好时落到 day，不会白屏或无主题', () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT).toContain('prefers-color-scheme');
    expect(THEME_INIT_SCRIPT).toContain("dataset.theme='day'");
    // 时段判断必须在首帧就生效，否则夜间打开会先闪一下白日
    expect(THEME_INIT_SCRIPT).toContain('getHours()');
    expect(THEME_INIT_SCRIPT).toContain('h>=22||h<5');
  });
});
