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

/**
 * 收尾那些「没等到复原就被打断」的捏爆。
 *
 * 场景：球碎掉之后，2 秒的复原计时器挂在页面上；如果用户在这 2 秒里切走页面、
 * 锁屏、或者直接关掉标签页，计时器就一起没了。可 `bursts` 里已经写了记录，
 * 下次打开时这颗球仍然缺席 —— 而且再也没有谁来补这个动作，球就永久少一颗。
 * 用户看到的现象是「莫名其妙少了几颗球」。
 *
 * 所以启动时统一把这些记录收掉：页面能读到它们，就说明当时没来得及复原。
 * 真正「正在散场」的球不在库里（那一刻还没写），因此这里不会误伤。
 */
export async function settleStaleBursts(): Promise<void> {
  try {
    const db = await getDB();
    if ((await db.count('bursts')) === 0) return;
    await db.clear('bursts');
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
