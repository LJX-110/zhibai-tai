# 知白台

> 知其白，守其黑 —— 个人效率系统

**本地优先（Local-first）的个人信息管理工具**：待办、习惯、番茄钟、记账、收藏、情报聚合……
数据全部存在浏览器本地（IndexedDB），无需账号、可离线使用；多设备之间通过 GitHub 仓库加密快照同步。

当前版本 **v0.8.0**

## 功能一览

九个板块 + 系统设置，手机是第一产品形态：

| 板块 | 功能 |
| --- | --- |
| 观 TODAY | 今日总览：罗盘 · 守墨（首页速记）· 时间线（任务 + 课程）· 回望（本周 + 轨迹） |
| 行 ACTION | 待办（每日 / 每周 / 每月固定）· 笔记 · 灵感 |
| 修 CULTIVATE | 斩三尸 · 身体指标 · 喝水打卡 · 成长境界 |
| 学 STUDY | 番茄钟 · 课程表（单双周 / 停课 / 调课）· 学分 · 选课 · 作业 · 考试 |
| 财 FINANCE | 收支 · 购买 · 预算 · 统计图表 |
| 藏 ARCHIVE | 收藏（小说 / 动漫 / 游戏 / 影视 / 书 / GitHub）· 个人项目中心 |
| 情 FEED | 情报中枢：GitHub / RSS / Steam 等源聚合 |
| 奇 OCCULT | 每日签 · 梅花易数 · 大衍筮法 |
| 术 AI | AI 资源工具箱（模型 / 提示词 / 工作流，7 类 + 自定义） |
| 系统 SYSTEM | 设置 · 数据备份与清空 · 多设备同步 · 一键刷新 |

> **天机**是全应用唯一的 AI 入口：自由对话 + 一键能力 + 可执行动作（先预览、点确认才落库）。

## 核心特性

- **本地优先**：32 张业务表全在 IndexedDB，离线可用，数据在自己手里
- **守墨速记**：首页罗盘下方随手记一段，纯记事、不转待办，也不计入今日统计
- **多设备同步**：AES-GCM + PBKDF2 加密快照存 GitHub 私有仓（Git Data API 原子提交）；
  LWW 合并 + 冲突检测 + 墓碑删除；离线改动会持久标记，联网后自动补推
- **移动优先 PWA**：底栏 + 安全区 + 44px 触控目标，可安装、可离线；桌面浏览器同样可用
- **数据出口**：一键导出全量备份 / 一键清空，清单统一不漏表
- **桌宠「知白」**（可选，默认关闭）：跟着真实状态演出（推演中 / 等你确认 / 专注 / 打盹），
  可拖到任意位置，不挡底栏
- **AI 能力**（可选）：不配 Key 时走本地规则并如实说明；接入 OpenAI 兼容 Provider
  （DeepSeek / Kimi / Agnes 等浏览器可直连的服务）后解锁天机、AI 简报、签解与卦解；
  Key 只加密存本地，高风险写入一律先确认
- **按页分包**：路由懒加载；书法字体按常用字子集化

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run lint
npm test
npm run build      # 本地输出到仓库外的 ../dist；CI 输出仓库内 dist/ 供 Pages 部署
```

开发需要 Node 22+（建议 24，与 CI 一致；见 `.nvmrc`）。

**环境**：现代浏览器（Chrome / Edge / Safari 16+）、HTTPS 或 localhost、允许站点持久化存储。
基础功能零依赖；同步要 GitHub 私有仓 + Token + 口令，AI 要 Key，中文源抓取要自建代理，
iOS 系统通知需先「添加到主屏幕」。

## 键盘快捷键

| 按键 | 功能 |
| --- | --- |
| `Ctrl/⌘ + K` | 命令面板（新建 / 跳转 / 抓取） |
| `/` | 全局搜索 |
| `1` … `9` / `0` | 跳转对应板块 / 系统 |
| `?` | 键盘速查表 |
| `Esc` | 关闭弹层 / 面板 |

## 情报抓取与自建代理

抓取链路为 **自建代理 → 直连**（不做公共代理兜底；直连失败会快速失败并指路）。
仓库已带好三种部署形态的薄壳，**无需写代码**，任选其一：

```bash
# 推荐 Netlify（国内可达性最好；在仓库根目录执行）
npm i -g netlify-cli && netlify login && netlify deploy --prod

# 或 Cloudflare Pages
npx wrangler pages deploy public --project-name=zhibaitai-proxy
```

| 部署形态 | 填入地址 |
| --- | --- |
| Netlify（推荐） | `https://<site>.netlify.app/proxy` |
| Cloudflare Pages | `https://<project>.pages.dev/proxy` |

> ⚠️ `*.workers.dev` / `*.vercel.app` 域名在国内被 DNS 污染，**不要**用其默认域名。
> `ALLOWED_HOSTS` 为必填安全项，完整步骤与错误对照见 [`proxy/README.md`](proxy/README.md)。

## 接入远程 AI

在「系统 · AI · 模型与连接」选择预设（或手填 Base URL 与模型名）→ 粘贴 API Key →
「测试连接」通过后切到「远程模型」。Key 仅 AES-GCM 加密存本地，不上传。

## 部署到 GitHub Pages

仓库 Settings → Pages → Source 选「GitHub Actions」；push 到 `main` 自动构建发布，
地址为 `https://<用户名>.github.io/<仓库名>/`（CI：lint → test → build，任一失败即拦截）。

## 目录结构

```
src/
├── db/           # 表清单（单一事实源）与建库
├── types/        # 领域实体（单一事实源）
├── repositories/ # CRUD 数据访问层（删除写墓碑、写入补时间戳）
├── stores/       # Zustand 状态（hash 路由在 useAppStore）
├── services/     # 业务逻辑（占卜 / 情报 / AI 等）
├── sync/         # 多设备同步（加密 / 合并 / 冲突 / 墓碑 / GitHub Provider）
├── components/   # UI 组件
├── pages/        # 各板块页面
└── layouts/      # 桌面侧栏 / 移动底栏
proxy/              # 自建 CORS 代理：转发逻辑单一事实源 + 从零部署指南
cloudflare-worker/  # 同一份代理逻辑的 Cloudflare Worker 备用形态
```

## 关于名字

「知白台」取自《道德经》——「知其白，守其黑，为天下式」：
把该做的事情看清楚、做扎实，把无关的干扰挡在门外。

## License

[MIT](LICENSE) © 2026
