# 把树洞广场接到 Supabase

> 这份文档只讲一件事：**让「树洞广场」的帖子和回复存到 Supabase，别的功能不动。**
> 跟着做大约 10 分钟，不需要写任何后端代码。

---

## 一、先明确这次接的是什么

| 内容 | 现在存在哪 | 接完之后 |
| --- | --- | --- |
| 树洞广场（帖子、回复、拥抱、审核） | 浏览器 IndexedDB | **Supabase（云端）** |
| 心事信箱 | 浏览器 IndexedDB | 不变，仍在本机 |
| 开心罐 / 快乐记忆 / 情绪记录 | 浏览器 IndexedDB | 不变，仍在本机 |
| 内置治愈故事 | 浏览器 IndexedDB | 不变，仍在本机 |

**为什么只把广场上云？** 广场是唯一「多人共享」的内容 —— 你写的帖子要能被别人看到，就注定不能只存在你的浏览器里。心事信箱和开心罐是私密内容，上云的前提是先有真正的登录体系，那是另一个量级的工程。

接上之后，广场的数据会跨设备、跨浏览器共享；即使在无痕窗口里也能正常读写（因为不再依赖本地数据库）。

---

## 二、四步接入

### 第 1 步：建一个 Supabase 项目

1. 打开 <https://supabase.com>，用 GitHub 或邮箱注册（免费版够用）。
2. 点 **New project**：
   - **Name**：`moodbox`（随意）
   - **Database Password**：随便设一个强密码，**记下来**（后面基本用不到，但重置要用）
   - **Region**：选 **Southeast Asia (Singapore)** —— 国内访问延迟最低
3. 等 1～2 分钟，项目初始化完成。

> 免费版项目如果连续 7 天没有任何请求会被暂停（pause）。比赛演示前建议先打开控制台点一下，把它唤醒。

### 第 2 步：拿到两个值

左侧 **Project Settings（齿轮）→ API**：

| 界面上叫什么 | 对应环境变量 |
| --- | --- |
| **Project URL**（形如 `https://abcdefghijkl.supabase.co`） | `NEXT_PUBLIC_SUPABASE_URL` |
| **Project API keys → `anon` `public`**（一长串 `eyJ...`） | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

⚠️ **不要用 `service_role` key。** 那个 key 会绕过所有权限策略，一旦被打进前端包，等于把数据库交给任何人。本项目只需要 `anon`。

### 第 3 步：建表 + 建函数

左侧 **SQL Editor → New query**，把仓库里 `supabase/schema.sql` 的**全部内容**粘进去，点 **Run**。

脚本是幂等的，重复执行不会报错，也不会清掉已有数据。它做了这些事：

- 建两张表：`square_posts`（帖子）、`square_replies`（回复）；
- 建一张私有表 `moodbox_config`，用来存管理员口令；
- 三张表全部开启 RLS 且**不建任何策略** —— 也就是浏览器身份（`anon`）对表本身没有任何直接读写权限；
- 建一组 `moodbox_*` 函数，所有读写都只能走函数；
- 把函数开放给 `anon` 调用。

**紧接着改掉管理员口令**（同一个 SQL Editor 里再跑一次）：

```sql
update public.moodbox_config
   set value = '你自己定一个不少于 8 位的口令'
 where key = 'admin_token';
```

这个口令是树洞审核的凭据。它只存在数据库里，前端拿不到，也绕不过去。

### 第 4 步：填环境变量并重新构建

在项目根目录建 `.env.local`（这个文件已被 `.gitignore` 忽略，不会提交）：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
```

然后：

```bash
npm run build && npm start -- -p 3107
```

> **必须重新构建，只重启不够。** `NEXT_PUBLIC_*` 是在**构建时**内联进 JS 包的常量，`npm run dev` / `npm start` 不会重新读取它们。改了环境变量却不重新 build，是最常见的"我明明配了但它还是本机模式"的原因。
>
> 开发时用 `npm run dev` 则不需要手动 build（dev 会自己重编），但改完环境变量要重启 dev 进程。

---

## 三、怎么确认真的接上了

### 1. 看页面

打开 `/square`，标题下面那行小字会从

> 仅保存在本机浏览器 · 广场内容存在这台设备的 IndexedDB 里……

变成

> **树洞广场已接入 Supabase** · 帖子存在云端项目 `abcdefghijkl`；心事信箱与开心罐仍然只在这台设备上。

### 2. 看数据

发一条帖子 → 到 Supabase **Table Editor → square_posts** 刷新，应该能看到这行记录，且 `status = pending`。

### 3. 用两个浏览器验证

Chrome 发帖 → 换 Firefox / 手机打开同一页面 → 审核通过后两边都能看到同一批帖子。这一步能证明数据真的在云端。

### 4. 验证权限真的收紧了

在浏览器控制台跑（`YOUR_URL` 换成你的 Project URL，`YOUR_ANON` 换成 anon key）：

```js
await fetch('YOUR_URL/rest/v1/square_posts?select=*', {
  headers: { apikey: 'YOUR_ANON' }
}).then(r => r.status);
// 期望：401 或 403 —— 说明直接读表被拒绝了，只能走函数
```

---

## 四、安全模型：为什么客户端一次都不直接读表

这是这次接入里最值得说明的设计。

**如果按"最简单的做法"**：给 `square_posts` 加一条策略 `for insert to anon with check (true)`。确实能跑起来，但立刻有两个漏洞：

1. 插入时客户端可以自己指定 `status = 'approved'` —— 审核形同不存在；
2. 再加一条 `for update to anon using (true)` —— 任何人都能改掉别人的心事、把 `hugs` 改成 99999。

**所以这里做的是**：

```text
浏览器 (anon)
   │  rpc('moodbox_square_create', { p_content, p_nickname })
   ▼
