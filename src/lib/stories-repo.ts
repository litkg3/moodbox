import { getDB, toStorageError } from '@/lib/db';
import { createId } from '@/lib/utils';
import type { HealingStory, StoryTheme } from '@/types';

export interface StoryDraft {
  title: string;
  content: string;
  theme: StoryTheme;
  author?: string;
}

function sortStories(stories: HealingStory[]): HealingStory[] {
  return [...stories].sort((a, b) => {
    const byTime = b.createdAt.localeCompare(a.createdAt);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
}

export async function listStories(): Promise<HealingStory[]> {
  try {
    const db = await getDB();
    return sortStories(await db.getAllFromIndex('stories', 'by-created'));
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function createStory(draft: StoryDraft): Promise<HealingStory> {
  const now = new Date().toISOString();
  const story: HealingStory = {
    id: createId('story'),
    title: draft.title.trim(),
    content: draft.content.trim(),
    theme: draft.theme,
    author: draft.author?.trim() || '匿名整理',
    createdAt: now,
    updatedAt: now,
  };
  try {
    const db = await getDB();
    await db.put('stories', story);
    return story;
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function updateStory(id: string, patch: StoryDraft): Promise<HealingStory> {
  try {
    const db = await getDB();
    const existing = await db.get('stories', id);
    if (!existing) throw new Error('这篇故事已经不在了。');
    const next: HealingStory = {
      ...existing,
      title: patch.title.trim(),
      content: patch.content.trim(),
      theme: patch.theme,
      author: patch.author?.trim() || existing.author,
      updatedAt: new Date().toISOString(),
    };
    await db.put('stories', next);
    return next;
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function deleteStory(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('stories', id);
  } catch (error) {
    throw toStorageError(error);
  }
}
