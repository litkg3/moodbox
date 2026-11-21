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
/**
 * 24 小时制的时间，例如 23:07。
 *
 * 不补前导零（9:05 而不是 09:05）—— 论坛类的时间戳读起来更轻，
 * 也不用再区分「上午/下午」。
 */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (!isValid(date)) return '';
  return format(date, 'H:mm', { locale: zhCN });
}

/**
 * 帖子、回复、信的落款：今天 23:07 / 昨天 21:14 / 11月20日 09:12。
 *
 * 这里不能用 `iso.slice(0, 10)` 当日：ISO 串的前十位是 UTC 日期。
 * 东八区凌晨 0–8 点发的内容，UTC 还停在昨天，于是当天刚发的帖子
 * 会显示成「昨天」—— 这正是广场上那个时间错乱。
 */
export function formatDayClock(iso: string): string {
  const date = new Date(iso);
  if (!isValid(date)) return '';
  return `${formatRelativeDay(toDateKey(date))} ${format(date, 'H:mm', { locale: zhCN })}`;
}

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;