security definer 函数（以 owner 身份运行）
   │  自己决定 status = 'pending'
   ▼
square_posts  ← RLS 开启，anon 零策略 = 零权限
```

具体到每个动作的校验：

| 动作 | 函数 | 谁可以做 |
| --- | --- | --- |
| 读列表 | `moodbox_square_list(p_token, p_visitor)` | 所有人，但只返回 `approved`；带对令牌才返回待审核的；`p_visitor` 只用来给每条记录打 `mine` |
| 发帖 | `moodbox_square_create(..., p_visitor, p_region)` | 所有人，`status` 在函数里写死为 `pending` |
| 抱一下 | `moodbox_square_hug` | 所有人，但只对 `approved` 生效 |
| 回复 | `moodbox_square_reply(..., p_visitor, p_region)` | 所有人，但只能回复 `approved`；正文上限 200 字 |
| 审核 | `moodbox_square_review(..., p_token)` | 口令必须等于 `moodbox_config.admin_token` |
| 删帖 / 删回复 | `moodbox_square_delete*` | 同上 |
| 删自己的帖 | `moodbox_square_delete_own(p_id, p_visitor)` | 所有人，但只认 `visitor_hash` 匹配的那一条，**不要求口令** |
| 删自己的回复 | `moodbox_square_delete_own_reply(..., p_visitor)` | 同上 |
| 校验口令 | `moodbox_admin_check(p_token)` | 所有人，只回 `true/false` |

两个 `delete_own` 是访客自删的唯一入口：比对的是 `moodbox_visitor_hash(p_visitor)` 与行上存的 `visitor_hash`，
不匹配直接报「这条帖子不是你发的」。返回给客户端的列表里 `visitorId` 一律被剥掉，只留 `mine` 布尔 ——
**即使有人改前端把 `mine` 改成 `true`，服务端也不会认。**

于是：**管理员那层从"界面遮罩"变成了真的权限边界。** 你可以在浏览器里手改 sessionStorage，界面会显示管理员按钮，但一点审核就会收到 `管理员口令不对`。

---

## 五、代码在哪儿

只动了一个位置：`src/lib/backend/`。

```text
src/lib/
├── supabase-config.ts        # 读两个环境变量、判断是否配置完整
├── admin-token.ts            # 管理员令牌的存取（sessionStorage）
├── admin.ts                  # 解锁：Supabase 模式问服务端，本地模式比对演示口令
├── backend/
│   ├── types.ts              # ContentBackend 契约（mode: local | supabase | http）
│   ├── local.ts              # IndexedDB 实现
│   ├── supabase.ts           # ★ 本次新增：广场走 RPC，其余透传给 local
│   └── index.ts              # ★ 改这里：按环境变量选实现
supabase/
├── schema.sql                # ★ 建表 + 函数 + 权限
└── reset-square.sql          # 清空广场数据
```

`lib/backend/index.ts` 的选择逻辑：

```ts
if (isSupabaseConfigured()) return createSupabaseBackend({ getToken: readAdminToken });
if (apiBase)               return createHttpBackend({ baseUrl: apiBase });
return localBackend;
```

`isSupabaseConfigured()` 校验得比"非空"严格：URL 必须长得像 `https://xxx.supabase.co`，key 长度必须超过 40。所以环境变量贴错、只复制了一半，会被当成"没配"，安静地退回本地模式，而不是让用户对着一堆网络错误发呆。

**页面的代码一行都没改。** 这说明当初那层 `ContentBackend` 抽象是值得的：换存储介质不需要动 UI。

---

## 六、旧数据怎么处理的

按约定，接入时把旧的广场数据清掉：

| 位置 | 处理 |
| --- | --- |
| 代码里的 3 条示例帖子 | **已删除**（`src/data/square.ts` 整个文件移除），以后不再自动写入 |
| 浏览器里已存的帖子 | 打开页面时由 IndexedDB v3 迁移**自动清空一次**，见下 |

`src/lib/db.ts` 的 v3 迁移：

```ts
if (oldVersion < 3) {
  // 只在真的配置了 Supabase 时清空 —— 纯本机模式的数据不能动，那是唯一副本
  if (isSupabaseConfigured()) await db.clear('posts');
}
```

