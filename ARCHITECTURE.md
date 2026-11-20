# ARCHITECTURE.md · 情绪盒子技术架构

## 一、总体架构

```text
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│                                                              │
│  ┌───────────────── App Router (Next.js 15) ───────────────┐ │
│  │  layout.tsx  ← 主题首帧脚本 / 氛围背景 / 页头 / Toast   │ │
│  │  /            /jar      /letters   /calendar  /weekly    │ │
│  │  /breathe     /quiz     /stories   /square  /time-capsule│ │
│  │  /memories(动态, searchParams)     /about  其余静态      │ │
│  └───────────────────────┬─────────────────────────────────┘ │
│                          │ Client Components                 │
│  ┌───────────────────────▼─────────────────────────────────┐ │
│  │ HomeExperience / MemoriesView / CalendarView            │ │
│  │ EmotionSky·EmotionOrb·EmotionPanel / ComfortExperience  │ │
│  │ MemoryForm·MemoryCard·DataSettings / StatsPanel         │ │
│  └───────────────────────┬─────────────────────────────────┘ │
│                          │ useMoodBox()                     │
│  ┌───────────────────────▼─────────────────────────────────┐ │
│  │ moodBoxStore（个人记录快照，useSyncExternalStore）       │ │
│  │ content-stores（ListStore<T> ×4：故事/帖子/信件/时光）   │ │
│  └───────────────────────┬─────────────────────────────────┘ │
│                          │ async                           │ │
│  ┌───────────────────────▼─────────────────────────────────┐ │
│  │ memories-repo / bursts-repo / stories-repo              │ │
│  │ square-repo / letters-repo                              │ │
│  │ （或 ContentBackend → createHttpBackend，见「五」）      │ │
│  └───────────────────────┬─────────────────────────────────┘ │
│                          │ idb                             │ │
│  ┌───────────────────────▼─────────────────────────────────┐ │
│  │ IndexedDB: moodbox v2                                    │ │
│  │  ├─ memories      (id, by-date, by-updated)              │ │
│  │  ├─ emotionLogs   (id, by-date)                          │ │
│  │  ├─ stories       (id, by-created)                       │ │
│  │  ├─ posts         (id, by-created, by-status)            │ │
│  │  ├─ letters       (id, by-created)                       │ │
│  │  ├─ capsules      (id, by-open)                          │ │
│  │  └─ bursts        (emotionId)                            │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  localStorage: 主题偏好 / 音乐偏好                            │
│  sessionStorage: 管理员解锁态（关标签页即失效）               │
└──────────────────────────────────────────────────────────────┘
```

默认没有服务端数据库、没有账号体系。部署后是一个纯前端 + Next 服务端渲染壳的应用；把 `NEXT_PUBLIC_MOODBOX_API_BASE` 指向自建 REST 服务后，内容类数据（故事 / 帖子 / 信件 / 时光）改走网络，个人记录仍然留在本地。

---

## 二、服务端 / 客户端边界

| 文件 | 类型 | 理由 |
| --- | --- | --- |
| `app/layout.tsx` | Server | 元数据、`viewport`、字体栈 |
| `app/page.tsx` / `calendar/page.tsx` / `about/page.tsx` | Server | 只做组装与静态预渲染 |
| `app/memories/page.tsx` | Server（async） | 读取 `searchParams.compose` 后交给客户端视图 |
| `components/home/HomeExperience` | Client | 情绪球交互、面板、覆盖层 |
| `components/memories/*` / `calendar/*` / `comfort/*` / `audio/*` | Client | 依赖 IndexedDB、Audio、动画 |
| `components/layout/AmbientBackground` | Server | 纯 CSS，无状态，不进入 client bundle |
| `components/layout/MotionPreferences` | Client | `MotionConfig reducedMotion="user"`，把系统「减少动效」偏好传给 Motion；只包一层 Provider，children 仍是服务端组件 |
| `components/layout/SiteHeader` | Client | 需要 `usePathname` 与滚动状态 |

`"use client"` 只出现在真正需要浏览器能力或状态的组件，页面的元数据与静态内容保持在服务端。

---

## 三、模块划分与职责

### 数据层

