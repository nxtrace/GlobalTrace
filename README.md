# GlobalTrace

GlobalTrace 是一个 Globalping x NextTrace 的开源项目，借助 Globalping 遍布全球的 Probe 发起路由追踪，并结合 NextTrace 骨干网 IP 数据库增强地理位置与网络归属信息。

## 技术栈

- Frontend：React + Vite + TypeScript + MapLibre。
- UI：Radix UI、lucide-react、liquid-glass-react。
- Worker：Hono on Cloudflare Workers Static Assets。
- 测量来源：Globalping `type: "mtr"` measurement。
- 增强数据：nxtrace API v4 batch GeoIP/ASN/whois；Turnstile 取消后由浏览器匿名请求 IPinfo + RIPEstat 做有限 fallback。

## 本地运行

```bash
npm install
npm run dev
```

`npm run dev` 会先构建 Vite assets，再启动 `wrangler dev --local --assets dist`。同一个 Worker 处理 `/api/*` 并服务 SPA 静态资源。

只调前端界面时可用：

```bash
npm run dev:frontend
```

## 核心 API

- `GET /api/config`：返回 Turnstile site key 和 map style URL。
- `GET /api/probes`：返回当前在线 Globalping probes。
- `POST /api/turnstile/verify`：独立 Turnstile token 校验。
- `POST /api/trace/enrich`：校验 Turnstile，接收已完成或进行中的 Globalping MTR measurement，并返回 trace 结果与 enrichment。
- `GET /api/trace/:measurementId`：只读缓存查询；命中已完成结果时返回 JSON，否则返回 `204`。

## nxtrace enrichment 合约

Worker 调用 nxtrace batch 接口：

```json
{"ips":["1.1.1.1","8.8.8.8"]}
```

接口要求：

- 路径：`POST /v4/ipGeo/batch`。
- 输入：唯一公网 hop IP 列表。
- 批量大小：最多 64 个唯一 IP。
- 响应：按请求顺序返回 `results`。
- 失败处理：batch chunk 失败会写入 enrichment error；当前实现不回退到单 IP `GET /v4/ipGeo`。

## 浏览器端 fallback

用户取消 Turnstile 后不调用 `POST /api/trace/enrich`，也不触发 Worker 端 nxtrace API。前端会直接读取 Globalping measurement，并对公网 hop IP 匿名请求：

- `https://ipinfo.io/{ip}`：补充城市、地区、国家、经纬度和可能存在的 `org` ASN。
- `https://stat.ripe.net/data/prefix-overview/data.json?resource={ip}`：当 IPinfo 缺少 ASN 时补充 ASN、holder 和 prefix。

fallback 不使用服务端代理、token 或 GeoLite2 license key。

## 缓存和存储边界

- GeoIP enrichment 结果使用 Worker Cache API 缓存 24 小时。
- 完成态 trace response 使用 Worker Cache API 短缓存。
- 项目不使用 KV、D1、R2、Durable Object 或服务端报告存储。
- 分享链接依赖 measurement ID 和缓存结果；不会把报告持久写入数据库。

## Cloudflare 配置

`wrangler.jsonc` 是公开配置入口，适合本地开发和通用 Worker 配置：

- `name`: `globaltrace`
- `main`: `src/worker/index.ts`
- `assets.directory`: `./dist`
- `assets.binding`: `ASSETS`
- `assets.not_found_handling`: `single-page-application`
- `assets.run_worker_first`: `/api/*`

公开配置不包含 Cloudflare account、生产 hostname/routes 或 Turnstile site key。生产部署复制示例文件后填写私有值：

```bash
cp wrangler.private.example.jsonc wrangler.private.jsonc
```

`wrangler.private.jsonc` 被 Git ignore，用于保存部署标识和生产 Worker vars。

默认生产部署由 Cloudflare Workers Builds 执行；GitHub Actions 只做验证，不再部署。

Cloudflare Build 配置：

- Build command: `npm run build`
- Deploy command: `node scripts/write-ci-wrangler-config.mjs && npx wrangler deploy --config .wrangler-ci.jsonc`
- Build variables: `NODE_VERSION=24`、`CLOUDFLARE_ACCOUNT_ID`、`GLOBALTRACE_HOSTNAME`、`TURNSTILE_SITE_KEY`

生产必需 secrets 仍只写入 Cloudflare Worker secrets：

```bash
npx wrangler secret put --config wrangler.private.jsonc NXTRACE_API_V4_TOKEN
npx wrangler secret put --config wrangler.private.jsonc TURNSTILE_SECRET_KEY
```

不要把真实 secret 写入 Git、Terraform、测试 fixture、文档示例或 frontend `VITE_*` 值。`TURNSTILE_SITE_KEY` 是公开值，但本仓库把生产 site key 也放在 ignored 私有配置中，避免公开仓库暴露部署标识。

迁移到 Cloudflare Builds 后，GitHub repository secrets 中可删除：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`GLOBALTRACE_HOSTNAME`、`TURNSTILE_SITE_KEY`、`NXTRACE_API_V4_TOKEN`、`TURNSTILE_SECRET_KEY`。

手动生产部署保留为 fallback：

```bash
npm run deploy:private
```

## 验证

```bash
npm run typecheck
npm test
npm run build
npm run smoke
```

`npm run smoke` 包含 browser smoke 和 Worker Static Assets smoke。必要时可拆开运行：

```bash
npm run smoke:browser
npm run smoke:worker
```

可选 live smoke：

```bash
NXTRACE_API_V4_TOKEN=... GLOBALTRACE_LIVE_SMOKE=1 npm run smoke:live
```

live smoke 会创建一个匿名 Globalping measurement，并校验 measurement ID、trace shape 和 enrichment status。

## 部署

完整提交和部署流程见 [docs/deployment.md](docs/deployment.md)。

## License

GlobalTrace is licensed under GPL-3.0-or-later. See [LICENSE](LICENSE).
