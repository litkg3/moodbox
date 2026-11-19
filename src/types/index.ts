/**
 * MoodBox 全局类型定义。
 * 所有跨模块共享的数据结构都集中在这里，避免类型漂移。
 */

/** 内置情绪。新增情绪只需扩展 `EMOTION_IDS` 与 `data/emotions.ts`。 */
export const EMOTION_IDS = [
  'anxiety',
  'sadness',
  'loneliness',
  'joy',
  'pain',
  'exam',
  'irritation',
  'exhaustion',
  'lost',
  'wronged',
  'numbness',
  'parting',
] as const;

export type EmotionId = (typeof EMOTION_IDS)[number];

/** 情绪球的配色（全部为同一色相的三段渐变，保证视觉统一而不塑料）。 */
export interface OrbPalette {
  /** 球体最浅处（受光面） */
  light: string;
  /** 球体主色（固有色） */
  mid: string;
  /** 球体最深处（背光面） */
  deep: string;
  /** 外发光 / 投影颜色（含透明度，直接用于 box-shadow） */
  glow: string;
  /** 与球体同色系的文字色，用于面板强调 */
  ink: string;
}

/**
 * 情绪球的舞台坐标。
 * x / y 使用百分数（相对整个情绪天空容器），便于响应式缩放。
 * size 使用 vmin 单位下的基准值，再叠加 `scale` 做个体差异。
 */
export interface OrbPlacement {
  x: number;
  y: number;
  scale: number;
  /** 漂浮动画的时长（秒）与延迟（秒），刻意设为互质感的数值以避免整片同步呼吸 */
  duration: number;
  delay: number;
  /** 漂浮轨迹的横向 / 纵向振幅（px），桌面端与移动端不同 */
  driftX: number;
  driftY: number;
}

export interface Emotion {
  id: EmotionId;
  /** 中文名，球面文字 */
  label: string;
  /** 英文名，作为安静的副标题 */
  latin: string;
  /** 一句话的情绪描摹，用于面板标题下方 */
  whisper: string;
  palette: OrbPalette;
  /** 桌面端 / 移动端两套舞台坐标。移动端留空表示该情绪球在小屏上不展示。 */
  placement: {
    desktop: OrbPlacement;
    mobile?: OrbPlacement;
    /**
     * 矮屏坐标：手机横屏、分屏、浏览器工具栏占满时，可视高度可能只剩 300–450px。
     * 这时竖屏那套上下两排会撞在一起，需要重排成更扁的舞台。
     * 缺省时退回 mobile（没有 mobile 就退回 desktop）。
     */
    short?: Pick<OrbPlacement, 'x' | 'y' | 'scale'>;
  };
  /** 至少 15 条温柔陪伴文案（不承诺疗效、不说教） */
  messages: readonly string[];
  /**
   * 这颗球专属的一篇故事。
   *
   * 有它时，面板里的「看个小故事」优先展示这一篇，而不是从故事集里随机抽
   * —— 有些话只适合某个情绪看，混进通用故事里就散了。
   * 没有时不显示「换一篇」（只有一篇，换也还是它）。
   */
  story?: EmotionStory;
  /** 强烈痛苦类情绪额外附带的低打扰现实支持提示 */
  supportNote?: string;
}

/** 情绪球的专属故事：结构与故事集一致，但不进数据库、不可被管理员删改。 */
export interface EmotionStory {
  title: string;
  /** 整段正文，保留原有换行（面板按 pre-wrap 渲染） */
  content: string;
  theme: StoryTheme;
  /** 署名，缺省显示「情绪盒子」 */
  author?: string;
}

/** 快乐记忆的心情标签 */
export const MEMORY_MOODS = [
  'warm',
  'joyful',
  'moved',
  'calm',
  'proud',
  'amused',
  'hopeful',
  'safe',
] as const;

export type MemoryMoodId = (typeof MEMORY_MOODS)[number];

export interface MemoryMood {
  id: MemoryMoodId;
  label: string;
  /** 标签底色（极低饱和） */
  tint: string;
  /** 标签文字色 */
  ink: string;
}

/** 一张图片在 IndexedDB 中以 Blob 存储（绝不塞进 localStorage）。 */
export interface MemoryImage {
  blob: Blob;
  type: string;
  width: number;
  height: number;
}

/** 用户收藏的一条快乐记忆 */
export interface Memory {
  id: string;
  /** 记忆发生的日期，格式 yyyy-MM-dd */
  date: string;
  title: string;
  content: string;
  mood: MemoryMoodId;
  image?: MemoryImage;
  createdAt: string;
  updatedAt: string;
  /** 演示模式写入的示例记忆，界面上必须明确标注，绝不冒充用户真实记录 */
  isDemo?: boolean;
}