| 模块 | 职责 | 关键点 |
| --- | --- | --- |
| `lib/db.ts` | 打开数据库、声明 schema、执行版本迁移 | 单例 Promise；`blocking` 时主动让路；`terminated` 时重置连接 |
| `lib/memories-repo.ts` | 记忆与情绪记录的增删改查、批量写入、清空、存储用量 | 统一 `toStorageError` 把底层错误翻译成产品语言 |
| `lib/moodbox-store.ts` | 全局数据快照 + 订阅 | `useSyncExternalStore`，`getServerSnapshot` 固定返回同一常量，杜绝 hydration mismatch |
| `lib/export-import.ts` | 导出结构构建、严格校验、合并导入 | 手写校验器，宁可报错也不写半截脏数据 |
| `lib/stats.ts` | 日历聚合、月度统计 | 纯函数，无副作用，可直接单测 |
| `lib/stories-repo.ts` | 故事的增删改查 | 排序按 `createdAt` 倒序，同毫秒退化按 `id`，保证顺序稳定 |
| `lib/square-repo.ts` | 帖子 CRUD、审核、拥抱、回复 | `createPost` 硬编码 `status:'pending'`，不接受调用方指定状态 |
| `lib/letters-repo.ts` / `lib/bursts-repo.ts` | 心事信件 / 被捏碎的球 | bursts 用 `emotionId` 作主键，天然幂等 |
| `lib/backend/*` | 内容后端的接口契约、本地实现、REST 实现、工厂 | 页面只认 `ContentBackend`，切换后端不改组件 |
| `lib/content-stores.ts` | 泛型 `ListStore<T>` + 四个内容 store | 与 `moodBoxStore` 同一套 `useSyncExternalStore` 写法，`getServerSnapshot` 返稳定常量 |
| `lib/theme.ts` | 主题偏好读写、解析、首帧脚本 | 纯函数 + 一段内联脚本，可单测 |
| `lib/admin.ts` | 演示口令与解锁态 | 只写 `sessionStorage`；注释与界面都声明"这不是权限系统" |
| `lib/crisis.ts` | 自伤倾向识别与求助资源 | 正则匹配，只返回标记，绝不改动用户文字 |
| `lib/tools.ts` | 导航入口的唯一数据源 | 桌面底部、移动端顶部、页脚三处共用一份 |

### 展示层

| 模块 | 职责 |
| --- | --- |
| `EmotionSky` | 按数据层坐标铺排球体，管理「选中 / 变暗 / 退场」三种整体状态 |
| `EmotionOrb` | 单颗球的材质、浮动、悬停、无障碍标签 |
| `EmotionPanel` | 陪伴文案切换、情绪打卡、支持提示 |
| `ComfortExperience` | “我不开心了”的独立场景：暖色背景、星光、随机回忆纸条、空状态 |
| `MemoriesView` | 按月分组的时间线、表单/详情/删除确认的编排、保存后的星屑反馈 |
| `CalendarView` | 月视图 + 当日详情 + 统计的组合，共享同一份 store 数据 |
| `DataSettings` | 导出、导入、演示数据、清空、存储用量、隐私说明 |
| `AudioPlayer` | 挂载于根布局，跨页播放不中断 |
| `JarView` | 玻璃罐 + 纸条网格（罐身是 CSS 渐变，不是图片），最多展示 18 张，超出提示「还有 N 份」 |
| `LettersView` / `CapsuleView` | 三个状态（写 → 封存 → 拆开）的卡片流；时光信箱额外用 `openAt` 卡住拆阅 |
| `WeeklyView` / `BreatheView` / `QuizView` | 三个只用纯函数计算的小工具：周统计、呼吸节奏、六题映射 |
| `StoriesView` | 主题筛选 + 卡片网格 + 阅读弹层 + 管理员表单 |
| `SquareView` | 发帖、待审核分区（仅管理员）、广场列表、拥抱/回复、自伤提示弹层 |
| `AdminBar` | 解锁入口与口令弹层，能力说明由调用方传入 |
| `HomeDock` / `MobileToolRail` | 桌面底部三簇导航 / 移动端顶部横向轨道，共用 `tools.ts` |

### 交互基础设施

| 模块 | 职责 |
| --- | --- |
| `useOverlayBehavior` | 滚动锁定、Esc、焦点陷阱、焦点归还（Dialog 与情绪面板共用） |
| `useBlobUrl` | Blob → object URL，按 Blob 做 `WeakMap` 缓存 |
| `useAmbientAudio` | 播放状态机、淡入淡出、偏好持久化、音源缺失处理 |
| `useMoodBox` | 挂载时触发一次幂等初始化，返回快照 |

