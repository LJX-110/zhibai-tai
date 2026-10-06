# 知白台

> 知其白，守其黑 —— 个人效率系统

一个**本地优先（Local-first）**的个人信息管理工具：待办、习惯、番茄钟、记账、收藏、情报聚合……
全部数据存在浏览器本地（IndexedDB），无需账号、可离线使用；多设备之间通过 GitHub 仓库加密快照同步。

**当前版本 v0.7.1**

## 功能一览

九个板块 + 系统设置：

| 板块 | 功能 |
| --- | --- |
| 观 TODAY | 今日总览：罗盘 · 今日时间线（任务 + 课程）· 本周回顾 |
| 行 ACTION | 待办（含每日 / 每周 / 每月固定）· 笔记 · 灵感 |
| 修 CULTIVATE | 斩三尸 · 身体指标 · 喝水打卡 · 成长境界 |
| 学 STUDY | 番茄钟 · 课程表（单双周 / 停课 / 调课）· 学分 · 选课（分类 / 搜索 / 标签 / 排序 / AI 建议）· 作业 · 考试 |
| 财 FINANCE | 收支 · 购买 · 预算 · 统计图表 |
| 藏 ARCHIVE | 收藏（小说 / 动漫 / 游戏 / 影视 / 书 / GitHub）· 个人项目中心 |
| 情 FEED | 情报中枢：GitHub / RSS / Steam 等源聚合 |
| 奇 OCCULT | 每日签 · 梅花易数 · 大衍筮法 |
| 术 AI | AI 资源工具箱（模型 / 提示词 / 工作流，7 类 + 自定义） |
| 系统 SYSTEM | 设置 · 数据备份与清空 · 多设备同步 · 一键刷新到最新 |

> **天机**（AI 中枢）是全应用唯一的 AI 入口：自由对话 + 一键能力 + 可执行动作（先预览、点确认才落库）。

## 核心特性

- **本地优先**：数据 100% 在 IndexedDB（32 张业务表），离线可用，数据都在自己手里
- **多设备同步**：快照经 AES-GCM + PBKDF2 加密存 GitHub 私有仓（Git Data API 原子提交）；
  LWW 合并 + 冲突检测 + 墓碑删除，跨设备不丢数据
- **移动优先**：手机是第一产品形态（底栏 + 安全区 + 触控目标 ≥44px）；桌面浏览器同样可用
- **PWA**：可安装到主屏幕、离线可用（纯白印章图标）
- **按页分包**：路由懒加载；书法字体按常用字子集化
- **数据出口**：一键导出全量备份 / 一键清空（清单统一，不会漏表）
- **桌宠「知白」**（可选，默认关闭）：跟着真实状态演出（推演中 / 等你确认 / 专注 / 打盹），
  可拖到任意位置、刷新后留在原地，不挡底栏
- **AI 能力**（可选）：内置本地规则兜底；接 OpenAI 兼容 Provider（DeepSeek / Kimi / Agnes 等
  浏览器可直连的服务）后解锁**天机** —— 多轮工具调用的对话、AI 简报、签解与卦解；可选**人设**
  与**长期记忆**；Key 仅加密存本地；高风险写入一律先预览、点确认才落库

## 键盘快捷键

| 按键 | 功能 |
| --- | --- |
| `Ctrl/⌘ + K` | 命令面板（新建 / 跳转 / 抓取） |
| `/` | 全局搜索 |
| `1` … `9` / `0` | 跳转对应板块 / 系统 |
| `?` | 键盘速查表 |
| `Esc` | 关闭弹层 / 面板 |

## 技术栈

React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · Zustand · Dexie（IndexedDB）·
自研轻量 SVG 图表（无重量级图表库）· Vitest · oxlint · vite-plugin-pwa。
**运行时依赖刻意只有 6 个**（clsx / dexie / lucide-react / react / react-dom / zustand）。

## 环境要求与前置条件

| 要求 | 原因 |
| --- | --- |
| 现代浏览器（Chrome / Edge / Safari 16+） | 依赖 IndexedDB、Service Worker、Web Audio |
| **HTTPS 或 localhost** | Service Worker、系统通知、剪贴板都要求安全上下文 |
| 允许站点存储数据 | 无痕 / 隐私模式下 IndexedDB 不可持久化 |

各功能前置，按需准备：

