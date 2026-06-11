# GlobalTrace 协作规则

## 执行边界

- 先读本文件，再做非平凡改动。
- 用户给出明确范围时，只改该范围；不要顺手重构、改格式或清理无关代码。
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

- `NXTRACE_API_V4_TOKEN` 和 `TURNSTILE_SECRET_KEY` 只能作为 Wrangler Worker secrets。
- 不要把真实 secret 写入 Git、Terraform、测试 fixture、文档示例或 frontend `VITE_*` 值。
- `TURNSTILE_SITE_KEY` 是公开值，但生产 site key 放在 ignored 私有配置中，避免公开仓库暴露部署标识。
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

用户明确说“提交并部署”时，默认执行最小安全提交、部署和线上验证：

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

## 已知本机问题

- Playwright/Chromium smoke 如果在沙箱里报 `bootstrap_check_in ... Permission denied (1100)`，先在非沙箱/提权环境重跑同一 smoke；不要直接判定为应用回归。
- Wrangler 如果报无法写入 `~/Library/Preferences/.wrangler/logs/...` 的 `EPERM`，检查 deploy 输出是否已经上传并发布成功；本地日志写入失败不等于部署失败。
