'use client';

/**
 * 访客行为账本：发过几次、回过几次、今天改没改昵称。
 *
 * 为什么不能直接数列表里的帖子：
 *
 * 配额的原意是「今天最多发 3 条」。如果按列表里还剩几条来算，删掉一条就
 * 退一格 —— 发满三条、全删掉、再发三条，额度等于无限。所以必须另记一本
 * 只增不减的账：发出去的那一刻记一笔，删帖不动它。
 *
 * 账本按「访客 × 自然日」记，存在 localStorage 里。换设备会重新开始 ——
 * 这是本机模式固有的限度，云端由数据库函数统计。
 *
 * 为什么要按访客分行：同一台设备可能换上不同的人（共用电脑、演示时切身份），
 * 只按日期记的话，A 发满了 3 条，B 一进来也没额度了。
 *
 * ```json
 * {
 *   "2026-11-20": {
 *     "abc123": { "posts": 2, "replies": 5, "renames": 1 }
 *   }
 * }
 * ```
 */

import { NICKNAME_MAX, saveNickname } from '@/lib/nickname';
import { EMPTY_USAGE, dayKey, type QuotaKind, type QuotaUsage } from '@/lib/quota';

const STORAGE_KEY = 'moodbox:square-ledger:v1';

interface DayEntry {
  /** 今天发出去几条帖子（含已删除的） */
  posts?: number;
  /** 今天写出去几条回复（含已删除的） */
  replies?: number;
  /** 今天改过几次昵称 */
  renames?: number;
  /** 旧版账本里的布尔值：只要为 true 就算改过一次，读的时候兼容 */
  nickname?: boolean;
}

type Ledger = Record<string, Record<string, DayEntry>>;

/** 没拿到访客标识时用这一格：老调用方仍然能记账，只是不与任何身份关联 */
const ANON = '-';

/** 只留最近三天的记录：跨天之后昨天的账没用了，留着只会越滚越大。 */
const KEEP_DAYS = 3;

function readLedger(): Ledger {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Ledger;
  } catch {
    return {};
  }
}

function writeLedger(ledger: Ledger): void {
  if (typeof window === 'undefined') return;
  try {
    const keys = Object.keys(ledger).sort().reverse().slice(0, KEEP_DAYS);
    const trimmed: Ledger = {};
    for (const key of keys) trimmed[key] = ledger[key] ?? {};
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 无痕模式 / 存储已满：账记不上就别拦人，宁可这层失效
  }
}

function bump(visitorId: string | undefined, kind: QuotaKind): void {
  const today = dayKey();
  const ledger = readLedger();
  const row = ledger[today] ?? {};
  const entry = row[visitorId || ANON] ?? {};
  if (kind === 'post') entry.posts = (entry.posts ?? 0) + 1;
  else entry.replies = (entry.replies ?? 0) + 1;
  row[visitorId || ANON] = entry;
  ledger[today] = row;
  writeLedger(ledger);
}

/** 记一次发帖。 */
export function recordPost(visitorId?: string): void {
  bump(visitorId, 'post');
  notify();
}

/** 记一次回复。 */
export function recordReply(visitorId?: string): void {
  bump(visitorId, 'reply');
  notify();
}

/** 读某个访客今天的用量。不给访客就当匿名那一格。 */
export function readUsage(now: Date = new Date(), visitorId?: string): QuotaUsage {
  const raw = readLedger()[dayKey(now)]?.[visitorId || ANON];
  if (!raw) return { ...EMPTY_USAGE };
  const posts = Number.isFinite(raw.posts) ? Math.max(0, Math.floor(raw.posts ?? 0)) : 0;
  const replies = Number.isFinite(raw.replies) ? Math.max(0, Math.floor(raw.replies ?? 0)) : 0;
  return { posts, replies };
}

/** 一天最多能改几次昵称。 */
export const RENAMES_PER_DAY = 2;

/** 读某个访客今天改过几次昵称。兼容旧账本里的 `nickname: true`。 */
export function readRenameCount(now: Date = new Date(), visitorId?: string): number {
  const entry = readLedger()[dayKey(now)]?.[visitorId || ANON];
  if (!entry) return 0;
  const count = Number.isFinite(entry.renames) ? Math.max(0, Math.floor(entry.renames ?? 0)) : 0;
  return Math.max(count, entry.nickname ? 1 : 0);
}

/** 今天还能不能改昵称（一天两次）。 */
export function canRenameToday(now: Date = new Date(), visitorId?: string): boolean {
  return readRenameCount(now, visitorId) < RENAMES_PER_DAY;
}

