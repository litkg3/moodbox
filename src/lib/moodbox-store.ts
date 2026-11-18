'use client';

import { useSyncExternalStore } from 'react';
import { isValidDateKey, toDateKey } from '@/lib/date';
import { isIndexedDBSupported } from '@/lib/db';
import {
  addEmotionLog,
  clearAllData,
  createMemory,
  deleteEmotionLog,
  deleteMemory,
  listEmotionLogs,
  listMemories,
  updateMemory,
  type MemoryDraft,
} from '@/lib/memories-repo';
import { addBurst, clearBursts, listBursts, removeBurst } from '@/lib/bursts-repo';
import type { EmotionId, EmotionLog, MemoryRecord } from '@/types';

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export interface MoodBoxSnapshot {
  status: StoreStatus;
  memories: MemoryRecord[];
  emotionLogs: EmotionLog[];
  /** 被捏爆、已从主页天空消失的情绪球 */
  bursts: EmotionId[];
  error: string | null;
}

const INITIAL_SNAPSHOT: MoodBoxSnapshot = {
  status: 'idle',
  memories: [],
  emotionLogs: [],
  bursts: [],
  error: null,
};

function sortMemories(memories: MemoryRecord[]): MemoryRecord[] {
  return [...memories].sort((a, b) => {
    if (a.date === b.date) return b.createdAt.localeCompare(a.createdAt);
    return b.date.localeCompare(a.date);
  });
}

function sortLogs(logs: EmotionLog[]): EmotionLog[] {
  return [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * 全局数据源。
 *
 * IndexedDB 是唯一事实来源，内存中保留一份快照供 React 订阅。
 * 用 `useSyncExternalStore` 而不是 Context + useState，
 * 是因为多个页面（首页 / 收藏馆 / 日历）都需要读取同一份数据，
 * 且必须保证 SSR 阶段快照稳定，避免 hydration mismatch。
 */
class MoodBoxStore {
  private snapshot: MoodBoxSnapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<() => void>();
  private initPromise: Promise<void> | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): MoodBoxSnapshot => this.snapshot;

  getServerSnapshot = (): MoodBoxSnapshot => INITIAL_SNAPSHOT;

  private emit(next: Partial<MoodBoxSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  /** 幂等初始化：多个组件同时挂载只会打开一次数据库。 */
  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (this.snapshot.status === 'ready') return Promise.resolve();

    if (!isIndexedDBSupported()) {
      this.emit({
        status: 'unavailable',
        error: '当前浏览器不支持本地数据库（可能是无痕模式），记录将无法保存。',
      });
      return Promise.resolve();
    }

    this.emit({ status: 'loading' });
    this.initPromise = (async () => {
      try {
        const [memories, emotionLogs, bursts] = await Promise.all([
          listMemories(),
          listEmotionLogs(),
          listBursts(),
        ]);
        this.emit({ status: 'ready', memories, emotionLogs, bursts, error: null });
      } catch (error) {
        this.emit({
          status: 'error',
          error: error instanceof Error ? error.message : '读取本地数据失败。',
        });
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async reload(): Promise<void> {
    const [memories, emotionLogs, bursts] = await Promise.all([
      listMemories(),
      listEmotionLogs(),
      listBursts(),
    ]);
    this.emit({ status: 'ready', memories, emotionLogs, bursts, error: null });
  }

  async addMemory(draft: MemoryDraft): Promise<MemoryRecord> {
    const record = await createMemory(draft);
    this.emit({
      status: 'ready',
      memories: sortMemories([record, ...this.snapshot.memories]),
    });
    return record;
  }

  async editMemory(id: string, patch: Partial<MemoryDraft>): Promise<MemoryRecord> {
    const updated = await updateMemory(id, patch);
    this.emit({
      memories: sortMemories(
        this.snapshot.memories.map((memory) => (memory.id === id ? updated : memory)),
      ),
    });
    return updated;
  }

  async removeMemory(id: string): Promise<void> {
    await deleteMemory(id);
    this.emit({ memories: this.snapshot.memories.filter((memory) => memory.id !== id) });
  }

  async checkInEmotion(emotionId: EmotionId, date = toDateKey(new Date())): Promise<EmotionLog> {
    const safeDate = isValidDateKey(date) ? date : toDateKey(new Date());
    const log = await addEmotionLog(emotionId, safeDate);
    this.emit({ emotionLogs: sortLogs([log, ...this.snapshot.emotionLogs]) });
    return log;
  }

  async removeEmotionLog(id: string): Promise<void> {
    await deleteEmotionLog(id);
    this.emit({ emotionLogs: this.snapshot.emotionLogs.filter((log) => log.id !== id) });
  }

  async clearEverything(): Promise<void> {
    await clearAllData();
    this.emit({ memories: [], emotionLogs: [], bursts: [], status: 'ready', error: null });
  }

  /** 捏爆一颗球：从天空里拿掉，并记住这个决定。 */
  async burst(emotionId: EmotionId): Promise<void> {
    await addBurst(emotionId);
    if (this.snapshot.bursts.includes(emotionId)) return;
    this.emit({ bursts: [...this.snapshot.bursts, emotionId] });
  }

  /** 让所有散去的球回到天上。 */
  async restoreBursts(): Promise<void> {
    await clearBursts();
    this.emit({ bursts: [] });
  }

  /**
   * 让某一颗球自己飘回来。
   *
   * 捏爆之后隔几秒自动调用 —— 释放那一瞬间的情绪，不等于要把这颗球
   * 永久删除；天空应该是完整的，所以不做"手动召回"这一步。
   */
  async restoreBurst(emotionId: EmotionId): Promise<void> {
    if (!this.snapshot.bursts.includes(emotionId)) return;
    await removeBurst(emotionId);
    this.emit({ bursts: this.snapshot.bursts.filter((id) => id !== emotionId) });
  }

  /** 供导入等批量写入后刷新快照 */
  async syncAfterBulkWrite(): Promise<void> {
    await this.reload();
  }
}

export const moodBoxStore = new MoodBoxStore();

export function useMoodBoxData(): MoodBoxSnapshot {
  return useSyncExternalStore(
    moodBoxStore.subscribe,
    moodBoxStore.getSnapshot,
    moodBoxStore.getServerSnapshot,
  );
}
