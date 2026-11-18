import { getDB, toStorageError } from '@/lib/db';
import { createId } from '@/lib/utils';
import type { HeartLetter, TimeCapsule } from '@/types';

/* ---------------- 心事信箱 ---------------- */

export async function listLetters(): Promise<HeartLetter[]> {
  try {
    const db = await getDB();
    const letters = await db.getAllFromIndex('letters', 'by-created');
    return letters.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    throw toStorageError(error);
  }
}

/** 写完直接封存：刚写下的心事，默认不想马上再读一遍。 */
export async function createLetter(content: string): Promise<HeartLetter> {
  const letter: HeartLetter = {
    id: createId('letter'),
    content: content.trim(),
    createdAt: new Date().toISOString(),
    sealed: true,
  };
  try {
    const db = await getDB();
    await db.put('letters', letter);
    return letter;
  } catch (error) {
    throw toStorageError(error);
  }
}

/** 拆开一封已经封存的信（读过之后也会保持"已拆开"的状态）。 */
export async function openLetter(id: string): Promise<HeartLetter> {
  try {
    const db = await getDB();
    const existing = await db.get('letters', id);
    if (!existing) throw new Error('这封信已经不在了。');
    const next: HeartLetter = {
      ...existing,
      sealed: false,
      openedAt: existing.openedAt ?? new Date().toISOString(),
    };
    await db.put('letters', next);
    return next;
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function deleteLetter(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('letters', id);
  } catch (error) {
    throw toStorageError(error);
  }
}

/* ---------------- 时光信箱 ---------------- */

export async function listCapsules(): Promise<TimeCapsule[]> {
  try {
    const db = await getDB();
    const capsules = await db.getAllFromIndex('capsules', 'by-open');
    return capsules.sort((a, b) => a.openAt.localeCompare(b.openAt));
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function createCapsule(content: string, openAt: string): Promise<TimeCapsule> {
  const capsule: TimeCapsule = {
    id: createId('capsule'),
    content: content.trim(),
    createdAt: new Date().toISOString(),
    openAt,
  };
  try {
    const db = await getDB();
    await db.put('capsules', capsule);
    return capsule;
  } catch (error) {
    throw toStorageError(error);
  }
}

/** 记下"读过了"，但内容仍然可以再看 —— 未来的自己没理由被锁在门外。 */
export async function openCapsule(id: string): Promise<TimeCapsule> {
  try {
    const db = await getDB();
    const existing = await db.get('capsules', id);
    if (!existing) throw new Error('这封信已经不在了。');
    const next: TimeCapsule = { ...existing, openedAt: new Date().toISOString() };
    await db.put('capsules', next);
    return next;
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function deleteCapsule(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('capsules', id);
  } catch (error) {
    throw toStorageError(error);
  }
}