---

## 四、主要数据结构

```ts
type EmotionId =
  | 'anxiety' | 'sadness' | 'loneliness' | 'emo' | 'joy' | 'pain'
  | 'fear' | 'exam' | 'irritation' | 'exhaustion' | 'worry';

interface Emotion {
  id: EmotionId;
  label: string;            // 焦虑
  latin: string;            // Anxiety
  whisper: string;          // 一句话描摹
  palette: { light; mid; deep; glow; ink };
  placement: {
    desktop: OrbPlacement;  // x/y 百分比 + 缩放 + 周期 + 漂幅
    mobile?: OrbPlacement;  // 省略 = 移动端不展示
  };
  messages: readonly string[];  // ≥15 条
  supportNote?: string;         // 强烈负面情绪的现实支持提示
}

interface Memory {
  id: string;
  date: string;        // yyyy-MM-dd（本地时区）
  title: string;
  content: string;
  mood: MemoryMoodId;  // warm / joyful / moved / calm / proud / amused / hopeful / safe
  image?: { blob: Blob; type: string; width: number; height: number };
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
  isDemo?: boolean;    // 演示数据标记，界面必须显示「示例」
}

interface EmotionLog {
  id: string;
  emotionId: EmotionId;
  date: string;        // yyyy-MM-dd
  createdAt: string;   // ISO
  isDemo?: boolean;
}

/* ---------------- 内容层（第二轮） ---------------- */

type StoryTheme = 'warmth' | 'company' | 'courage' | 'rest' | 'growth' | 'night';

interface HealingStory {
  id: string;
  title: string;
  content: string;
  theme: StoryTheme;
  author: string;      // 默认「匿名整理」
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;    // 内置 6 篇带此标记，界面显示「内置」
}

type PostStatus = 'pending' | 'approved' | 'rejected';

interface SquarePost {
  id: string;
  content: string;
  nickname: string;    // 默认「匿名的人」
  createdAt: string;
  status: PostStatus;  // 新建永远是 pending
  hugs: number;
  replies: SquareReply[];
  reviewedAt?: string;
  needsSupport?: boolean;  // 命中自伤关键词；只提示管理员，不影响可见性
  isDemo?: boolean;
}

interface SquareReply {
  id: string;
  nickname: string;
  content: string;
  createdAt: string;
  needsSupport?: boolean;
}

interface HeartLetter {
  id: string;
  content: string;
  createdAt: string;
  sealedAt?: string;   // 封存
  openedAt?: string;   // 拆开
}

interface TimeCapsule {
  id: string;
  content: string;
  createdAt: string;
  openAt: string;      // yyyy-MM-dd，到期前不可拆
  openedAt?: string;
}
```

内容后端的接口契约（`lib/backend/types.ts`）：

```ts
interface ContentBackend {
  readonly mode: 'local' | 'http';
  listStories(): Promise<HealingStory[]>;
  createStory(draft: StoryDraft): Promise<HealingStory>;
  updateStory(id: string, draft: StoryDraft): Promise<HealingStory>;
  deleteStory(id: string): Promise<void>;
  listPosts(): Promise<SquarePost[]>;
  createPost(draft: PostDraft): Promise<SquarePost>;
  setPostStatus(id: string, status: PostStatus): Promise<SquarePost>;
  deletePost(id: string): Promise<void>;
  hugPost(id: string): Promise<SquarePost>;
  addReply(postId: string, draft: ReplyDraft): Promise<SquarePost>;
  deleteReply(postId: string, replyId: string): Promise<SquarePost>;
  listLetters(): Promise<HeartLetter[]>;
  createLetter(content: string): Promise<HeartLetter>;
  openLetter(id: string): Promise<HeartLetter>;
  deleteLetter(id: string): Promise<void>;
  listCapsules(): Promise<TimeCapsule[]>;
  createCapsule(content: string, openAt: string): Promise<TimeCapsule>;
  openCapsule(id: string): Promise<TimeCapsule>;
  deleteCapsule(id: string): Promise<void>;
}
```

导出文件：

