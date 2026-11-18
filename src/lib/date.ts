import { format, isValid, parse } from 'date-fns';
import { zhCN } from 'date-fns/locale';

/** 记忆 / 情绪记录统一使用的日期键格式（本地时区，避免 UTC 偏移导致跨天）。 */
export const DATE_KEY_FORMAT = 'yyyy-MM-dd';

export function toDateKey(date: Date): string {
  return format(date, DATE_KEY_FORMAT);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

/** 解析 yyyy-MM-dd，非法输入返回 null（用于导入校验）。 */
export function parseDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const parsed = parse(key, DATE_KEY_FORMAT, new Date());
  if (!isValid(parsed)) return null;
  // 防止 2024-02-31 这类被自动进位的日期
  if (toDateKey(parsed) !== key) return null;
  return parsed;
}

export function isValidDateKey(key: string): boolean {
  return parseDateKey(key) !== null;
}

/** 2024年3月5日 */
export function formatFullDate(key: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  return format(date, 'yyyy年M月d日', { locale: zhCN });
}

/** 3月5日 周三 */
export function formatShortDate(key: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  return format(date, 'M月d日 EEE', { locale: zhCN });
}

/** 2024年3月 */
export function formatMonthTitle(date: Date): string {
  return format(date, 'yyyy年M月', { locale: zhCN });
}

/** 今天 / 昨天 / 3月5日 */
export function formatRelativeDay(key: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  const today = new Date();
  const todayKeyValue = toDateKey(today);
  if (key === todayKeyValue) return '今天';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (key === toDateKey(yesterday)) return '昨天';
  return format(date, 'M月d日', { locale: zhCN });
}

/** 记录时间：晚上 21:14 */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (!isValid(date)) return '';
  return format(date, "a hh:mm", { locale: zhCN }).replace('AM', '上午').replace('PM', '下午');
}

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;
