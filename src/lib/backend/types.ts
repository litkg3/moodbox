import type { HealingStory, HeartLetter, PostStatus, SquarePost, TimeCapsule } from '@/types';

export interface StoryDraft {
  title: string;
  content: string;
  theme: HealingStory['theme'];
  author?: string;
}

export interface PostDraft {
  content: string;
  nickname?: string;
  /** 落空昵称时用的匿名代号（形如「匿名·K7Q2」） */
  alias?: string;
  needsSupport?: boolean;
  /** 访客稳定标识：用来判断「这条能不能由本人删」 */
  visitorId?: string;
  /** IP 归属地（城市级），只用于展示 */
  region?: string | null;
}

export interface ReplyDraft {
  content: string;
  nickname?: string;
  alias?: string;
  needsSupport?: boolean;
  visitorId?: string;
  region?: string | null;
}

/**
 * 内容仓库的统一接口。
 *
 * 三种实现：
 * - `local`：全部内容写浏览器 IndexedDB（默认，没有任何外部依赖）；
 * - `supabase`：树洞广场走 Supabase，其余内容仍留本机（混合模式）；
 * - `http`：自建 REST 服务的预留实现。
 *
 * 页面与 store 只依赖这个接口，所以从本地存储切到云端时，
 * 需要改的只有 `lib/backend/index.ts` 里的环境变量判断，业务代码零改动。
 */
export interface ContentBackend {
  readonly mode: 'local' | 'supabase' | 'http';

  /**
   * 校验管理员口令。
   *
   * 只有 `supabase` 实现会真的问服务端；本地实现没有这个方法，
   * 由 `lib/admin.ts` 用演示口令在本地比对。
   */
  verifyAdmin?(token: string): Promise<boolean>;

  listStories(): Promise<HealingStory[]>;
  createStory(draft: StoryDraft): Promise<HealingStory>;
  updateStory(id: string, draft: StoryDraft): Promise<HealingStory>;
  deleteStory(id: string): Promise<void>;

  listPosts(viewerId?: string): Promise<SquarePost[]>;
  createPost(draft: PostDraft): Promise<SquarePost>;
  setPostStatus(id: string, status: PostStatus): Promise<SquarePost>;
  deletePost(id: string): Promise<void>;
  /** 匿名游客删自己的帖子：云端会校验 visitor 与发布者是否一致 */
  deleteOwnPost(id: string, visitorId: string): Promise<void>;
  /** 抱一下。
   * 传 visitorId 时同一条只能抱一次（云端按指纹去重）；不传就退化成单纯 +1。 */
  hugPost(id: string, visitorId?: string): Promise<SquarePost>;
  addReply(postId: string, draft: ReplyDraft): Promise<SquarePost>;
  deleteReply(postId: string, replyId: string): Promise<SquarePost>;
  /** 匿名游客删自己的回复 */
  deleteOwnReply(postId: string, replyId: string, visitorId: string): Promise<SquarePost>;

  listLetters(): Promise<HeartLetter[]>;
  createLetter(content: string): Promise<HeartLetter>;
  openLetter(id: string): Promise<HeartLetter>;
  deleteLetter(id: string): Promise<void>;

  listCapsules(): Promise<TimeCapsule[]>;
  createCapsule(content: string, openAt: string): Promise<TimeCapsule>;
  openCapsule(id: string): Promise<TimeCapsule>;
  deleteCapsule(id: string): Promise<void>;
}
