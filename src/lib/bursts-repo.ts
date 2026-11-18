import { getDB, toStorageError } from '@/lib/db';
import type { EmotionId } from '@/types';

/**
 * 被捏爆的情绪球。
 *
 * 只存 id，不存任何与情绪强度相关的信息 —— 这个动作的语义是
 * "把它释放掉"，不是"记录一次痛苦"，所以刻意不保留时间线分析。
 * 主页读这份列表，把对应的球从天空里拿掉。
 */
export async function listBursts(): Promise<EmotionId[]> {
  try {
    const db = await getDB();
    const records = await db.getAll('bursts');
    return records.map((record) => record.emotionId as EmotionId);
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function addBurst(emotionId: EmotionId): Promise<void> {
  try {
    const db = await getDB();
    await db.put('bursts', { emotionId, createdAt: new Date().toISOString() });
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function removeBurst(emotionId: EmotionId): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('bursts', emotionId);
  } catch (error) {
    throw toStorageError(error);
  }
}

/** 让所有散去的球回到天上。 */
export async function clearBursts(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('bursts');
  } catch (error) {
    throw toStorageError(error);
  }
}
