# 自建代理（CORS 转发）—— 从零开始的详细步骤

知白台是纯前端应用：浏览器直接抓 RSS / JSON / B 站接口会被 CORS 拦下。
公共代理（allorigins / r.jina.ai / codetabs / thingproxy / cors.lol）在国内**已全部失效**，
所以「自己部署一个转发端点」是让**中文源与 B 站**能用的唯一稳定解法。

- 转发逻辑只有一份：仓库根的 `proxy/core.js`；
- 下面几种部署形态都只是它的**薄壳**，**部署其中一个就够了**；
- 部署不需要买服务器、不需要域名，Netlify 免费额度完全够个人使用。

> 本文件是**唯一权威指南**（原 `cloudflare-worker/README.md` 已并入这里）。

---

## 0. 国内可达性（先说结论，别部署错形态）

实测（国内直连）：

| 托管域 | 国内可达 | 实测 |
| --- | --- | --- |
| `*.netlify.app` | ✅ **首选** | HTTP 200 / 938ms |
| `*.pages.dev`（Cloudflare Pages） | ✅ 可用 | 3836ms |
| `*.deno.dev` | ✅ 可用 | 3682ms |
| `*.workers.dev`（Cloudflare Worker） | ❌ 不可达 | DNS 被污染 |
| `*.vercel.app` | ❌ 不可达 | 同样被污染 |
| `gitee.io` | ❌ 不可达 | |

**结论：优先 Netlify。`*.workers.dev` / `*.vercel.app` 的地址不要填进 App —— 国内必然连不上。**

---

## 1. 方式一：Netlify 网页版（推荐 · 零命令行基础）

> 全程只需要一个浏览器 + 一个 GitHub 账号（用来登录 Netlify 与读取仓库）。

1. **注册 / 登录**：打开 <https://app.netlify.com>，点 **Log in** → 选择 **GitHub** 账号登录并授权。
2. **新建站点**：登录后点 **Add new site** → **Import an existing project**。
3. **选仓库**：选 **GitHub** → 按提示授权 → 在列表里选中知白台的仓库。
   （仓库是私有的也能选，授权后可见。）
4. **确认构建设置**（页面会预填，请改成下面这样）：
   - **Build command（构建命令）**：**留空**（仓库根已有 `netlify.toml`，里面只声明函数与发布目录，没有构建步骤）；
   - **Publish directory（发布目录）**：`public`；
   - 若表单里被预填成 `npm run build`，把它**清空**。
5. **Deploy**：点 **Deploy site**，等 1 分钟左右。成功后你会得到一个地址，形如
   `https://随机名.netlify.app`（可在 **Site configuration → Change site name** 里改成好记的名字）。
6. **配置环境变量（关键一步，不做的话转发会被拒绝）**：
   进入 **Site configuration → Environment variables → Add a variable**，添加：
   - `ALLOWED_HOSTS`（**必填**）：允许转发的目标主机名，**逗号分隔**，例如
     `api.bilibili.com,www.qbitai.com,www.ithome.com`。
     ⚠️ 只填你实际订阅的主机；**用 B 站源必须包含 `api.bilibili.com`**；
     这是防止你的代理被陌生人当公开跳板用的。
   - `ALLOWED_ORIGINS`（建议填）：只允许你的知白台页面调用，例如
     `https://你的用户名.github.io,http://localhost:5173`。
7. **让变量生效**：进 **Deploys → Trigger deploy → Deploy site**（环境变量只对**新部署**生效）。
8. **自检**：浏览器直接打开 `https://你的站点.netlify.app/`，应看到一段 JSON，
   其中 `allowedHosts` 显示 **「已配置 N 个」**；
   若显示「未配置 —— 转发会被拒绝（503）」，说明第 6/7 步没生效，重做一遍。

## 2. 方式二：Netlify CLI（会命令行的用这个）

```bash
# 前置：装 Node.js LTS（https://nodejs.org）
npm i -g netlify-cli
netlify login                 # 会打开浏览器授权
# 在仓库根目录（有 netlify.toml 的那一层）执行：
netlify deploy --prod         # 首次会让你创建 / 关联一个 site，按提示回车即可
netlify env:set ALLOWED_HOSTS "api.bilibili.com,www.qbitai.com,www.ithome.com"
netlify env:set ALLOWED_ORIGINS "https://你的用户名.github.io,http://localhost:5173"
netlify deploy --prod         # 环境变量变更后重新部署一次
```