```json
{
  "format": "moodbox-export",
  "version": 1,
  "exportedAt": "2026-11-12T10:00:00.000Z",
  "memories": [{ "id": "...", "date": "...", "title": "...", "content": "...",
                 "mood": "warm", "image": { "dataUrl": "data:image/jpeg;base64,...",
                 "type": "image/jpeg", "width": 1600, "height": 1200 },
                 "createdAt": "...", "updatedAt": "...", "isDemo": false }],
  "emotionLogs": [{ "id": "...", "emotionId": "joy", "date": "...", "createdAt": "..." }]
}
```

---

## 五、数据持久化方案

### 写入路径

```text
UI 事件 → 组件调用 moodBoxStore.xxx()
        → memories-repo（校验 + 事务）
        → IndexedDB 落库
        → store 更新内存快照（排序后）
        → useSyncExternalStore 通知订阅组件重渲染
```

先写库再改内存，避免「界面成功、数据丢失」。写失败时抛出错误由调用方提示，快照保持原样。

### 排序与查询

- 记忆按 `date` 倒序，同日按 `createdAt` 倒序；
- 情绪记录按 `createdAt` 倒序；
- 日历聚合在内存中完成（数据量级为个人使用，O(n) 足够，无需额外索引）。

### 图片

- 选择 → `fileToMemoryImage`：`<img>` 解码 → canvas 等比缩放（最长边 1600）→ 白底 → `toBlob('image/jpeg', 0.82)`；
- 存 Blob 而非 base64：体积小约 1/3，且不会阻塞主线程；
- 展示：`useBlobUrl` + `WeakMap` 缓存；卸载时不 revoke（否则其他位置的同一张图会裂），由页面卸载统一回收；
- 导出：`blobToDataUrl`（优先 `arrayBuffer`，退化到 `FileReader`）按 32KB 分块转 base64。

### 版本升级

```ts
export const DB_VERSION = 2;

upgrade(db, oldVersion) {
  if (oldVersion < 1) { /* 建 memories / emotionLogs 与索引 */ }
  if (oldVersion < 2) {
    /* 建 stories / posts / letters / capsules / bursts */
    /* 同一次升级里写入内置故事与示例帖子 */
  }
}
```

新增字段不需要迁移（对象仓库存的是文档），新增索引/仓库需要 `DB_VERSION + 1` 并追加分支。旧用户打开时会按版本顺序补齐，数据不丢。

**为什么种子数据写在迁移里**：写进 `upgrade` 意味着它只发生一次。如果改成"每次启动检查故事是否为空、空就补"，用户删光内置故事后下次打开会发现它们全回来了 —— 那是个会被当成 bug 的行为。

### 内容层与数据的两种来源

内容类数据（故事 / 帖子 / 信件 / 时光）不与"个人记录"混在一起，它们走一层接口：

```text
页面组件
  └─ content-stores.ts（ListStore<T> 泛型 + useSyncExternalStore）
       └─ getContentBackend()
            ├─ NEXT_PUBLIC_MOODBOX_API_BASE 未设置 → localBackend（IndexedDB）
            └─ 已设置                          → createHttpBackend（REST）
```

- 页面代码只认 `ContentBackend` 接口，**切换后端不需要改任何组件**；
- `localBackend` 内部转调 `stories-repo` / `square-repo`，与第一轮的记忆仓储是同一套写法（事务 + `toStorageError` 翻译）；
- `createHttpBackend` 的契约写在文件顶部注释里：路径、方法、`Authorization: Bearer <token>`、204 空 body 的处理。它带着完整的错误分支（非 2xx 抛 `BackendRequestError` 并带状态码、未配置地址抛 `BackendNotConfiguredError`），不是跑不通的占位符；
- 单测用注入的 `fetchImpl` 覆盖了这套契约，将来接真后端时两边不会对不上。

### 审核状态机

帖子只有三种状态，且入口被卡死：

```text
createPost(draft)  →  status: 'pending'（硬编码，不接受外部传值）
                       ↓ 管理员「放到广场」      ↓ 管理员「不放出去」
                    'approved'               'rejected'
                       ↓ 管理员删除
                    （记录移除）
```

`needsSupport` 是发帖时由 `scanForCrisis()` 算出的标记，只在管理员视图里显示一个小标签「包含需要留意的表达」。**它不影响审核结果，也不改变帖子的可见性** —— 命中的内容同样可以先发出去，识别的作用是提示「这里可能需要人看一眼」，而不是自动打回。

