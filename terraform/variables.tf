variable "cloudflare_zone_id" {
  description = "Target Cloudflare zone ID."
  type        = string
}

variable "globaltrace_hostname" {
  description = "Hostname served by the GlobalTrace Worker."
  type        = string
}

variable "api_rate_limit_period" {
  type    = number
  default = 60
}

variable "api_requests_per_period" {
  type    = number
  default = 20
}

variable "api_mitigation_timeout" {
  type    = number
  default = 600
}
