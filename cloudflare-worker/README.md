# 自建代理（CORS 转发）

知白台是纯前端应用，浏览器直接抓 RSS / JSON / B 站接口会被 CORS 拦下；
公共代理（allorigins 等）时好时坏，**自建一个转发端点是治本方案**。

转发逻辑只有一份，位于仓库根的 `proxy/core.js`；下面三个薄入口都调用它，
部署其中一个即可。之所以保留三种形态，是因为它们在国内的可达性差别极大。

## ⚠️ 国内可达性（部署前必读）

实测（国内直连）：

| 托管域 | 国内可达 | 实测 |
| --- | --- | --- |
| `*.netlify.app` | ✅ **首选** | HTTP 200 / 938ms |
| `*.pages.dev`（Cloudflare Pages） | ✅ | 3836ms |
| `*.deno.dev` | ✅ | 3682ms |
| `*.workers.dev`（Cloudflare Worker） | ❌ 不可达 | DNS 被污染，解析到 168.143.171.189 |
| `*.vercel.app` | ❌ 不可达 | 同样被污染 |
| `gitee.io` | ❌ 不可达 | |

**结论：不要把 `*.workers.dev` / `*.vercel.app` 地址填进 App —— 国内必然连不上。
首选 Netlify（`netlify/` + `netlify.toml` 已就绪）。**

## 路由

| 形式 | 说明 |
| --- | --- |
| `GET <base>/?url=<encodeURIComponent(target)>` | 通用转发，抓 RSS / JSON |
| `GET <base>/proxy?url=<encodeURIComponent(target)>` | 同上，两种写法前端都认 |
| `GET <base>/?target=…` | `url` 的别名 |

- 只放行 `GET` / `HEAD`
- 缺 `url` 参数时：根路径 / `/proxy` 返回用法说明，其余路径返回 400
- B 站接口的 `w_rid`（WBI 签名）由**前端**算好后拼进完整 URL 交给代理，
  代理只做纯转发，因此本仓库不再需要 md5 与 `/bili/*` 专用路由

## 三种部署方式

### 1. Netlify（首选）

```bash
npm i -g netlify-cli
netlify login
netlify deploy --prod
```

仓库根已有 `netlify.toml`：函数目录为 `netlify/functions`，`/` 与 `/proxy`
都重写到转发函数。部署后地址：`https://<site>.netlify.app/proxy`

### 2. Cloudflare Pages

```bash
# 在仓库根执行；wrangler 会识别根目录下的 functions/ 作为 Pages Functions
npx wrangler pages deploy public --project-name=zhibaitai-proxy
```

部署后地址：`https://<project>.pages.dev/proxy`

### 3. Cloudflare Worker（备用）

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler deploy
```

输出形如 `https://zhibaitai-proxy.<子域>.workers.dev` —— **国内不可达，仅作备用**。
不装 Node 也可以：Dashboard → Workers → Create Worker 粘贴 `worker.js`
（注意它 import 了 `../proxy/core.js`，需一并提供）。

## 回填到知白台

系统 → 情报源 → **自建代理**，按下表填写：

| 部署形态 | 填这个 |
| --- | --- |
| Netlify | `https://<site>.netlify.app/proxy` |
| Cloudflare Pages | `https://<project>.pages.dev/proxy` |
| Cloudflare Worker | `https://zhibaitai-proxy.<子域>.workers.dev` |

App 会拼成 `<填的地址>?url=…`，因此填不填结尾的 `/proxy` 都能命中。

保存后情报抓取链路为：**自建代理 → 直连**。直连失败即快速失败并提示去配代理，
**不做公共代理兜底** —— 公共 CORS 代理（allorigins / r.jina.ai / codetabs / thingproxy
超时，cors.lol / cors.eu.org 一律 429）在国内已全部不可用，兜底只会白等 24 秒。

## 安全加固（建议）

在部署平台配置环境变量（Worker 写在 `wrangler.toml` 的 `[vars]`）：

- `ALLOWED_HOSTS`：只转发你实际订阅的主机，防止代理被滥用为公开跳板。
  配置后 **`api.bilibili.com` 也要列进去**，否则 B 站源会被 403 拦下
- `ALLOWED_ORIGINS`：只允许你的应用地址（GitHub Pages 域 + localhost）跨域调用

## 说明

- 转发时剥离 Cookie / Authorization 等敏感头，只带 `Accept` / `User-Agent` / `Range`
- Referer 默认取目标自身 origin；`api.bilibili.com` 固定改写为
  `https://www.bilibili.com/`（B 站校验来源页，用自身会被拒）
- 200 响应在 Cloudflare 边缘缓存 5 分钟（该缓存提示对 Node / Netlify 无副作用）
- Token / Sync Password 等敏感信息**不会**经过此代理（同步走 api.github.com 直连）

## 维护

`node scripts/probe_proxy.mjs` 不部署即可跑通整条转发链路（需外网，人工排查用）。