---

## 六、页面交互流程

### 1. 首页情绪球 → 陪伴

```text
进入首页
  ├─ EmotionSky 入场（11 球依次出现，CSS 持续漂浮）
  └─ 点击某颗球
       ├─ 该球 scale↑、其余 opacity↓ / blur
       ├─ EmotionPanel 从底部（移动端）/中央（桌面）升起
       ├─ 面板背后出现该情绪色的模糊光晕
       ├─ 显示第 1 条文案（后续点击「再给我一点温暖」在未出现的文案中抽取）
       ├─ 可选「记录此刻的情绪」→ 写入 emotionLogs → 显示「已收进今天的情绪里」
       └─ 关闭（X / Esc / 点遮罩 / 我感觉好一点了）→ 球恢复、焦点归还
```

### 2. 收藏一份快乐

```text
快乐收藏馆 →「收藏一份快乐」
  → 表单（日期 / 标题可空 / 内容必填 / 心情标签 / 可选图片）
  → 校验（日期合法、内容非空）
  → 图片压缩（如有）
  → 写入 IndexedDB
  → 关闭弹层 + 星屑 + Toast「这份快乐，已经被好好收藏起来了。」
  → 时间线按月重新分组
```

标题留空时自动取内容的第一个短句（按中文标点切分，不超过 18 字），降低记录门槛。

### 3. 我不开心了

```text
首页「我不开心了」
  → 情绪天空退场（scale 0.965 / opacity 0.30）
  → 暖色渐变覆盖层 + 星光渐显
  → 三行短句依次出现
  → 从「非演示记忆」中随机取一条
       ├─ 有：纸条卡片（胶带 + 轻微旋转）+「第 x / n 份快乐」
       │     ├─ 再看看另一份快乐（排除当前，`AnimatePresence` 交叉切换）
       │     └─ 查看全部快乐收藏 → /memories
       └─ 无：空状态 +「收藏第一份快乐」→ /memories?compose=1（自动打开表单）
             + 两张明确标注「示例 · 不是你的记录」的示例纸条
  → 回到情绪空间
```

### 4. 情绪日历

```text
/calendar
  → 读取 emotionLogs + memories，构建 Map<dateKey, {emotions, memoryCount}>
  → 月视图渲染（周一开头，固定格高，今天下划线，选中淡紫底）
  → 点击日期 → 下方/右侧当日详情（情绪 chips 可删除、记忆可打开）
  → 「在这天记一件开心事」→ 表单预设该日期
  → 右侧统计：本月记录天数 / 快乐记忆 / 情绪次数 / 最常出现 + 情绪分布 + 近七日
```

### 5. 捏爆一颗情绪球

```text
点击球 → 面板升起
  → 点「捏爆它」
       ├─ 面板立刻退场（不等动画）
       ├─ 球体：scale 1→1.26→0.2，opacity 1→1→0（times 0/0.32/1）
       ├─ 同时散出 14 片固定种子碎片 + 一圈扩散光环
       ├─ onAnimationComplete → setBurstingId(null) → moodBoxStore.burst(id)
       │     ├─ 写 bursts 仓库（keyPath: emotionId）
       │     └─ 快照刷新 → EmotionSky 不再渲染这一颗
       └─ Toast「碎了。那股劲儿，散掉一点了吗？」
主页底部出现「N 颗球已经散去 · 让它们回来」
  → 点击 → restoreBursts() → 清空 bursts → 球全部回到天上
```

注意：球是从 `bursts` 快照里过滤掉的，而 `bursts` 在**动画结束后**才写入。所以动画期间球只是 `aria-hidden`（从无障碍树里消失），DOM 还在 —— 这样碎片才有地方飞。

### 6. 树洞广场：发帖 → 审核 → 可见

```text
访客 /square →「写一条」→ 输入内容
  → scanForCrisis(content)
       ├─ 命中：弹「你写的这些，让我有点担心你」（含三个真实热线）
       │     ├─「先不给别人看」→ 什么都不写，回到编辑态
       │     └─「仍然发出去」 → 继续
       └─ 未命中：直接继续
  → squareStore.publish({ content, nickname, needsSupport })
  → status: 'pending'（硬编码）
  → Toast「发出去了。它会先经过一次审核…」
  → 广场列表里看不到它（访客只渲染 approved）

管理员 →「管理员入口」→ 口令 → sessionStorage 标记
  → 页面出现「待审核」分区（只有管理员能看见）
  →「放到广场」→ setPostStatus(id,'approved') + reviewedAt
  → 广场列表出现这条
  → 或「不放出去」→ 'rejected'（留档但不展示）
  → 或「删除」→ 确认后移除
```

