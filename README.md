# 情绪盒子 MoodBox

> 让情绪有处安放，让快乐有迹可循。

一个安静的地方，用来放情绪和快乐。11 颗情绪球，点开是一段不说教的回应；小确幸收进开心罐，低落时再遇见。

**它不是心理测评，也不要求你「变好」。它更接近一个抽屉。**

---

## 功能

| 模块 | 一句话 |
| --- | --- |
| 情绪球 | 11 种情绪，点击得到一段陪伴；也可以捏爆，2 秒后自己飘回来 |
| 品读片刻 | 面板里就地换成一篇随笔，按作者排的次序翻 |
| 开心罐 | 把小事收成纸条，卡片内完成；备份从这里导出 |
| 心事信箱 | 写 → 封存 → 拆开 → 销毁，常驻求助热线 |
| 情绪足迹 | 手账式月视图，底部并入「这一周」 |
| 呼吸放松 | 4-4-6 舒缓 / 4-7-8 助眠，圆环随呼吸缩放 |
| 情绪测试 | 6 个问题，只给一个猜测，不写进任何记录 |
| 树洞广场 | 匿名短帖，先审核后展示；可拥抱、可回复；可选显示 IP 定位 |
| 白日 / 星空 | 跟随系统或手动锁定，组件完全同一套 |
| 背景音乐 | 不自动播放，可淡化、循环、跨页不断 |

---

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build && npm start   # 生产
npm run typecheck            # tsc --noEmit
npm run test                 # Vitest
npm run test:e2e             # Playwright（默认端口 3107）
```

Node.js ≥ 20。

**可选**：想让广场跨设备共享，配 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 后重新构建——这两个值是构建期内联的，只重启不生效。步骤见 [`SUPABASE.md`](./SUPABASE.md)，建表脚本在 `supabase/schema.sql`。不配也能完整运行，广场数据留在本机。

---

## 技术栈

Next.js 15（App Router） · React 19 · TypeScript（strict） · Tailwind CSS v4 · Motion · IndexedDB（idb） · Supabase（可选） · Vitest + Playwright

没有 UI 组件库、状态管理库和 CSS-in-JS：双主题靠一份 CSS 变量表。

---

## 页面

| 路由 | 页面 |
| --- | --- |
| `/` | 主页（情绪天空） |
| `/calendar` | 情绪足迹 |
| `/breathe` | 呼吸放松 |
| `/quiz` | 情绪测试 |
| `/square` | 树洞广场 |
| `/about` | 关于 |
| `/square/admin` | 管理员口令（页面上无入口） |

开心罐、心事信箱是浮在主页之上的卡片，不占路由；「设置」在同一张面板里管主题、音乐与清空数据。全站导航只有页头一处。

---

## 数据

- 快乐记忆、情绪记录、信件、捏爆状态默认**只存在这台设备**，没有账号，没有云同步。
- 例外是**广场帖子**：发出去即公开，别人都看得见；默认不带位置，勾选「显示 IP 定位」才显示一个按网络估算的城市。
- 管理员口令在本地模式下只做前端校验，不是权限系统；接上 Supabase 后才变成服务端校验。
- 自伤识别是一组关键词，只负责「轻轻问一句」，不拦截、不诊断。

隐私的代价说清楚：清除浏览器数据、无痕模式、换设备，本地记录都会消失。定期在开心罐里导出一份备份。

---

## 目录

```text
src/
├── app/            # 7 个路由 + globals.css（主题 token、玻璃、球体材质）
├── components/     # home / emotion / jar / letters / square / calendar / breathe / quiz / layout / ui
├── data/           # 情绪与文案、随笔、故事、演示数据
├── hooks/          # 全局快照、音频、浮层行为、Blob URL
├── lib/            # IndexedDB 仓储、后端契约（本地 / Supabase / REST）、导出导入、危机识别
└── types/
supabase/           # schema.sql、reset-square.sql
tests/              # unit / e2e
```

更多细节见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)、[`DESIGN.md`](./DESIGN.md)、[`DEMO.md`](./DEMO.md)。

---

## 已知边界

- 默认不跨设备；只有广场能上云。
- 广场拥抱按访客去重，换设备就是另一个人。
- 情绪统计只基于主动记录，不推断没记录的日子。
- 宽度小于 1024px 时首页少呈现几颗球，避免压住中央文案。
- 背景音乐《Long Day》（PurrpleCat / Pixabay）随仓库分发，换曲请先确认授权。

---

## 声明

情绪盒子是情感陪伴类网页作品，不具备心理评估、诊断或治疗功能，不能替代心理咨询与医疗帮助。站内文字只是陪伴，不构成建议或处方。如果你长期被情绪困扰，或出现伤害自己的念头，请尽快联系你信任的人，或寻求当地专业的心理援助与紧急救助资源。
