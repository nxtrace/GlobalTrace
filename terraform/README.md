# GlobalTrace Terraform Placeholder

This directory is a template only. It does not contain an API token, secret, zone id, or production hostname.

It expresses Cloudflare WAF Rate Limiting as a zone-level `cloudflare_ruleset` in `phase = "http_ratelimit"`:

- One host-scoped `globaltrace_api_ip` rule for `var.globaltrace_hostname`.
- The rule covers `POST /api/trace/enrich` and `POST /api/turnstile/verify`.
- The default limit is 20 requests per 60 seconds by `cf.colo.id` and `ip.src`, with a 600 second block.

Pass deployment-specific values through ignored `terraform/*.tfvars` files or command line variables.

Do not add `NXTRACE_API_V4_TOKEN` or `TURNSTILE_SECRET_KEY` to Terraform variables.