### 7. 主题切换

```text
首次访问
  → <head> 内联脚本：localStorage 有 day/night 就用它，否则读 prefers-color-scheme
  → 立刻写 document.documentElement.dataset.theme（先于任何绘制）

点页头太阳/月亮
  → useTheme().toggle() → 以当前"生效主题"取反 → 写 localStorage
  → applyTheme() 改 data-theme + 同步 <meta name="theme-color">
  → 全站颜色变化（CSS 变量 + .mb-only-day/.mb-only-night），React 不重渲染

系统偏好变化（且用户选的是 auto）
  → matchMedia('(prefers-color-scheme: dark)') 的 change 事件 → 重新解析
```

---

## 七、性能设计

| 风险 | 处理 |
| --- | --- |
| 每帧 React 重渲染 | 漂浮/呼吸用 CSS keyframes，只改 `transform`；React 不参与逐帧计算 |
| 悬停时新增滤镜 | 柔光层常驻 DOM，仅切换 `opacity` |
| 大背景模糊 | 用径向渐变模拟光晕，而不是 `filter: blur()` 大图层 |
| 移动端开销 | 少 4 颗球、模糊半径降低、噪点透明度降低 |
| 图片体积 | 上传时压缩（≤1600px / JPEG 0.82） |
| 列表重渲染 | 单例 store + 稳定快照；卡片 memo 化收益不大时不做过度优化 |
| 动画卸载 | 星屑 2.1s 后自移除；`AnimatePresence` 负责退出；音频卸载时 `pause()` 并清空 `src` |

---

## 八、错误处理与边界

| 场景 | 行为 |
| --- | --- |
| 不支持 IndexedDB / 无痕模式 | store 进入 `unavailable`，页面显示说明与重试，不假装保存成功 |
| 存储配额不足 | 捕获 `QuotaExceededError` → Toast「存储空间不足，试试删除一些旧记忆或缩小图片」 |
| 导入文件损坏 / 格式不符 | `ImportError` 给出具体原因（不是备份文件 / 版本不兼容 / 第 n 条日期不合法） |
| 导入与现有数据冲突 | 同 id 比较 `updatedAt`，较新的覆盖、较旧的跳过，返回准确的导入统计 |
| 音频 404 | 播放器进入 `missing` 状态，显示文件放置路径，其余功能不受影响 |
| 自动播放被拦截 | 提示「浏览器拦截了自动播放，请再点一次音乐按钮」 |
| 图片解码失败 | Toast 提示换一张，不写入脏数据 |
| 页面 404 | 独立的柔和空页面，带返回入口 |

---

## 九、可扩展点

1. **新增情绪**：在 `EMOTION_IDS` 加 id → `data/emotions.ts` 补一条配置（含文案、`stories` 与坐标，文案条数同步写进 `MIN_MESSAGES_BY_EMOTION`）→ 球体、面板、日历标记、统计、情绪测试的映射表自动适配，组件代码零改动。
2. **新增记忆心情标签**：`data/moods.ts` 增加一项即可，表单与卡片自动出现。
3. **新增导航入口**：`lib/tools.ts` 的 `TOOL_ITEMS` 加一条（`kind` 选 `route` / `overlay` / `action`）—— 桌面顶部导航与移动端「更多」面板会同时出现它，不需要改两处。
4. **接云端内容服务**：设置 `NEXT_PUBLIC_MOODBOX_API_BASE`，按 `lib/backend/http.ts` 顶部的契约实现 REST 服务即可，页面零改动。上线前必须把**审核与自伤识别搬到服务端**。
5. **换成真实权限**：`lib/admin.ts` 是唯一的口令来源，把它替换成一个会话/角色接口，`AdminBar` 与两处 `isAdmin` 判断都不用动。
6. **云端同步个人记录**：`memories-repo` 是个人记录的唯一出入口，替换其实现（或增加同步队列）即可，UI 层无需改动。
7. **新增数据库结构**：`DB_VERSION + 1` 并追加 `if (oldVersion < N)` 分支；种子数据若只应出现一次，就写在迁移里。
8. **新增页面**：沿用 `PageShell` + `useMoodBox` / `useStories`，风格与数据自动一致；顶部导航会自动高亮当前路由。

