variable "zone_id" {
  description = "Cloudflare zone ID for the production domain."
  type        = string

  validation {
    condition     = length(trimspace(var.zone_id)) > 0
    error_message = "zone_id must not be empty."
  }
}

variable "storefront_hostname" {
  description = "Fully qualified public hostname for the storefront, for example shop.example.com."
  type        = string
}

variable "storefront_origin_hostname" {
  description = "Origin CNAME target for the storefront; specify a hostname, not a URL."
  type        = string
}

variable "api_hostname" {
  description = "Fully qualified public hostname for the API, for example api.example.com."
  type        = string
}

variable "api_origin_hostname" {
  description = "Origin CNAME target for the API; specify a hostname, not a URL."
  type        = string
}

variable "enable_managed_waf" {
  description = "Deploy Cloudflare Managed and OWASP Core rulesets. Requires a compatible Cloudflare plan."
  type        = bool
  default     = false
}

variable "api_requests_per_minute" {
  description = "Per-IP API request ceiling enforced at the edge."
  type        = number
  default     = 120

  validation {
    condition     = var.api_requests_per_minute >= 1
    error_message = "api_requests_per_minute must be at least 1."
  }
}

variable "auth_requests_per_minute" {
  description = "Per-IP authentication and OTP request ceiling enforced at the edge."
  type        = number
  default     = 10

  validation {
    condition     = var.auth_requests_per_minute >= 1
    error_message = "auth_requests_per_minute must be at least 1."
  }
}

variable "rate_limit_mitigation_seconds" {
  description = "How long an offending IP is blocked after exceeding a rate limit."
  type        = number
  default     = 600

  validation {
    condition     = var.rate_limit_mitigation_seconds >= 10
    error_message = "rate_limit_mitigation_seconds must be at least 10."
  }
}
