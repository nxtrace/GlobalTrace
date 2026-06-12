# GlobalTrace

GlobalTrace 是一个 Globalping x NextTrace 的开源项目，借助 Globalping 遍布全球的 Probe 发起路由追踪，并结合 NextTrace 骨干网 IP 数据库增强地理位置与网络归属信息。

## 技术栈

- Frontend：React + Vite + TypeScript + MapLibre。
- UI：Radix UI、lucide-react、liquid-glass-react。
- Worker：Hono on Cloudflare Workers Static Assets。
- 测量来源：Globalping `type: "mtr"` measurement。
- 增强数据：Worker 按 Globalping measurement ID 拉取可信结果后调用 nxtrace API v4 batch GeoIP/ASN/whois；用户保存个人 NextTrace API Token 后由浏览器直连 batch API。

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

- `GET /api/config`：返回 map style URL。
- `GET /api/probes`：返回当前在线 Globalping probes。
- `POST /api/trace/enrich`：接收 Globalping measurement ID，Worker 拉取对应 MTR measurement 后返回 trace 结果与 enrichment。
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

## 个人 NextTrace API Token

高级参数里可以保存个人 `NextTrace API Token`。该 Token 仅保存在当前浏览器 `localStorage`，不会发送给 Globalping 或 GlobalTrace Worker。

保存后，新建诊断和打开分享结果会由浏览器直接请求 `https://api.nxtrace.org/v4/ipGeo/batch`，并通过 `X-NextTrace-Token` 传递该 Token。

## 缓存和存储边界

- GeoIP enrichment 结果使用 Worker Cache API 缓存 24 小时。
- 个人 NextTrace API Token 只保存在浏览器本地，不进入 Worker Cache、日志或服务端配置。
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

公开配置不包含 Cloudflare account 或生产 hostname/routes。生产部署复制示例文件后填写私有值：

```bash
cp wrangler.private.example.jsonc wrangler.private.jsonc
```

`wrangler.private.jsonc` 被 Git ignore，用于保存部署标识和生产 Worker vars。

默认生产部署由 Cloudflare Workers Builds 执行；GitHub Actions 只做验证，不再部署。

Cloudflare Build 配置：

- Build command: `npm run build`
- Deploy command: `node scripts/write-ci-wrangler-config.mjs && npx wrangler deploy --config .wrangler-ci.jsonc`
- Build variables: `NODE_VERSION=24`、`CLOUDFLARE_ACCOUNT_ID`、`GLOBALTRACE_HOSTNAME`

生产必需 secret 仍只写入 Cloudflare Worker secrets：

```bash
npx wrangler secret put --config wrangler.private.jsonc NXTRACE_API_V4_TOKEN
```

不要把真实 secret 写入 Git、测试 fixture、文档示例或 frontend `VITE_*` 值。

迁移到 Cloudflare Builds 后，GitHub repository secrets 中可删除：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`GLOBALTRACE_HOSTNAME`、`NXTRACE_API_V4_TOKEN`。

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
