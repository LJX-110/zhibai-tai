# 知白台

> 知其白，守其黑 —— 个人效率系统

一个**本地优先（Local-first）**的个人信息管理工具：待办、习惯、番茄钟、记账、收藏、情报聚合……全部数据存在浏览器本地（IndexedDB），无需账号，可离线使用；多设备之间通过 GitHub 仓库加密快照同步。

## 功能一览

九个功能板块 + 系统设置，覆盖个人生活的方方面面：

| 板块 | 功能 |
| --- | --- |
| 观 TODAY | 今日总览：待办、习惯、日程、饮水等一天态势 |
| 行 ACTION | 待办 / 笔记 / 灵感 |
| 修 CULTIVATE | "斩三尸"坏习惯对抗 · 身体指标 · 喝水打卡 · 每日日志 |
| 学 STUDY | 番茄钟 · 课程表 · 作业 · 考试 |
| 财 FINANCE | 收支 · 购买 · 预算 · 统计图表 |
| 藏 ARCHIVE | 收藏（小说 / 动漫 / 游戏 / 影视 / 书 / GitHub）· 个人项目中心 |
| 情 FEED | 情报中枢：GitHub / RSS / Steam / 动漫等源聚合，一眼看尽动态 |
| 奇 OCCULT | 抽签 · 八卦 · 六爻 · 奇门遁甲 |
| 术 AI | AI 资源（模型 / Tool / Skill / Agent）管理 |
| 系统 SYSTEM | 设置 · 数据备份与清空 · 多设备同步 |

## 核心特性

- **本地优先**：全部数据存于 IndexedDB，离线可用，任何时候数据都在自己手里
- **多设备同步**：快照经 AES-GCM + PBKDF2 加密后存入 GitHub 仓库（Git Data API，支持大快照与原子提交）；LWW 合并 + 冲突检测 + 墓碑删除，跨设备不丢数据
- **URL 深链接**：导航与 hash 双向同步，刷新/分享链接直达对应板块，前进后退可用
- **PWA**：可安装到主屏幕、离线可用（宣纸印章图标）
- **按页分包**：路由懒加载，首屏轻量；书法字体按常用字子集化（4.7MB → 2.7MB）
- **双向数据出口**：一键导出全量备份、一键清空（清单统一，不会漏表）

## 技术栈

- **前端**：React 19 · TypeScript · Vite 8 · Tailwind CSS 4
- **状态/数据**：Zustand · Dexie（IndexedDB）· Zod（校验）
- **图表**：Recharts
- **工程化**：Vitest · oxlint · vite-plugin-pwa

## 快速开始

```bash
npm install
npm run dev        # 本地开发 http://localhost:5173
npm run typecheck  # 类型检查
npm run lint       # 代码检查
npm test           # 运行测试
npm run build      # 生产构建（输出 dist/）
```

## 部署到 GitHub Pages

1. 将本仓库 push 到 GitHub，仓库 Settings → Pages → Source 选择「GitHub Actions」
2. `main` 分支每次 push 会自动构建并发布（见 `.github/workflows/deploy.yml`），应用将部署在 `https://<用户名>.github.io/<仓库名>/`

## 数据与同步

- 数据 100% 在本地，浏览器 IndexedDB（共 23 张业务表）。
- 同步原理：将全量数据加密为快照文件写入指定 GitHub 仓库（Git Data API：blob → tree → commit → ref，支持大快照、原子提交、并发冲突自动重跑），任意设备拉取后解密合并；合并采用 Last-Write-Wins，冲突记录保存在本地可查，删除经墓碑跨设备传播。
- 安全：同步密文由你的 **Sync Password** 经 PBKDF2 推导密钥加密，仓库中的快照无密钥不可读；GitHub Token 亦由本地密钥加密存储。

## 情报抓取与自建代理

纯前端应用抓 RSS 会被浏览器 CORS 拦截。抓取链路为：**自建代理 → 直连 → 公共代理兜底**。
强烈建议部署自建代理（免费额度足够个人）：见 [`cloudflare-worker/`](cloudflare-worker/README.md)，
部署后把 Worker 地址填入「系统 · 情报源 · 自建代理」即可。

## 目录结构

```
src/
├── db/           # IndexedDB 表清单（单一事实源）与建库
├── types/        # 领域实体（单一事实源）
├── repositories/ # 通用 CRUD 数据访问层（删除写墓碑、写入补时间戳）
├── stores/       # Zustand 状态（hash 路由在 useAppStore）
├── services/     # 业务逻辑（占卜算法 / 情报抓取 / AI 等）
├── sync/         # 多设备同步（加密 / 合并 / 冲突 / 墓碑 / GitHub Provider）
├── components/   # UI 组件
├── pages/        # 各板块页面
└── layouts/      # 桌面侧栏 / 移动底栏布局
cloudflare-worker/  # 自建 CORS 代理（情报抓取用，见其 README）
scripts/            # subset_fonts.py 书法字体子集化（完整字体在 src/assets/fonts/full/）
```

## 目录（应用名）小贴士

"知白台"取自《道德经》——"知其白，守其黑，为天下式"：把该做的事情看清楚、做扎实，把无关的干扰挡在门外。

## License

[MIT](LICENSE) © 2026