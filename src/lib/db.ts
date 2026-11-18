import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { SEED_STORIES } from '@/data/stories';
import { isSupabaseConfigured } from '@/lib/supabase-config';
import type {
  EmotionLog,
  HealingStory,
  HeartLetter,
  MemoryRecord,
  PostStatus,
  SquarePost,
  TimeCapsule,
} from '@/types';

export const DB_NAME = 'moodbox';
/**
 * 数据库版本。升级时：
 * 1. 版本号 +1；
 * 2. 在 `upgrade` 中追加 `if (oldVersion < N) { ... }` 分支；
 * 旧用户的数据会在打开数据库时自动迁移，新用户则一次性跑完所有分支。
 *
 * v1 → v2：新增治愈故事、树洞帖子、心事信件、时光信件、捏爆记录五个仓库。
 * 只做「新增」，没有任何破坏性改动，因此老用户的记忆和情绪记录不受影响。
 *
 * v2 → v3：树洞广场改为云端（Supabase），本机不再写入示例帖子；
 * 已配置 Supabase 的用户，本机残留的旧帖子（含早期示例）会被清空一次。
 * 没配 Supabase 的用户数据原样保留 —— 他们的广场还是本机的。
 */
export const DB_VERSION = 3;

/** 一颗被捏爆的情绪球，只记 id 与时间 */
export interface BurstRecord {
  emotionId: string;
  createdAt: string;
}

interface MoodBoxDB extends DBSchema {
  memories: {
    key: string;
    value: MemoryRecord;
    indexes: { 'by-date': string; 'by-updated': string };
  };
  emotionLogs: {
    key: string;
    value: EmotionLog;
    indexes: { 'by-date': string };
  };
  stories: {
    key: string;
    value: HealingStory;
    indexes: { 'by-created': string };
  };
  posts: {
    key: string;
    value: SquarePost;
    indexes: { 'by-created': string; 'by-status': PostStatus };
  };
  letters: {
    key: string;
    value: HeartLetter;
    indexes: { 'by-created': string };
  };
  capsules: {
    key: string;
    value: TimeCapsule;
    indexes: { 'by-open': string };
  };
  bursts: {
    key: string;
    value: BurstRecord;
  };
}

/** 会被「清空数据」影响到的全部仓库 */
export const ALL_STORES = [
  'memories',
  'emotionLogs',
  'stories',
  'posts',
  'letters',
  'capsules',
  'bursts',
] as const;

export class StorageUnavailableError extends Error {
  constructor(message = '当前浏览器环境不支持本地数据库（IndexedDB）。') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export class StorageQuotaError extends Error {
  constructor(message = '浏览器存储空间不足，这条内容暂时没能保存。') {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

export function isIndexedDBSupported(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return typeof window.indexedDB !== 'undefined' && window.indexedDB !== null;
  } catch {
    return false;
  }
}

let dbPromise: Promise<IDBPDatabase<MoodBoxDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MoodBoxDB>> {
  if (!isIndexedDBSupported()) {
    return Promise.reject(new StorageUnavailableError());
  }

  if (!dbPromise) {
    dbPromise = openDB<MoodBoxDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const memories = db.createObjectStore('memories', { keyPath: 'id' });
          memories.createIndex('by-date', 'date');
          memories.createIndex('by-updated', 'updatedAt');

          const logs = db.createObjectStore('emotionLogs', { keyPath: 'id' });
          logs.createIndex('by-date', 'date');
        }
        // 未来版本示例：
        // if (oldVersion < 3) {
        //   const logs = transaction.objectStore('emotionLogs');
        //   logs.createIndex('by-emotion', 'emotionId');
        // }
        if (oldVersion < 2) {
          const stories = db.createObjectStore('stories', { keyPath: 'id' });
          stories.createIndex('by-created', 'createdAt');

          const posts = db.createObjectStore('posts', { keyPath: 'id' });
          posts.createIndex('by-created', 'createdAt');
          posts.createIndex('by-status', 'status');

          const letters = db.createObjectStore('letters', { keyPath: 'id' });
          letters.createIndex('by-created', 'createdAt');

          const capsules = db.createObjectStore('capsules', { keyPath: 'id' });
          capsules.createIndex('by-open', 'openAt');

          db.createObjectStore('bursts', { keyPath: 'emotionId' });

          // 内置的治愈故事只在建库那一次写入。
          // 之后管理员删掉它们也不会再自动补回 —— 用户的删除是有效的。
          // 广场的示例帖子已经删除（v3），因为帖子的真相现在在云端。
          for (const story of SEED_STORIES) void stories.put(story);
        }
        if (oldVersion < 3) {
          // 树洞广场切到 Supabase 之后，本机 `posts` 仓库里的东西（本地模式下发的帖子）
          // 不再被读取，留着只会让人以为"数据还在本机"。
          // 只在真正配置了云端时清空：没配 Supabase 的人依然是纯本地模式，
          // 他们的帖子是唯一的副本，不能动。
          //
          // 注意这里**不能 await**：升级回调里一旦出现 await，版本变更事务就不再是
          // "当前事务"，后续任何 db.transaction / db.clear 都会抛
          // `A version change transaction is running`，整个数据库打不开。
          // 正确做法是直接在传入的 versionchange 事务上同步发请求。
          if (isSupabaseConfigured()) {
            void tx.objectStore('posts').clear();
          }
        }
      },
      blocked() {
        // 另一个标签页仍占用旧版本连接
        console.warn('[MoodBox] 数据库升级被其他标签页阻塞，请关闭其他页面后刷新。');
      },
      blocking() {
        // 本页占用了旧版本，主动关闭让新版本升级
        void dbPromise?.then((db) => db.close()).catch(() => undefined);
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      },
    }).catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

/** 将底层异常翻译成产品能友好展示的错误。 */
export function toStorageError(error: unknown): Error {
  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError' || /quota/i.test(error.message)) {
      return new StorageQuotaError();
    }
    if (error.name === 'InvalidStateError' || /indexeddb/i.test(error.message)) {
      return new StorageUnavailableError('本地数据库暂时不可用，可能处于无痕模式或已被浏览器清理。');
    }
    return error;
  }
  return new Error('未知的本地存储错误。');
}