/** 今天还剩几次改昵称的机会。 */
export function renamesLeftToday(now: Date = new Date(), visitorId?: string): number {
  return Math.max(0, RENAMES_PER_DAY - readRenameCount(now, visitorId));
}

/** 记下「今天又改了一次昵称」。 */
export function recordNicknameChange(visitorId?: string): void {
  const today = dayKey();
  const ledger = readLedger();
  const row = ledger[today] ?? {};
  const entry = row[visitorId || ANON] ?? {};
  const used = Math.max(
    Number.isFinite(entry.renames) ? Math.floor(entry.renames ?? 0) : 0,
    entry.nickname ? 1 : 0,
  );
  row[visitorId || ANON] = { ...entry, renames: used + 1, nickname: undefined };
  ledger[today] = row;
  writeLedger(ledger);
  notify();
}

/**
 * 当前访客标识（用于 hook 读快照）。
 *
 * 由 `squareStore.setViewer` 灌进来 —— 那里已经是身份的唯一起点，
 * 再单独解析一遍会多一次归属地查询。
 */
let activeVisitorId: string | undefined;

export function setLedgerVisitor(visitorId: string | undefined): void {
  activeVisitorId = visitorId;
  notify();
}

export type ChangeNicknameResult =
  | { ok: true; nickname: string; remaining: number }
  | { ok: false; remaining: number };

/**
 * 改昵称的唯一入口：写入 + 记账，两件事绑在一起。
 *
 * 以前这两步是分开的（组件里先 `saveNickname` 再 `recordNicknameChange`），
 * 于是「写一条」弹窗里顺手改了个昵称，名字变了、次数没扣 —— 等于每天能改无数次。
 * 现在只留这一个函数，任何调用方都没有「只存不记」或「只记不存」的余地。
 *
 * 返回 `ok: false` 表示今天两次用完了，此时一个字都不写。
 */
export function changeNickname(value: string, visitorId?: string): ChangeNicknameResult {
  const id = visitorId || activeVisitorId;
  const used = readRenameCount(new Date(), id);
  if (used >= RENAMES_PER_DAY) {
    return { ok: false, remaining: 0 };
  }
  const saved = saveNickname(value.slice(0, NICKNAME_MAX));
  recordNicknameChange(id);
  return { ok: true, nickname: saved, remaining: Math.max(0, RENAMES_PER_DAY - used - 1) };
}

/**
 * 只在测试里用：把账本清空。
 *
 * 账本放在 localStorage 上，模块级是同一份，多个用例之间会互相污染 ——
 * 前一个用例发满 3 条，后一个用例一开局就没额度了。
 */
export function RESET_LEDGER_FOR_TESTS(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 清不掉就算了
  }
  cachedSnapshot = '';
  cachedRename = '';
  cachedRenameLeft = '';
  notify();
}

/* ---------------- 订阅 ---------------- */

/*
 * 账本改了就通知界面重算「今天还能发几条」。
 * 用 set 而不是单回调：广场和卡片里都可能同时挂着订阅。
 */
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeLedger(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/*
 * 给 `useSyncExternalStore` 用的快照：内容不变时返回同一个引用，
 * 否则 React 会认为"每次渲染都在变"而无限重渲染。
 */
let cachedSnapshot = '';
let cachedUsage: QuotaUsage = { ...EMPTY_USAGE };

export function getUsageSnapshot(): QuotaUsage {
  const usage = readUsage(new Date(), activeVisitorId);
  const key = `${activeVisitorId ?? ''}|${usage.posts}:${usage.replies}`;
  if (key !== cachedSnapshot) {
    cachedSnapshot = key;
    cachedUsage = usage;
  }
  return cachedUsage;
}

let cachedRename = '';
let cachedRenameValue = true;
let cachedRenameLeft = '';
let cachedRenameLeftValue = RENAMES_PER_DAY;

export function getRenameSnapshot(): boolean {
  const allowed = canRenameToday(new Date(), activeVisitorId);
  const key = `${activeVisitorId ?? ''}|${allowed ? '1' : '0'}`;
  if (key !== cachedRename) {
    cachedRename = key;
    cachedRenameValue = allowed;
  }
  return cachedRenameValue;
}

/** 还剩几次改名机会（给按钮上的小字用）。 */
export function getRenameLeftSnapshot(): number {
  const left = renamesLeftToday(new Date(), activeVisitorId);
  const key = `${activeVisitorId ?? ''}|${left}`;
  if (key !== cachedRenameLeft) {
    cachedRenameLeft = key;
    cachedRenameLeftValue = left;
  }
  return cachedRenameLeftValue;
}