| 功能 | 前置 |
| --- | --- |
| 待办 / 习惯 / 记账 / 收藏 / 情报等基础板块 | 无，打开即用 |
| 课程表的单双周与周次过滤 | 在「学 · 课程表」设置**学期首周**；不设则按"每周都上"处理 |
| 应用内提醒 | 无（需应用处于打开状态） |
| 系统通知 | 在「系统 · 通知」开启并授权；**iOS 必须先"添加到主屏幕"** |
| 音效 / 环境音 | 首次交互后才允许出声；页面隐藏时自动静音 |
| **多设备同步** | GitHub **私有仓库** + Token（repo 权限）+ 同步口令 |
| 同步的国内可达性 | 可能需自建代理（填在「系统 · 数据 · 抓取与代理」） |
| **AI 问答 / 简报 / 签解 / 卦解 / 工具调用** | 「系统 · AI · 模型与连接」配 Base URL + 模型 + Key；未配时自动走本地规则并如实说明 |
| 情报抓取的中文源与 B 站 | 自建 CORS 转发端点（见下节） |
| 定时自动抓取 | 应用保持打开（前端定时器，页面隐藏会被节流） |
| 安装为应用（PWA） | HTTPS + 浏览器支持 |

> **一句话**：基础功能零依赖；AI 要 Key、同步要仓库与口令、中文源抓取要自建代理、iOS 通知要先安装成 App。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # 类型检查
npm run lint       # oxlint
npm test           # 运行测试
npm run build      # 生产构建（本地输出到仓库外的 ../dist；CI 输出仓库内 dist/ 供 Pages 部署）
```

> 开发需要 Node 22+（建议 24，与 CI 一致；见 `.nvmrc`）。

## 部署到 GitHub Pages

1. 仓库 Settings → Pages → Source 选择「GitHub Actions」
2. push 到 `main` 自动构建并发布（见 `.github/workflows/deploy.yml`），
   应用将部署在 `https://<用户名>.github.io/<仓库名>/`。

## 数据与同步

- 数据 100% 在本地（IndexedDB，共 32 张业务表）。
- 同步原理：全量数据加密为快照写入指定 GitHub 仓库（Git Data API：blob → tree → commit → ref，
  原子提交；读写窗口校验 + 竞争自动重试，最多 3 次），任意设备拉取解密合并；
  LWW 合并 + 冲突记录 + 墓碑传播。
- 离线改动会持久标记「待同步」，联网 / 回到前台 / 启动时自动补推。
- 安全：密文由 Sync Password 经 PBKDF2 派生密钥加密，仓库里的快照无口令不可读；
  GitHub Token 同样只在本地加密存储。

## 接入远程 AI（三步）

1. **系统 · AI · 模型与连接** → 点预设（DeepSeek / Kimi / Agnes…，或手填 Base URL 与模型名）
2. 粘贴 **API Key** → 「加密保存」（AES-GCM 存本地，不上传）
3. 「测试连接」通过后，Provider 切到「远程模型」即生效 —— 未配 Key 时自动使用本地规则

> Key 只存在你自己的浏览器里；所有 AI 写入操作都先预览、经确认才落库。

## 情报抓取与自建代理

抓取链路为 **自建代理 → 直连**（不做公共代理兜底，直连失败即快速失败并提示去配自建代理）。
仓库已带好全部配置（`proxy/core.js` + `netlify.toml` + `netlify/functions/` + `cloudflare-worker/`），
**无需写代码**，二选一部署：

```bash
# 推荐 Netlify（国内可达性最好）
npm i -g netlify-cli && netlify login && netlify deploy --prod

# 或 Cloudflare Pages
npx wrangler pages deploy public --project-name=zhibaitai-proxy
```

| 部署形态 | 填入地址 |
| --- | --- |
| Netlify（推荐） | `https://<site>.netlify.app/proxy` |
| Cloudflare Pages | `https://<project>.pages.dev/proxy` |

> ⚠️ `*.workers.dev` / `*.vercel.app` 域名在国内被 DNS 污染，**不要**用其默认域名。
> 安全加固（必填 `ALLOWED_HOSTS`）：部署详见 [`proxy/README.md`](proxy/README.md)（从零步骤 + 错误对照表）。

## 目录结构

```
src/
├── db/           # 表清单（单一事实源）与建库
├── types/        # 领域实体（单一事实源）
├── repositories/ # CRUD 数据访问层（删除写墓碑、写入补时间戳）
├── stores/       # Zustand 状态（hash 路由在 useAppStore）
├── services/     # 业务逻辑（占卜算法 / 情报抓取 / AI 等）
├── sync/         # 多设备同步（加密 / 合并 / 冲突 / 墓碑 / GitHub Provider）
├── components/   # UI 组件
├── pages/        # 各板块页面
└── layouts/      # 桌面侧栏 / 移动底栏
cloudflare-worker/  # 自建 CORS 代理备用形态（Cloudflare Worker）
proxy/              # 自建 CORS 代理：转发逻辑单一事实源（core.js）+ 从零部署指南（README.md）
# 维护脚本（字体子集化 / 印文校验 / 规范检查 / 代理探测）不入库，放在本机 work/scripts/
```

## 关于名字

"知白台"取自《道德经》——"知其白，守其黑，为天下式"：把该做的事情看清楚、做扎实，把无关的干扰挡在门外。

## License

[MIT](LICENSE) © 2026