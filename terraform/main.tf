terraform {
  required_version = ">= 1.6.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {}

resource "cloudflare_ruleset" "globaltrace_rate_limit" {
  zone_id     = var.cloudflare_zone_id
  name        = "GlobalTrace API rate limiting"
  description = "Placeholder WAF rate limiting rules for GlobalTrace Worker API."
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    {
      ref         = "globaltrace_api_ip"
      description = "Rate limit GlobalTrace API by colo and IP"
      expression  = "(http.host eq \"${var.globaltrace_hostname}\" and http.request.method eq \"POST\" and (http.request.uri.path eq \"/api/trace/enrich\" or http.request.uri.path eq \"/api/turnstile/verify\"))"
      action      = "block"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = var.api_rate_limit_period
        requests_per_period = var.api_requests_per_period
        mitigation_timeout  = var.api_mitigation_timeout
      }
    }
  ]
}
