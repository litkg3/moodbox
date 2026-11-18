import { getDB, toStorageError } from '@/lib/db';
import { toDateKey } from '@/lib/date';
import { createId } from '@/lib/utils';
import type { EmotionId, EmotionLog, MemoryMoodId, MemoryRecord } from '@/types';

/** 新增记忆时用户填写的字段 */
export interface MemoryDraft {
  date: string;
  title: string;
  content: string;
  mood: MemoryMoodId;
  image?: { blob: Blob; type: string; width: number; height: number };
}

/** 1MB 以上的图片更容易触发配额问题，这里只做提示不拦截。 */
export const IMAGE_SIZE_WARNING = 2 * 1024 * 1024;

export async function listMemories(): Promise<MemoryRecord[]> {
  try {
    const db = await getDB();
    const all = await db.getAllFromIndex('memories', 'by-date');
    // 日期倒序；同一天按创建时间倒序，最新收藏的排前面
    return all.sort((a, b) => {
      if (a.date === b.date) return b.createdAt.localeCompare(a.createdAt);
      return b.date.localeCompare(a.date);
    });
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function listEmotionLogs(): Promise<EmotionLog[]> {
  try {
    const db = await getDB();
    return db.getAllFromIndex('emotionLogs', 'by-date');
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function createMemory(draft: MemoryDraft): Promise<MemoryRecord> {
  const now = new Date().toISOString();
  const record: MemoryRecord = {
    id: createId('memory'),
    date: draft.date,
    title: draft.title.trim(),
    content: draft.content.trim(),
    mood: draft.mood,
    image: draft.image,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const db = await getDB();
    await db.put('memories', record);
    return record;
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function updateMemory(
  id: string,
  patch: Partial<MemoryDraft>,
): Promise<MemoryRecord> {
  try {
    const db = await getDB();
    const existing = await db.get('memories', id);
    if (!existing) throw new Error('这条记忆已经不在了，可能已被删除。');
    const next: MemoryRecord = {
      ...existing,
      ...patch,
      title: patch.title !== undefined ? patch.title.trim() : existing.title,
      content: patch.content !== undefined ? patch.content.trim() : existing.content,
      updatedAt: new Date().toISOString(),
    };
    await db.put('memories', next);
    return next;
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function deleteMemory(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('memories', id);
  } catch (error) {
    throw toStorageError(error);
  }
}

/** 写入一批记忆（导入时使用）。 */
export async function bulkPutMemories(records: MemoryRecord[]): Promise<void> {
  if (records.length === 0) return;
  try {
    const db = await getDB();
    const tx = db.transaction('memories', 'readwrite');
    await Promise.all([...records.map((record) => tx.store.put(record)), tx.done]);
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function addEmotionLog(
  emotionId: EmotionId,
  date = toDateKey(new Date()),
): Promise<EmotionLog> {
  const log: EmotionLog = {
    id: createId('log'),
    emotionId,
    date,
    createdAt: new Date().toISOString(),
  };
  try {
    const db = await getDB();
    await db.put('emotionLogs', log);
    return log;
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function deleteEmotionLog(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('emotionLogs', id);
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function bulkPutEmotionLogs(logs: EmotionLog[]): Promise<void> {
  if (logs.length === 0) return;
  try {
    const db = await getDB();
    const tx = db.transaction('emotionLogs', 'readwrite');
    await Promise.all([...logs.map((log) => tx.store.put(log)), tx.done]);
  } catch (error) {
    throw toStorageError(error);
  }
}

/**
 * 清空「我的记录」（设置中提供，删除前必须二次确认）。
 *
 * 语义边界：只删用户自己产生的内容 —— 快乐记忆、情绪记录、心事信件、
 * 时光信件、捏爆记录，以及自己发的帖子 / 自己添加的故事。
 * 内置的治愈故事与示例帖子属于"内容"，不属于"数据"，因此保留，
 * 否则用户清一次数据就会把故事集清空，这显然不是他的本意。
 */
export async function clearAllData(): Promise<void> {
  try {
    const db = await getDB();
    const [posts, stories] = await Promise.all([db.getAll('posts'), db.getAll('stories')]);
    const ownPosts = posts.filter((post) => !post.isDemo);
    const ownStories = stories.filter((story) => !story.isDemo);

    const tx = db.transaction(
      ['memories', 'emotionLogs', 'stories', 'posts', 'letters', 'capsules', 'bursts'],
      'readwrite',
    );
    await Promise.all([
      tx.objectStore('memories').clear(),
      tx.objectStore('emotionLogs').clear(),
      tx.objectStore('letters').clear(),
      tx.objectStore('capsules').clear(),
      tx.objectStore('bursts').clear(),
      ...ownPosts.map((post) => tx.objectStore('posts').delete(post.id)),
      ...ownStories.map((story) => tx.objectStore('stories').delete(story.id)),
      tx.done,
    ]);
  } catch (error) {
    throw toStorageError(error);
  }
}

export interface StorageInfo {
  usage: number;
  quota: number;
  ratio: number;
  supported: boolean;
}

/** 读取存储用量，用于在设置里提示用户（浏览器不支持时返回 supported: false）。 */
export async function getStorageInfo(): Promise<StorageInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0, ratio: 0, supported: false };
  }
  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    return { usage, quota, ratio: quota > 0 ? usage / quota : 0, supported: true };
  } catch {
    return { usage: 0, quota: 0, ratio: 0, supported: false };
  }
}