---

## 十一、第三轮的结构变化（卡片化 / 单条导航）

这一轮没有改数据层，改的是「功能放在哪里」：

### 1. 路由从 12 个收敛到 7 个

下线了 `/jar`、`/letters`、`/stories`、`/time-capsule`、`/memories` 五个页面。
其中 `/jar` + `/memories` 合并成「开心罐卡片」，`/letters` 变成「心事信箱卡片」，
`/stories` 只剩面板里的阅读入口，`/time-capsule` 直接删除（含 `TimeCapsule` 数据模型的使用入口）。

### 2. 卡片宿主：`ToolOverlayProvider`

```text
app/layout.tsx
  └─ ThemeProvider → MotionPreferences → ToastProvider → ClearDataProvider
       └─ ToolOverlayProvider          ← 新增：卡片功能的宿主
            ├─ SiteHeader（TopToolBar / MoreMenu 调 openTool）
            ├─ {children}（/calendar、/weekly 也能调 openTool）
            ├─ JarOverlay      ← activeTool === 'jar'
            └─ LettersOverlay  ← activeTool === 'letters'
```

它是唯一持有「当前打开哪张卡片」的地方，所以任何页面都能把罐子叫出来，
而不是先跳回首页。`lib/tools.ts` 里 `kind: 'overlay'` 的入口就是走这条路径。

### 3. 统一的卡片外壳：`ui/glass-sheet.tsx`

一层 `backdrop-blur-[16px]` 的毛玻璃 + 一团 `blur-[100px]` 的彩色光晕 + 中间的圆角卡片。
卡片有两种材质：
- `tone="deep"`：深灰紫（`#3f385c → #221e34`），文字恒为白色 —— 情绪面板用它；
- `tone="glass"`：跟随主题的磨砂玻璃 —— 开心罐、心事信箱用它，因为里面还有表单和列表。

内部再开的弹层（收藏表单、确认框）把 `Dialog` 的 `z-index` 抬到 100，高于卡片的 90。

### 4. 捏爆的时序变了

```text
点「捏爆它」 → 面板退场 → 球播放碎裂（~1s）→ 写 bursts
   → setTimeout 6s → restoreBurst(id) → 球回到天空
```

`moodbox-store` 因此多了一个 `restoreBurst(emotionId)`（单颗复原），
`restoreBursts()`（全部复原）保留给「清空数据」之外的极端场景。
因为会自动回来，主页不再渲染「N 颗球已经散去 · 让它们回来」。

### 5. 第四轮：周报并入足迹

- `/weekly` 路由与 `WeeklyView` 页面删除，逻辑搬进 `components/weekly/weekly-summary.tsx`（`WeeklySummary`），
  在 `calendar-view.tsx` 的底部渲染；它自己不再有页头，标题降为 `h2 这一周`；
- `StatsPanel` 里重复的「Last 7 Days」小图删除，月统计卡只剩本月口径；
- `lib/tools.ts` 从 9 项减到 8 项（`kind: 'route'` 的链接从 6 个减到 5 个）；
- 页头从两行改为一行：`TopToolBar` 放进 `SiteHeader` 的同一 flex 行，`flex-1` 居中，
  1024–1279px 只显示图标；页面 `pt` 由 152px 收到 104px，天空起点由 112px 收到 80px。

---

## 十二、树洞广场接入 Supabase

### 只替换了数据源，没有动页面

这一层的价值在这一轮被验证了：`ContentBackend` 当初只是为了"将来可能上云"而抽象，
真正接 Supabase 时，**UI 与 store 一行代码都没改**，新增的只有一个实现文件。

```text
lib/backend/
├── types.ts        ContentBackend 契约（mode: local | supabase | http）
├── local.ts        IndexedDB（原样保留）
├── supabase.ts     ★ 新增：广场走 RPC，其余方法透传给 localBackend
├── http.ts         自建 REST（预留，未变）
└── index.ts        ★ 改这里：按环境变量选实现
```