部署完的地址同样是 `https://<site>.netlify.app`。

## 3. 方式三：Cloudflare Pages（Netlify 不可用时的备选）

```bash
# 在仓库根执行；wrangler 会识别根目录下的 functions/ 作为 Pages Functions
npx wrangler pages deploy public --project-name=zhibaitai-proxy
```

地址形如 `https://<project>.pages.dev/proxy`；环境变量在 Cloudflare Dashboard →
Pages → 该项目 → Settings → Environment variables 里配（同样重新部署后生效）。

<details>
<summary>Cloudflare Worker（备用形态，国内不可达，一般不用）</summary>

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler deploy
```

变量写在 `cloudflare-worker/wrangler.toml` 的 `[vars]`。
不装 Node 也可以在 Dashboard → Workers → Create Worker 里粘贴 `worker.js`
（注意它 import 了 `../proxy/core.js`，需一并提供）。
</details>

---

## 4. 回填到知白台

1. 打开知白台 → **系统 → 数据 → 抓取与代理 → 自建代理**；
2. 填入你的站点地址（`/proxy` 可带可不带，App 会自己拼参数）：

   | 部署形态 | 填这个 |
   | --- | --- |
   | Netlify | `https://<site>.netlify.app/proxy` |
   | Cloudflare Pages | `https://<project>.pages.dev/proxy` |

3. 输入框失焦即保存（地址非法会当场说明，不会写入）。
   这个地址在同步白名单里 —— 配一次会随快照同步到其他设备。

## 5. 验证

- **自检**：浏览器打开站点根路径，看到 `ok: true` 的 JSON（见方式一步骤 8）；
- **curl 冒烟**（把目标换成你订阅的源）：

  ```bash
  curl "https://<site>.netlify.app/?url=$(python -c "import urllib.parse;print(urllib.parse.quote('https://www.qbitai.com/feed'))")"
  ```

- **在应用里**：情报页手动抓一次中文源 / B 站源，能出条目即通。

## 6. 错误对照表（照着改就行）

| 现象 | 原因 | 怎么办 |
| --- | --- | --- |
| 503 `代理未配置主机白名单，已拒绝转发` | `ALLOWED_HOSTS` 没配 / 配了没重新部署 | 配好变量后 **Trigger deploy** 一次 |
| 403 `目标主机不在白名单` | 该源的主机名不在 `ALLOWED_HOSTS` 里 | 把该主机加进去（B 站要加 `api.bilibili.com`）后重新部署 |
| 浏览器控制台 CORS 报错 | `ALLOWED_ORIGINS` 没包含你打开的站点域，或没重新部署 | 检查域名是否写全（含 `https://`），重新部署 |
| 404 / 打开是 Netlify 默认页 | 站点没部署成功 / 发布目录不是 `public` | 看 Deploys 里的构建日志，确认发布目录为 `public` |
| 打开超时 | 用了 `*.workers.dev` / `*.vercel.app`（国内被污染） | 换 Netlify |
| 请求返回上游报错原文 | 目标站点自身问题（限流 / 反爬） | 换源或稍后再试；代理只如实透传 |

## 7. 安全与边界（这些是刻意设计，不要改）

- **绝不代传凭据**：代理只带 `Accept / Range / Content-Type / User-Agent / Referer`，
  `Cookie` 与 `Authorization` 一律剥掉；
- **AI 请求不走这里**：AI 端点必须由浏览器直连（NVIDIA 无 CORS 头 → 依然不可用）；
- **同步不走这里**：GitHub Token 只对 `api.github.com` 直连，不经过任何第三方；
- **必填 `ALLOWED_HOSTS`**：没有它，这台代理就是一台对全互联网开放的转发跳板；
- 请求方法支持 `GET / HEAD / POST / PATCH / PUT / DELETE`（`OPTIONS` 返回 204 预检）；
- 200 响应在 Cloudflare 边缘缓存 5 分钟（对 Node / Netlify 无副作用）。

## 8. 维护

- 改白名单 / 换源 → 改环境变量 → **重新部署**（Netlify：Trigger deploy；CLI：再 `deploy --prod`）；
- 不想用了：Netlify 里删除该 site，同时到知白台「抓取与代理」把地址清空（清空后中文源自动快速失败并指路，不做公共代理兜底）。