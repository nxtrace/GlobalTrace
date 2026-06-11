output "globaltrace_rate_limit_ruleset_id" {
  value       = cloudflare_ruleset.globaltrace_rate_limit.id
  description = "Created Cloudflare WAF rate limiting ruleset ID."
}
