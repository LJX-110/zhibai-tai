# 自建 CORS 代理（Cloudflare Worker）

知白台是纯前端应用，浏览器直接抓 RSS 会被 CORS 拦截。公共代理
（allorigins 等）时好时坏，**自建一个 Worker 是治本方案**：免费额度
（每天 10 万次请求）对个人远超够用，部署一次永久可用。

## 部署三步

```bash
cd cloudflare-worker
npx wrangler login        # 浏览器登录你的 Cloudflare 账号
npx wrangler deploy       # 部署，输出形如 https://zhibaitai-proxy.<你的子域>.workers.dev
```

没有 Node 也能装：Dashboard → Workers → Create Worker → 粘贴 `worker.js` 全文。

## 回填到知白台

系统 → 情报源 → **自建代理** 填入 Worker 地址，例如：

```
https://zhibaitai-proxy.xxx.workers.dev
```

保存后情报抓取链路变为：**自建代理 → 直连 → 公共代理兜底**，
B站 RSSHub、机器之心替代源等此前被 CORS 卡住的源即可正常拉取。

## 安全加固（建议）

编辑 `wrangler.toml`，取消注释并修改：

- `ALLOWED_HOSTS`：只转发你实际订阅的源主机，防止代理被滥用为公开跳板
- `ALLOWED_ORIGINS`：只允许你的应用部署地址（GitHub Pages 域 + localhost）跨域调用

改完重新 `npx wrangler deploy` 生效。

## 说明

- Worker 只放行 GET/HEAD，转发时剥离 Cookie 等敏感头
- 200 响应在 Cloudflare 边缘缓存 5 分钟，同源重复抓取省额度
- Token / Sync Password 等敏感信息**不会**经过此代理（同步走 api.github.com 直连，自带 CORS）
