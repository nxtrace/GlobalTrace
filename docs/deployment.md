# GlobalTrace 提交和部署

## 目标

发布 `globaltrace` Worker 和 `dist` 静态资源到 Cloudflare 生产部署目标。

公开的 `wrangler.jsonc` 只保存通用 Worker、Cloudflare Static Assets 和本地开发配置。生产 account、hostname/routes 等部署标识保存在被 Git ignore 的 `wrangler.private.jsonc`。

默认部署路径是 Cloudflare Workers Builds。手动 `wrangler.private.jsonc` 部署保留为 fallback。

## GitHub 验证和 Cloudflare Builds

`.github/workflows/deploy.yml` 的行为：

- `pull_request` to `master`：运行验证，不部署。
- `push` to `master`：运行验证，不部署；生产部署由 Cloudflare Builds 接管。
- `workflow_dispatch`：允许从 GitHub UI 手动触发验证。

Cloudflare Builds 连接 `nxtrace/GlobalTrace` 后，生产构建配置：

- Root directory: `/`
- Production branch: `master`
- Build command: `npm run build`
- Deploy command: `node scripts/write-ci-wrangler-config.mjs && npx wrangler deploy --config .wrangler-ci.jsonc`

默认禁用 non-production branch builds。若需要保留预览构建，Non-production deploy command 使用：

```bash
node scripts/write-ci-wrangler-config.mjs && npx wrangler versions upload --config .wrangler-ci.jsonc
```

Cloudflare Build variables 必填：

- `NODE_VERSION=24`
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare account ID。
- `GLOBALTRACE_HOSTNAME`：生产 hostname，只写域名，不带 `https://` 或路径。

Cloudflare Worker runtime secret 必填：

- `NXTRACE_API_V4_TOKEN`：Worker secret。

不要在 Cloudflare Build variables 里新增 `CLOUDFLARE_API_TOKEN`；Cloudflare Builds 使用它自己的 Workers Builds API token。

迁移完成并确认 GitHub workflow 不再引用后，GitHub repository secrets 可删除：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `GLOBALTRACE_HOSTNAME`
- `NXTRACE_API_V4_TOKEN`

删除前提：仓库外没有其它自动化依赖这些 GitHub repository secrets。

## 私有配置文件

创建本机私有配置：

```bash
cp wrangler.private.example.jsonc wrangler.private.jsonc
```

必须替换的字段：

- `account_id`：Cloudflare account ID。
- `routes[0].pattern`：生产 hostname，例如 `trace.example.com`。

不要把 `NXTRACE_API_V4_TOKEN` 写入 `wrangler.private.jsonc`；它只能作为 Worker secret。

## Cloudflare 前置条件

- Cloudflare Builds 已连接 `nxtrace/GlobalTrace`。
- Cloudflare Builds API token 已允许 Wrangler 部署目标 Worker。
- Cloudflare Build variables 已按上文配置。
- Cloudflare Worker runtime secrets 已按上文配置。

手动 fallback 部署还需要本机存在 `wrangler.private.jsonc`，且包含生产 `account_id`、`routes` 或 `domains`。

手动设置 Worker secrets：

```bash
npx wrangler secret put --config wrangler.private.jsonc NXTRACE_API_V4_TOKEN
```

不要把 `NXTRACE_API_V4_TOKEN` 写入 `wrangler.jsonc`、`wrangler.private.jsonc`、文档示例、测试 fixture、`.env`、`.dev.vars` 或 frontend `VITE_*` 值。

## 提交前检查

```bash
git status --short
git diff --stat
git diff --check
```

确认只包含本次任务相关改动。不要提交：

- `dist`
- `.wrangler`
- `.wrangler-home`
- `.wrangler-ci.jsonc`
- `.dev.vars`
- `.env`
- `wrangler.private.jsonc`
- `coverage`
- `test-results`
- smoke 截图或临时文件

当前仓库默认通过 Cloudflare Builds 部署 `origin/master`；除非任务明确要求，不要在本地直接部署生产。

## 本地验证

代码改动发布前执行完整验证：

```bash
npm ci
npx playwright install chromium
npm run verify
```

