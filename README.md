# 知白台

> 知其白，守其黑 —— 个人效率系统

一个**本地优先（Local-first）**的个人信息管理工具：待办、习惯、番茄钟、记账、收藏、情报聚合……全部数据存在浏览器本地（IndexedDB），无需账号，可离线使用；多设备之间通过 GitHub 仓库加密快照同步。

## 功能一览

九个功能板块 + 系统设置，覆盖个人生活的方方面面：

| 板块 | 功能 |
| --- | --- |
| 观 TODAY | 今日总览：待办、习惯、日程、饮水等一天态势 |
| 行 ACTION | 待办（含**每周 / 每月固定**提醒）/ 笔记 / 灵感 |
| 修 CULTIVATE | "斩三尸"坏习惯对抗 · 身体指标 · 喝水打卡 · 每日日志 |
| 学 STUDY | 番茄钟 · 课程表 · 作业 · 考试 |
| 财 FINANCE | 收支 · 购买 · 预算 · 统计图表 |
| 藏 ARCHIVE | 收藏（小说 / 动漫 / 游戏 / 影视 / 书 / GitHub）· 个人项目中心 |
| 情 FEED | 情报中枢：GitHub / RSS / Steam / 动漫等源聚合，一眼看尽动态 |
| 奇 OCCULT | 每日签（45 签库 + AI 个性化解读）· 梅花易数（四式起卦/体用生克）· 大衍筮法（《系辞》十八变） |
| 术 AI | AI 资源（模型 / Tool / Skill / Agent…）管理，内置 7 类 + 自定义类型（跨设备同步） |
| 系统 SYSTEM | 设置 · 数据备份与清空 · 多设备同步 |

## 核心特性

- **本地优先**：全部数据存于 IndexedDB，离线可用，任何时候数据都在自己手里
- **多设备同步**：快照经 AES-GCM + PBKDF2 加密后存入 GitHub 仓库（Git Data API，支持大快照与原子提交）；LWW 合并 + 冲突检测 + 墓碑删除，跨设备不丢数据
- **URL 深链接**：导航与 hash 双向同步，刷新/分享链接直达对应板块，前进后退可用
- **PWA**：可安装到主屏幕、离线可用（宣纸印章图标）
- **按页分包**：路由懒加载，首屏轻量；书法字体按常用字子集化（4.7MB → 2.7MB）
- **双向数据出口**：一键导出全量备份、一键清空（清单统一，不会漏表）
- **AI 能力（可选）**：内置本地规则兜底；接入任意 OpenAI 兼容 Provider（Agnes / DeepSeek / Kimi…）后解锁全局对话（直接提问，可查本机任务/课程/情报/收支）、AI 简报、个性化签解、卦象白话解读、情报 AI 补足与问答——Key 仅 AES-GCM 加密存本地，AI 写入先预览再落库

## 键盘快捷键

| 按键 | 功能 |
| --- | --- |
| `Ctrl/⌘ + K` | 命令面板（新建 / 跳转 / 抓取） |
| `/` | 全局搜索 |
| `1` … `9` / `0` | 跳转对应板块 / 系统 |
| `?` | 键盘速查表 |
| `Esc` | 关闭弹层 / 面板 |

## 技术栈

- **前端**：React 19 · TypeScript · Vite 8 · Tailwind CSS 4
- **状态/数据**：Zustand · Dexie（IndexedDB）
- **图表**：轻量 SVG 模块（Ring 圆环 / 迷你折线，无重量级图表库）
- **工程化**：Vitest · oxlint · vite-plugin-pwa

## 环境要求与前置条件

基础板块**装好即用**：所有数据都在本机 IndexedDB，不需要账号、不需要联网。
下面这些能力各有前置，按需准备即可。

### 运行时环境（硬要求）

| 要求 | 原因 |
| --- | --- |
| 现代浏览器（Chrome / Edge / Safari 16+） | 依赖 IndexedDB、Service Worker、Web Audio |
| **HTTPS 或 localhost** | Service Worker、系统通知、剪贴板都要求安全上下文，纯 HTTP 下会被浏览器禁用 |
| 允许站点存储数据 | 无痕/隐私模式下 IndexedDB 不可持久化 |

### 各功能的前置条件