/** 一条情绪打卡（用户主动记录的情绪时刻） */
export interface EmotionLog {
  id: string;
  emotionId: EmotionId;
  /** 记录归属日期，格式 yyyy-MM-dd（按本地时区） */
  date: string;
  /** 精确时间 ISO 字符串 */
  createdAt: string;
  isDemo?: boolean;
}

/** 写入数据库时使用的实体（图片仍为 Blob） */
export type MemoryRecord = Memory;

/** 导出文件结构 */
export interface MoodBoxExport {
  format: 'moodbox-export';
  version: 1;
  exportedAt: string;
  memories: ExportedMemory[];
  emotionLogs: EmotionLog[];
}

/** 导出时图片被转成 base64 dataURL，方便单文件备份 */
export interface ExportedMemory {
  id: string;
  date: string;
  title: string;
  content: string;
  mood: MemoryMoodId;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
  image?: {
    dataUrl: string;
    type: string;
    width: number;
    height: number;
  };
}

/** 导入结果，用于给出准确反馈而不是笼统的“成功” */
export interface ImportResult {
  imported: number;
  skipped: number;
  emotionsImported: number;
  total: number;
}

/* ============================================================
   内容类数据：治愈故事 / 树洞 / 心事信箱 / 时光信箱
   ============================================================ */

/** 故事的主题分类，用于筛选与配色 */
export const STORY_THEMES = ['warmth', 'company', 'courage', 'rest', 'growth', 'night'] as const;
export type StoryTheme = (typeof STORY_THEMES)[number];

export interface StoryThemeMeta {
  id: StoryTheme;
  label: string;
  /** 标签底色，低饱和 */
  tint: string;
  ink: string;
}

/** 一篇治愈故事。管理员可增删，内置的几篇带 isDemo 标记。 */
export interface HealingStory {
  id: string;
  title: string;
  content: string;
  theme: StoryTheme;
  /** 署名，内置故事写「情绪盒子」，管理员添加时默认「匿名整理」 */
  author: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

/** 帖子的审核状态：只有 approved 会出现在广场里 */
export type PostStatus = 'pending' | 'approved' | 'rejected';

export interface SquareReply {
  id: string;
  nickname: string;
  content: string;
  createdAt: string;
  /** 回复本身不做前置审核，但同样会跑一遍倾向识别，命中时在管理员视图里标出来 */
  needsSupport?: boolean;
  /** 是不是当前访客自己写的：只有本人（或管理员）能看到删除按钮 */
  mine?: boolean;
  /** 发布时的 IP 归属地（城市级），拿不到就没有这一项 */
  region?: string;
  /** 本机模式下的发布者标识；云端不会下发，只在 IndexedDB 里留存 */
  visitorId?: string;
}

/** 树洞广场的一条帖子 */
export interface SquarePost {
  id: string;
  content: string;
  /** 展示用的昵称，不要求唯一，也不做任何身份绑定 */
  nickname: string;
  createdAt: string;
  status: PostStatus;
  /** 收到的拥抱数 */
  hugs: number;
  replies: SquareReply[];
  /** 内容命中自伤 / 自杀相关表达时为 true：不拦截发布，只提醒管理员优先关注 */
  needsSupport?: boolean;
  reviewedAt?: string;
  isDemo?: boolean;
  /** 是不是当前访客自己写的：匿名游客只能删自己的帖子和回复 */
  mine?: boolean;
  /**
   * 当前访客是不是已经抱过这条。一个 IP 对同一条只能抱一次，
   * 所以这里为 true 时按钮会禁用，而不是让用户白点。
   */
  hugged?: boolean;
  /** 发布时的 IP 归属地（省份级），只到省份，不记录具体地址 */
  region?: string;
  /** 本机模式下的发布者标识；云端不会下发，只在 IndexedDB 里留存 */
  visitorId?: string;
}

/** 心事信箱里的一封信 */
export interface HeartLetter {
  id: string;
  content: string;
  createdAt: string;
  /** 是否已封存（封存后需要先「拆开」才能读） */
  sealed: boolean;
  openedAt?: string;
  isDemo?: boolean;
}

/** 写给未来自己的一封信，到期前不可读 */
export interface TimeCapsule {
  id: string;
  content: string;
  createdAt: string;
  /** 可以拆开的日期，yyyy-MM-dd */
  openAt: string;
  openedAt?: string;
}

/** 管理员操作的审计记录，让「谁在什么时候做了什么」有迹可循 */
export interface ModerationEntry {
  id: string;
  action: 'approve' | 'reject' | 'delete' | 'create';
  target: 'story' | 'post';
  targetId: string;
  createdAt: string;
}
