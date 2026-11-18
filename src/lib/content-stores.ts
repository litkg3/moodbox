'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getContentBackend } from '@/lib/backend';
import type { PostDraft, ReplyDraft, StoryDraft } from '@/lib/backend/types';
import { isIndexedDBSupported } from '@/lib/db';
import type { HealingStory, HeartLetter, PostStatus, SquarePost, TimeCapsule } from '@/types';

export type ListStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export interface ListSnapshot<T> {
  status: ListStatus;
  items: T[];
  error: string | null;
}

const INITIAL: ListSnapshot<never> = { status: 'idle', items: [], error: null };

/**
 * 一个可以订阅的列表数据源。
 *
 * 与 `moodbox-store` 用同一套 `useSyncExternalStore` 模式：
 * 服务端快照恒定，客户端挂载后才真正读数据，因此不会出现
 * 「服务端渲染空列表、客户端渲染有数据」的水合不一致。
 */
class ListStore<T> {
  private snapshot: ListSnapshot<T> = { status: 'idle', items: [], error: null };
  private listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;

  constructor(
    private readonly load: () => Promise<T[]>,
    /**
     * 是否需要本地 IndexedDB。
     *
     * 广场接上 Supabase 之后，它的数据在云端，无痕模式下也应该能正常读 ——
     * 所以这条检查要能关掉，否则会被误判成"浏览器不支持"。
     */
    private readonly options: { requiresLocalDb?: boolean } = {},
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ListSnapshot<T> => this.snapshot;

  getServerSnapshot = (): ListSnapshot<T> => INITIAL as ListSnapshot<T>;

  protected get items(): T[] {
    return this.snapshot.items;
  }

  protected emit(next: Partial<ListSnapshot<T>>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  protected setItems(items: T[]): void {
    this.emit({ items, status: 'ready', error: null });
  }

  init(): Promise<void> {
    if (this.loading) return this.loading;
    if (this.snapshot.status === 'ready') return Promise.resolve();

    if (this.options.requiresLocalDb !== false && !isIndexedDBSupported()) {
      this.emit({
        status: 'unavailable',
        error: '当前浏览器不支持本地数据库（可能是无痕模式），这部分内容无法保存。',
      });
      return Promise.resolve();
    }

    this.emit({ status: 'loading' });
    this.loading = (async () => {
      try {
        this.setItems(await this.load());
      } catch (error) {
        this.emit({
          status: 'error',
          error: error instanceof Error ? error.message : '读取内容失败。',
        });
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  async refresh(): Promise<void> {
    try {
      this.setItems(await this.load());
    } catch (error) {
      this.emit({
        status: 'error',
        error: error instanceof Error ? error.message : '读取内容失败。',
      });
    }
  }
}

/* ---------------- 治愈故事集 ---------------- */

class StoriesStore extends ListStore<HealingStory> {
  constructor() {
    super(() => getContentBackend().listStories());
  }

  async add(draft: StoryDraft): Promise<HealingStory> {
    const story = await getContentBackend().createStory(draft);
    this.setItems([story, ...this.items]);
    return story;
  }

  async edit(id: string, draft: StoryDraft): Promise<HealingStory> {
    const story = await getContentBackend().updateStory(id, draft);
    this.setItems(this.items.map((item) => (item.id === id ? story : item)));
    return story;
  }

  async remove(id: string): Promise<void> {
    await getContentBackend().deleteStory(id);
    this.setItems(this.items.filter((item) => item.id !== id));
  }
}

/* ---------------- 树洞广场 ---------------- */

class SquareStore extends ListStore<SquarePost> {
  constructor() {
    super(() => getContentBackend().listPosts(), {
      // 接上 Supabase 后广场数据在云端，不需要本机 IndexedDB
      requiresLocalDb: getContentBackend().mode === 'local',
    });
  }

  /** 管理员解锁 / 退出后要重新拉一次：待审核的帖子只有带令牌才看得到。 */
  async reload(): Promise<void> {
    this.emit({ status: 'loading' });
    await this.refresh();
  }

  async publish(draft: PostDraft): Promise<SquarePost> {
    const post = await getContentBackend().createPost(draft);
    this.setItems([post, ...this.items]);
    return post;
  }

  async review(id: string, status: PostStatus): Promise<void> {
    const next = await getContentBackend().setPostStatus(id, status);
    this.setItems(this.items.map((item) => (item.id === id ? next : item)));
  }

  async remove(id: string): Promise<void> {
    await getContentBackend().deletePost(id);
    this.setItems(this.items.filter((item) => item.id !== id));
  }

  async hug(id: string): Promise<void> {
    const next = await getContentBackend().hugPost(id);
    this.setItems(this.items.map((item) => (item.id === id ? next : item)));
  }

  async reply(postId: string, draft: ReplyDraft): Promise<void> {
    const next = await getContentBackend().addReply(postId, draft);
    this.setItems(this.items.map((item) => (item.id === postId ? next : item)));
  }

  async removeReply(postId: string, replyId: string): Promise<void> {
    const next = await getContentBackend().deleteReply(postId, replyId);
    this.setItems(this.items.map((item) => (item.id === postId ? next : item)));
  }

  get approved(): SquarePost[] {
    return this.items.filter((post) => post.status === 'approved');
  }

  get pending(): SquarePost[] {
    return this.items.filter((post) => post.status === 'pending');
  }
}

/* ---------------- 心事信箱 ---------------- */

class LettersStore extends ListStore<HeartLetter> {
  constructor() {
    super(() => getContentBackend().listLetters());
  }

  async write(content: string): Promise<HeartLetter> {
    const letter = await getContentBackend().createLetter(content);
    this.setItems([letter, ...this.items]);
    return letter;
  }

  async open(id: string): Promise<void> {
    const next = await getContentBackend().openLetter(id);
    this.setItems(this.items.map((item) => (item.id === id ? next : item)));
  }

  async remove(id: string): Promise<void> {
    await getContentBackend().deleteLetter(id);
    this.setItems(this.items.filter((item) => item.id !== id));
  }
}

/* ---------------- 时光信箱 ---------------- */

class CapsulesStore extends ListStore<TimeCapsule> {
  constructor() {
    super(() => getContentBackend().listCapsules());
  }

  async write(content: string, openAt: string): Promise<TimeCapsule> {
    const capsule = await getContentBackend().createCapsule(content, openAt);
    this.setItems([...this.items, capsule]);
    return capsule;
  }

  async markOpened(id: string): Promise<void> {
    const next = await getContentBackend().openCapsule(id);
    this.setItems(this.items.map((item) => (item.id === id ? next : item)));
  }

  async remove(id: string): Promise<void> {
    await getContentBackend().deleteCapsule(id);
    this.setItems(this.items.filter((item) => item.id !== id));
  }
}

export const storiesStore = new StoriesStore();
export const squareStore = new SquareStore();
export const lettersStore = new LettersStore();
export const capsulesStore = new CapsulesStore();

function useListStore<T>(store: ListStore<T>): ListSnapshot<T> {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  useEffect(() => {
    void store.init();
  }, [store]);
  return snapshot;
}

export const useStories = () => useListStore(storiesStore);
export const useSquare = () => useListStore(squareStore);
export const useLetters = () => useListStore(lettersStore);
export const useCapsules = () => useListStore(capsulesStore);
