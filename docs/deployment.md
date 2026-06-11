# GlobalTrace 提交和部署

## 目标

发布 `globaltrace` Worker 和 `dist` 静态资源到私有 Cloudflare 部署目标。

公开的 `wrangler.jsonc` 只保存通用 Worker、Cloudflare Static Assets 和本地开发配置。生产 account、hostname/routes、Turnstile site key 等部署标识保存在被 Git ignore 的 `wrangler.private.jsonc`。

默认部署路径是 GitHub Actions。手动 `wrangler.private.jsonc` 部署保留为 fallback。

## GitHub CI/CD

`.github/workflows/deploy.yml` 的行为：

- `pull_request` to `master`：只运行验证，不部署。
- `push` to `master`：验证通过后部署。
- `workflow_dispatch`：允许从 GitHub UI 手动触发部署。

CI 会用 `scripts/write-ci-wrangler-config.mjs` 从公开 `wrangler.jsonc` 生成 `.wrangler-ci.jsonc`，并注入 GitHub Secrets 中的部署标识。`.wrangler-ci.jsonc` 被 Git ignore，不要提交。

GitHub repository secrets 必填：

- `CLOUDFLARE_API_TOKEN`：Wrangler deploy 和写 Worker secrets 使用的 Cloudflare API token。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare account ID。
- `GLOBALTRACE_HOSTNAME`：生产 hostname，只写域名，不带 `https://` 或路径。
- `TURNSTILE_SITE_KEY`：Turnstile widget site key。
- `NXTRACE_API_V4_TOKEN`：Worker secret。
- `TURNSTILE_SECRET_KEY`：Worker secret。

`CLOUDFLARE_API_TOKEN` 至少需要能部署 Worker、上传 assets、维护目标 route/custom domain，并写入 Worker secrets。若使用 zone route，还需要对应 zone 的 route 权限。

## 私有配置文件

创建本机私有配置：

```bash
cp wrangler.private.example.jsonc wrangler.private.jsonc
```

必须替换的字段：

- `account_id`：Cloudflare account ID。
- `routes[0].pattern`：生产 hostname，例如 `trace.example.com`。
- `vars.TURNSTILE_SITE_KEY`：Turnstile widget site key。

不要把 `NXTRACE_API_V4_TOKEN` 或 `TURNSTILE_SECRET_KEY` 写入 `wrangler.private.jsonc`；它们只能作为 Worker secrets。

## Cloudflare 前置条件

- GitHub repository secrets 已按上文配置。
- Cloudflare 登录态或 API token 已允许 Wrangler 部署目标 Worker。
- Cloudflare 里已创建 Turnstile widget，并拿到对应 site key。

手动 fallback 部署还需要本机存在 `wrangler.private.jsonc`，且包含生产 `account_id`、`routes` 或 `domains`、生产 `vars.TURNSTILE_SITE_KEY`。

手动设置 Worker secrets：

```bash
npx wrangler secret put --config wrangler.private.jsonc NXTRACE_API_V4_TOKEN
npx wrangler secret put --config wrangler.private.jsonc TURNSTILE_SECRET_KEY
```

不要把 `NXTRACE_API_V4_TOKEN` 或 `TURNSTILE_SECRET_KEY` 写入 `wrangler.jsonc`、`wrangler.private.jsonc`、Terraform variables、文档示例、测试 fixture、`.env`、`.dev.vars` 或 frontend `VITE_*` 值。

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

当前仓库默认通过 `origin` 的 GitHub Actions 部署；除非任务明确要求，不要在本地直接部署生产。

## 本地验证

代码改动发布前执行完整验证：

```bash
npm install
npm run typecheck
npm test
npm run build
npm run smoke
```

docs-only 改动至少执行：

```bash
git diff --check
```

`npm run smoke` 等价于：

```bash
npm run smoke:browser
npm run smoke:worker
```

`smoke:browser` 使用本地 Vite server；`smoke:worker` 会构建 `dist`，再通过 `wrangler dev --local --assets dist` 验证 Worker Static Assets。

## GitHub Actions 部署

推送到 `master` 后，GitHub Actions 会执行：

- `npm ci`
- `npx playwright install --with-deps chromium`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run smoke`
- 生成 `.wrangler-ci.jsonc`
- `wrangler deploy --config .wrangler-ci.jsonc`
- 线上检查 `/` 和 `/api/config`

部署会同时发布 Worker 和静态资源。`assets.directory` 必须对应 CI 最新 `npm run build` 生成的 `dist`。

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
npm run typecheck
npm test
npm run build
npm run smoke
git status --short
git diff --stat
git add <本次相关文件>
git commit -m "<conventional commit message>"
git push origin master
```

提交只暂存本次任务相关文件；不要把无关工作区改动带入 commit。生产发布由 GitHub Actions 完成。

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

`terraform/` 是占位模板，不包含 API token、secret、zone id 或生产 hostname。当前模板保持单条 host-scoped GlobalTrace rate limit，覆盖：

- `POST /api/trace/enrich`
- `POST /api/turnstile/verify`

实际 zone id 和 hostname 通过 ignored `terraform/*.tfvars` 或命令行变量传入。

```bash
cp terraform/terraform.tfvars.example terraform/production.tfvars
terraform -chdir=terraform apply -var-file=production.tfvars
```