`npm run verify` 依次运行 lint、typecheck、coverage test、build、performance budget、browser smoke 和 Worker Static Assets smoke，与 GitHub `Verify` job 的检查范围一致。
Linux CI 或缺少 Chromium 系统依赖的环境使用 `npx playwright install --with-deps chromium`。

docs-only 改动至少执行：

```bash
git diff --check
```

`npm run smoke` 等价于：

```bash
npm run smoke:browser
npm run smoke:worker
```

`smoke:browser` 使用本地 Vite server；`smoke:worker` 会构建 `dist`，再通过跨平台 Node runner 启动本地 Worker，验证配置中的 Worker Static Assets。

## Cloudflare Builds 部署

推送到 `master` 后：

- GitHub Actions 执行验证：lint、typecheck、coverage test、build、performance budget、smoke。
- Cloudflare Builds 执行 `npm run build`。
- Cloudflare Builds 执行 `node scripts/write-ci-wrangler-config.mjs && npx wrangler deploy --config .wrangler-ci.jsonc`。

部署会同时发布 Worker 和静态资源。`assets.directory` 必须对应 Cloudflare Builds 最新 `npm run build` 生成的 `dist`。

## 手动 fallback 部署

```bash
npm run build
npx wrangler deploy --config wrangler.private.jsonc
```

等价脚本：

```bash
npm run deploy:private
```

如果用户要求“提交并部署”，默认顺序是：

```bash
npm run verify
git status --short
git diff --stat
git add <本次相关文件>
git commit -m "<conventional commit message>"
git push origin master
```

提交只暂存本次任务相关文件；不要把无关工作区改动带入 commit。生产发布由 Cloudflare Builds 完成。

## 线上验证

部署后至少检查：

```bash
curl -fsSI https://<private-hostname>/
curl -fsSL https://<private-hostname>/api/config
```

需要确认前端资产时，先从首页 HTML 取当前 `index-*.js` / `index-*.css` 文件名，再检查对应资源。不要把某次部署的资产 hash 写成长期固定值。

可选 live smoke：

```bash
NXTRACE_API_V4_TOKEN=... GLOBALTRACE_LIVE_SMOKE=1 npm run smoke:live
```

live smoke 会创建一个匿名 Globalping measurement，等待完成后用本地 Worker app 执行 enrichment，并校验 measurement ID、trace shape 和 enrichment status。

## 已知问题

- Playwright/Chromium smoke 在 macOS 沙箱内可能失败，错误包含 `bootstrap_check_in ... Permission denied (1100)`。这通常是本机沙箱权限问题；在非沙箱/提权环境重跑同一 smoke 后再判断是否为应用问题。
- Wrangler 可能因为无法写入 `~/Library/Preferences/.wrangler/logs/...` 报 `EPERM`。如果 deploy 输出显示 Worker 和 assets 已上传并发布，以线上验证结果为准。

## WAF rate limiting

诊断创建额度依赖 Globalping credits 和 limits；共享地理信息补全另外使用 Workers Rate Limiting bindings：客户端 IP 为 10 次／60 秒，measurementId 为 1 次／60 秒，上游批量调用为每机房 120 次／60 秒（含重试）。完整结果缓存命中绕过入口计数，GeoIP 缓存命中不消耗上游批次额度。

计数按 Cloudflare 机房分别维护且最终一致，不是严格全局预算。生产和独立预览 Worker 必须使用不同的 namespace_id；手动 fallback 配置需同步 `wrangler.private.example.jsonc` 的三个 binding。缺失或异常时停止新增共享调用，原始测量结果仍可显示。

NextTrace 429 停止当前任务；5xx 或单次超时最多二分恢复一次。每个任务最多原始批次数加 2 次请求，绝对上限 42 次；单次网络请求 10 秒、整个 NextTrace 网络阶段 30 秒。部分结果不写入完整结果缓存。

`nxtrace_enrichment` 日志提供调用次数、耗时和终止原因，`enrich_admission` 提供限流或设施异常原因。上线后检查拒绝率与增强失败；调整误伤阈值时保留重试预算。`smoke:live` 使用 Wrangler 的真实本地绑定模拟，不提供绕过限流的环境。
