# GlobalTrace 协作规则

## 执行边界

- 先读本文件，再做非平凡改动。
- 用户给出明确范围时，只改该范围；不要顺手重构、改格式或清理无关代码。
- 用户要求实现改动且没有明确要求“只测试/等确认/不要提交”时，规定测试通过后默认立刻做最小提交并部署，不要再等待用户单独要求。
- review finding 先对照当前代码验证；仍然成立才修。
- 文档、代码、测试的改动都要能追溯到当前请求。
- 不新增未请求的兼容层、配置项、抽象或 fallback。

## 项目事实

- 前端：React + Vite + TypeScript + MapLibre。
- Worker：Hono on Cloudflare Workers Static Assets。
- 测量来源：浏览器直接创建 Globalping `type: "mtr"` measurement。
- 后端增强：Worker 调用 nxtrace API v4 batch GeoIP/ASN/whois。
- Worker 名称：`globaltrace`。
- 生产部署标识保存在 ignored `wrangler.private.jsonc`，不要提交。
- 默认生产部署通过 Cloudflare Workers Builds，不再从本机直接部署。

## 关键约束

- `NXTRACE_API_V4_TOKEN` 只能作为 Wrangler Worker secret。
- 不要把真实 secret 写入 Git、测试 fixture、文档示例或 frontend `VITE_*` 值。
- nxtrace enrichment 使用 `POST /v4/ipGeo/batch`；不要实现旧的单 IP `GET /v4/ipGeo` fallback，除非用户明确要求。
- 当前实现不使用 KV、D1、R2、Durable Object 或服务端报告存储。

## 提交前检查

1. 用 `git status --short` 确认只包含本次任务相关文件。
2. 用 `git diff --stat` 和必要的 `git diff -- <file>` 检查改动范围。
3. 不提交 `dist`、`.wrangler`、`.wrangler-home`、`.wrangler-ci.jsonc`、`wrangler.private.jsonc`、`.dev.vars`、`.env`、`test-results`、临时截图或 smoke 产物。
4. docs-only 改动至少运行 `git diff --check`。

## 验证命令

常规代码改动按顺序执行：

```bash
npm run typecheck
npm test
npm run build
npm run smoke
```

docs-only 改动不需要跑应用测试，除非文档内容依赖实际命令输出。

## 提交和部署

用户明确说“提交并部署”，或用户要求实现改动且规定测试已通过、未要求停下时，默认执行最小安全提交、部署和线上验证：

```bash
npm run typecheck
npm test
npm run build
npm run smoke
git push origin master
```

部署后至少验证：

```bash
curl -fsSI https://<private-hostname>/
curl -fsSL https://<private-hostname>/api/config
```

生产发布由 Cloudflare Workers Builds 完成。`npm run deploy:private` 只作为手动 fallback，除非用户明确要求，不要本机直接部署生产。

## 预览发布（仅按需）

只有当用户明确要求“发布预览”“上预览”“给预览 URL”时，才执行本节流程；这不是每次修改、测试、提交或生产发布的默认步骤。

预览发布必须使用独立 Worker，不要碰生产 Worker `globaltrace`、`lg.nxtrace.org` 或 `wrangler.private.jsonc`：

1. 确认当前分支和工作区状态：

```bash
git status --short --branch
```

2. 构建当前代码：

```bash
npm run build
```

3. 使用临时 Wrangler 配置发布预览。临时配置必须：
   - 使用独立 Worker 名称，例如 `codex-<branch-slug>-globaltrace`。
   - 设置 `workers_dev: true`。
   - 不包含 `routes`、`custom_domain` 或生产域名。
   - `assets.directory` 指向当前仓库的 `dist`。
   - `vars.APP_ENV` 使用 `preview` 或 `development`，不要写入 secret。

4. 执行预览部署：

```bash
npx wrangler deploy --config <temporary-preview-wrangler-config> --message "Preview <commit> <summary>"
```

5. 验证预览 URL：

```bash
curl -fsSI https://<preview-worker>.<account-subdomain>.workers.dev/
curl -fsSL https://<preview-worker>.<account-subdomain>.workers.dev/api/config
curl -fsSL https://<preview-worker>.<account-subdomain>.workers.dev/ | rg -o 'assets/[^" ]+'
```

6. 汇报预览 URL、当前分支、commit、验证结果，以及是否出现 Wrangler 本机日志 `EPERM` 噪音。

撤销预览时，只删除对应的独立 preview Worker，不要碰生产 Worker：

```bash
npx wrangler delete <preview-worker-name> --config <temporary-preview-wrangler-config> --dry-run
npx wrangler delete <preview-worker-name> --config <temporary-preview-wrangler-config> --force
curl -fsSI https://<preview-worker>.<account-subdomain>.workers.dev/
curl -fsSI https://lg.nxtrace.org/
```

预览 URL 删除后应返回 404 或不可访问；生产首页仍应返回 200。

## 已知本机问题

- Playwright/Chromium smoke 如果在沙箱里报 `bootstrap_check_in ... Permission denied (1100)`，先在非沙箱/提权环境重跑同一 smoke；不要直接判定为应用回归。
- Wrangler 如果报无法写入 `~/Library/Preferences/.wrangler/logs/...` 的 `EPERM`，检查 deploy 输出是否已经上传并发布成功；本地日志写入失败不等于部署失败。