这个条件判断是有意为之：如果你只是打开旧版本、并没有配环境变量，你的本地帖子不会被清掉。

云端那边如果也想从零开始（比如你已经试发了几条），到 SQL Editor 跑：

```sql
-- supabase/reset-square.sql
truncate table public.square_replies, public.square_posts;
```

---

## 七、常见问题对照表

| 现象 | 原因 | 怎么修 |
| --- | --- | --- |
| 页面仍显示"仅保存在本机浏览器" | 环境变量没生效 | 确认文件名是 `.env.local`、变量名完全一致，然后 **重新 `npm run build`** |
| 提示"Supabase 里还没创建 moodbox_* 函数" | schema.sql 没跑，或跑在别的 schema 里 | 在 SQL Editor 重跑 `supabase/schema.sql`，确认输出 Success |
| 提示"管理员口令不对"，但确信输对了 | 库里存的是 `moodbox2026`，你输的是自己改过的 | `select * from moodbox_config;` 看一眼实际值，或重新 update 成你想要的 |
| 发帖后 Table Editor 里看不到 | 你看的是刷新前的快照 | 点 Table Editor 右上角刷新；或看是不是写到了别的项目 |
| 登录控制台显示项目 Paused | 免费版 7 天无请求自动暂停 | 控制台点 **Restore / Resume project** |
| 控制台报 CORS / `Failed to fetch` | 网络被拦，或 URL 写错（比如结尾多了斜杠、少了 `.supabase.co`） | 用 `curl YOUR_URL/rest/v1/` 试；应返回一段 JSON，不是超时 |
| 部署到 Vercel 后变回本机模式 | Vercel 里没加环境变量 | Settings → Environment Variables 加两个 `NEXT_PUBLIC_*`，然后 **Redeploy**（不是 Restart） |

---

## 八、部署到 Vercel 时

两个变量必须加在 **Settings → Environment Variables**，并且勾上 Production / Preview / Development 三个环境。加完一定要 **Redeploy** —— 因为 `NEXT_PUBLIC_*` 是构建期内联的，只 Restart 不会生效。

---

## 九、这套方案的已知边界

写在这里，免得答辩时被问住：

1. **没有身份体系。** 匿名访客可以无限发帖（虽然都要审核）。要防刷，得接 Supabase Auth 或加 IP 频率限制。
2. **拥抱可以刷。** 同一个浏览器可以反复抱同一条帖子，`moodbox_square_hug` 不去重。要去重得记录访客标识（fingerprint 或匿名 session id），那会引入"追踪用户"的问题，本项目的取舍是宁可被刷也不追踪。
3. **管理员是单一口令，不是账号体系。** 改口令需要进 SQL Editor。多人协作审核需要真正的后台账号。
4. **自伤识别仍在前端。** `lib/crisis.ts` 只做提示，不拦截。真正的防线应该是服务端在 `moodbox_square_create` 里再跑一遍关键词，命中时通知管理员 —— 现在的实现是把 `needs_support` 交给客户端判断，理论上可以绕过。
5. **没有实时推送。** 别人发的新帖需要刷新页面才看到。要实时只需在 Supabase 里开 Realtime 并订阅 `square_posts`。
6. **免费版有额度**：500MB 数据库、5GB 流量/月、项目闲置 7 天暂停。对一个比赛作品完全够用。

---

---

## 十、临时退回本机模式（离线演示 / 调试用）

配了 Supabase 之后，如果现场网络不通、或者只是想改样式不想每次发真实请求，
可以在**浏览器控制台**跑一句，然后刷新：

```js
localStorage.setItem('moodbox-force-local', '1');
```

恢复云端：

```js
localStorage.removeItem('moodbox-force-local');
```

效果：

- 这个浏览器会用本机 IndexedDB 读写广场，页面副标题也会如实变成「仅保存在本机浏览器」；
- **不影响别人**，也不削弱云端安全 —— 云端对帖子的保护在数据库的 RLS 与函数里，
  这个开关只决定"当前这个浏览器把数据写到哪"；
- 要记得关掉，否则你会以为自己在往云端发帖。

端到端测试默认就打开了这个开关（见 `playwright.config.ts` 的 `storageState`）：
这样不管开发者有没有配 Supabase，`npm run test:e2e` 跑的都是同一套断言。
云端那条链路由 `tests/unit/supabase.test.ts` 覆盖（打桩 RPC，不依赖网络）。

## 十一、一页速查

```bash
# 1. 建项目 → Settings/API 拿 URL + anon key
# 2. SQL Editor 跑 supabase/schema.sql
# 3. 改口令
#    update public.moodbox_config set value='你的口令' where key='admin_token';
# 4. 建 .env.local
#    NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# 5. 重新构建
npm run build && npm start -- -p 3107
```

打开 `/square`，页面副标题出现「树洞广场已接入 Supabase · 帖子存在云端项目 xxx」就成功了。