| 功能 | 前置 | 说明 |
| --- | --- | --- |
| 待办 / 习惯 / 记账 / 收藏 / 情报等基础板块 | 无 | 打开即用 |
| **课程表的单双周与周次过滤** | **学期起始日（首周）** | 在「学 · 课程表」操作行点「首周」设置；不设则一律按"每周都上"处理 |
| 应用内提醒（toast） | 无 | 需应用处于打开状态 |
| **系统通知** | 在「系统 · 通知」开启开关并授权 | **iOS 必须先"添加到主屏幕"安装为 PWA**，Safari 标签页里发不出通知 |
| 音效 / 环境音 | 开启开关 + 音量 > 0 | 浏览器要求**首次交互后**才允许出声；页面隐藏时自动静音 |
| **多设备同步** | GitHub **私有仓库** + **Token**（repo 权限）+ **同步口令** | 口令经 PBKDF2 推导密钥，仓库里的快照无口令不可读 |
| 同步的国内可达性 | 可能需自建代理 | 国内直连 `api.github.com` 常超时，可在「系统 · 同步」填转发地址 |
| **AI 问答 / 简报 / 签解 / 卦解 / 可执行动作** | AI Core：Base URL + 模型 + **API Key** | 未配 Key 时自动走本地规则；**可执行动作只在远程就绪时产生** |
| 情报抓取的境外源 | 无 | GitHub / Jikan / Steam / RAWG 等自带 CORS，可直连 |
| **情报抓取的中文源与 B 站** | **自建 CORS 转发端点** | 这类站点不发 CORS 头，浏览器永远拿不到响应体；部署方式见下节 |
| 定时自动抓取 | 应用保持打开 | 目前是前端定时器（无后台任务），页面隐藏时会被浏览器节流 |
| 安装为应用（PWA） | HTTPS + 浏览器支持 | 桌面 Chrome / Edge 可一键安装；iOS 用 Safari「分享 → 添加到主屏幕」 |
| 数据备份 / 迁移 | 无 | 「系统 · 数据」可导出全量 JSON；备份与同步均覆盖全部业务表 |

> **一句话**：基础功能零依赖；AI 要 Key、同步要仓库与口令、中文源抓取要自建代理、iOS 上的系统通知要先安装成 App。

## 快速开始

```bash
npm install
npm run dev        # 本地开发 http://localhost:5173
npm run typecheck  # 类型检查
npm run lint       # 代码检查
npm test           # 运行测试
npm run build      # 生产构建（本地输出到仓库外的 ../dist；CI 输出到仓库内 dist/ 供 Pages 部署）
```

## 部署到 GitHub Pages

1. 将本仓库 push 到 GitHub，仓库 Settings → Pages → Source 选择「GitHub Actions」
2. `main` 分支每次 push 会自动构建并发布（见 `.github/workflows/deploy.yml`），应用将部署在 `https://<用户名>.github.io/<仓库名>/`

## 数据与同步

- 数据 100% 在本地，浏览器 IndexedDB（共 24 张业务表）。
- 同步原理：将全量数据加密为快照文件写入指定 GitHub 仓库（Git Data API：blob → tree → commit → ref，支持大快照、原子提交、并发冲突自动重跑），任意设备拉取后解密合并；合并采用 Last-Write-Wins，冲突记录保存在本地可查，删除经墓碑跨设备传播。
- 安全：同步密文由你的 **Sync Password** 经 PBKDF2 推导密钥加密，仓库中的快照无密钥不可读；GitHub Token 亦由本地密钥加密存储。

## 接入远程 AI（三步）

1. **系统 · AI Core** → 点预设（Agnes / DeepSeek / Kimi…，或手填 Base URL 与模型名）
2. 粘贴 **API Key** → 「加密保存」（AES-GCM 存本地 IndexedDB，不上传）
3. 「测试连接」通过后，Provider 切到「远程模型」即生效——未配 Key 时自动使用本地规则

> Key 只存在你自己的浏览器里，绝不进入代码仓库或任何服务器；所有 AI 写入操作都先预览、经确认才落库。

## 情报抓取与自建代理

纯前端应用抓 RSS 会被浏览器 CORS 拦截。抓取链路为：**自建代理 → 直连**（不做公共代理兜底，直连失败即快速失败并提示去配自建代理）。
强烈建议部署自建代理（免费额度足够个人），**部署指引见 `cloudflare-worker/README.md`**，
部署后把地址填入「系统 · 情报源 · 自建代理」即可。

### 快速部署（推荐 Netlify —— 国内可达性最好）

仓库已带好全部配置文件（转发逻辑 `proxy/core.js`、`netlify.toml`、函数目录 `netlify/functions/`），
**无需写任何代码**，两种方式二选一：

```bash
# 方式一：Netlify CLI（推荐，<site> 换成你的站点名）
npm i -g netlify-cli
netlify login
netlify deploy --prod "e:\WorkSpace\work\知白台"   # 部署 src=dist 静态站亦可，函数走 netlify.toml

# 方式二：Cloudflare Pages（国内稍慢但同样可用）
npx wrangler pages deploy e:\WorkSpace\work\知白台\public --project-name=zhibaitai-proxy
```

> ⚠️ `*.workers.dev` / `*.vercel.app` 域名在国内被 DNS 污染，**不要**用 Cloudflare Workers
> 或 Vercel 的默认域名，选 Netlify 或 Cloudflare Pages 才能连上。

部署后填入知白台：

| 部署形态 | 填这个地址 |
| --- | --- |
| Netlify（推荐） | `https://<site>.netlify.app/proxy` |
| Cloudflare Pages | `https://<project>.pages.dev/proxy` |

安全加固（可选）：在部署平台设置环境变量 `ALLOWED_HOSTS`（只放行你订阅的主机，
`api.bilibili.com` 也要列进去）与 `ALLOWED_ORIGINS`（只放行你的应用域名）。

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
# 维护脚本（字体子集化 / 印文校验 / 规范检查 / 代理探测）不入库，放在本机 work/scripts/
```

## 目录（应用名）小贴士

"知白台"取自《道德经》——"知其白，守其黑，为天下式"：把该做的事情看清楚、做扎实，把无关的干扰挡在门外。

## License

[MIT](LICENSE) © 2026