`supabaseBackend` 是**混合**的：它只接管 `listPosts / createPost / setPostStatus /
deletePost / hugPost / addReply / deleteReply`，剩下十个方法直接引用 `localBackend` 的函数。
这样"心事信箱和开心罐不能上云"就不是一句文档承诺，而是类型层面的事实。

```text
getContentBackend()
  ├─ isSupabaseConfigured() → createSupabaseBackend({ getToken: readAdminToken })
  ├─ NEXT_PUBLIC_MOODBOX_API_BASE → createHttpBackend()
  └─ 否则 → localBackend
```

### 为什么客户端一次都不直接读表

最省事的做法是给 `square_posts` 加 `for insert to anon with check (true)`。
但它有两个致命问题：客户端可以自己写 `status = 'approved'`（审核消失）；
再加上 `for update` 之后，任何人都能改别人的心事和拥抱数。

所以：**三张表开启 RLS 且零策略**（anon 对表零权限），读写全部收进
`security definer` 函数，函数内部按动作分别校验。

```text
browser (anon)
   │ rpc('moodbox_square_create', { p_content, p_nickname })
   ▼
moodbox_square_create()          security definer，以 owner 身份运行
   │  - 校验长度
   │  - status 写死 'pending'（不接受客户端传参）
   │  - 生成 id
   ▼
square_posts                     RLS on, 0 policies  →  anon 直连 = 拒绝
```

| 函数 | 权限模型 |
| --- | --- |
| `moodbox_square_list(p_token)` | 返回 `approved`；`p_token` 命中才返回待审核 |
| `moodbox_square_create` | 任何人；`status` 固定 `pending` |
| `moodbox_square_hug` / `moodbox_square_reply` | 任何人；只对 `approved` 生效 |
| `moodbox_square_review` / `_delete` / `_delete_reply` | 必须 `moodbox_is_admin(p_token)` |
| `moodbox_admin_check(p_token)` | 只回 boolean，不泄露别的 |

### 管理员从"界面遮罩"变成真的边界

`lib/admin.ts` 的 `unlockAdmin` 现在是 `async`：

```ts
if (backend.verifyAdmin) ok = await backend.verifyAdmin(token);   // 云端：问服务端
else                     ok = token === DEMO_ADMIN_PASSCODE;      // 本地：自己比
```

令牌本身也换了语义：以前存的是 `'1'`（一个布尔标记），现在存的是**口令原值**，
因为它要被当作 `p_token` 发给数据库函数。存 sessionStorage 而不是 localStorage，
关掉标签页即失效。`AdminBar` 的文案会跟着 `serverVerified` 变 —— 本地模式必须承认
"可以绕过"，云端模式才敢说"绕不过去"。

### 时序：解锁后必须重新拉列表

待审核的帖子只有带对令牌才会从 `moodbox_square_list` 返回，所以：

```text
点「管理员入口」→ rpc moodbox_admin_check → 写入令牌 → useAdmin 状态变化
   → SquareView 的 useEffect 侦测到 isAdmin 变化 → squareStore.reload()
```

第一次渲染时跳过（`useRef`），否则会和 `init()` 重复拉一次。

### v3 迁移：清掉本机残留的帖子

```ts
if (oldVersion < 3) {
  if (isSupabaseConfigured()) void tx.objectStore('posts').clear();
}
```

条件判断的理由：没配 Supabase 的人仍是纯本地模式，`posts` 是唯一副本，不能动。

⚠️ **踩到的坑**：一开始写成了 `await db.clear('posts')`。升级回调里一旦出现 `await`，
版本变更事务就不再是"当前事务"，后续 `db.transaction` 会抛
`A version change transaction is running` —— 表现是整个 IndexedDB 打不开。
正确写法是在回调第 4 个参数（`tx`）上**同步**发请求。
这个 bug 只在"配了 Supabase"时才会触发，所以本地模式的 e2e 全绿也发现不了，
是靠"用假配置真跑一遍"抓到的。

### 错误翻译

`translateSupabaseError()` 把 PostgREST 的错误码映射成能操作的提示：

| 错误 | 提示 |
| --- | --- |
| `PGRST202` / function does not exist | 先执行 `supabase/schema.sql` |
| `42P01` / relation does not exist | 表还没建，先执行 schema |
| `42501` / permission denied | 口令没通过，或策略没配好 |
| `P0001` | 函数里 `raise exception` 的原文直接透传 |
| Failed to fetch | 连不上 / 项目被暂停 |
