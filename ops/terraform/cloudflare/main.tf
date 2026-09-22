locals {
  api_host_expression = "http.host eq \"${var.api_hostname}\""
}

resource "cloudflare_dns_record" "storefront" {
  zone_id = var.zone_id
  name    = var.storefront_hostname
  content = var.storefront_origin_hostname
  type    = "CNAME"
  ttl     = 1
  proxied = true
  comment = "Production storefront managed by Terraform"
}

resource "cloudflare_dns_record" "api" {
  zone_id = var.zone_id
  name    = var.api_hostname
  content = var.api_origin_hostname
  type    = "CNAME"
  ttl     = 1
  proxied = true
  comment = "Production API managed by Terraform"
}

resource "cloudflare_ruleset" "custom_waf" {
  zone_id     = var.zone_id
  name        = "Modern Trade custom WAF"
  description = "Edge protections that are independent of application releases"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [
    {
      ref         = "block-unsafe-http-methods"
      description = "Block HTTP methods the public application does not support"
      expression  = "(${local.api_host_expression} or http.host eq \"${var.storefront_hostname}\") and http.request.method in {\"TRACE\" \"CONNECT\"}"
      action      = "block"
      enabled     = true
    }
  ]
}

resource "cloudflare_ruleset" "managed_waf" {
  count = var.enable_managed_waf ? 1 : 0

  zone_id     = var.zone_id
  name        = "Modern Trade managed WAF"
  description = "Cloudflare managed and OWASP Core rulesets"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules = [
    {
      ref         = "cloudflare-managed-ruleset"
      description = "Execute Cloudflare Managed Ruleset"
      expression  = "true"
      action      = "execute"
      action_parameters = {
        id = "efb7b8c949ac4650a09736fc376e9aee"
      }
      enabled = true
    },
    {
      ref         = "cloudflare-owasp-core-ruleset"
      description = "Execute Cloudflare OWASP Core Ruleset"
      expression  = "true"
      action      = "execute"
      action_parameters = {
        id = "4814384a9e5d4991b9815dcfc25d2f1f"
      }
      enabled = true
    }
  ]
}

resource "cloudflare_ruleset" "rate_limits" {
  zone_id     = var.zone_id
  name        = "Modern Trade API rate limits"
  description = "Per-IP edge limits; application-level identity limits remain authoritative"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    {
      ref         = "limit-auth-and-otp"
      description = "Protect authentication and OTP endpoints"
      expression  = "${local.api_host_expression} and starts_with(http.request.uri.path, \"/api/auth/\")"
      action      = "block"
      enabled     = true
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 60
        requests_per_period = var.auth_requests_per_minute
        mitigation_timeout  = var.rate_limit_mitigation_seconds
      }
    },
    {
      ref         = "limit-general-api"
      description = "Protect all other API endpoints from abusive bursts"
      expression  = "${local.api_host_expression} and starts_with(http.request.uri.path, \"/api/\") and not starts_with(http.request.uri.path, \"/api/auth/\")"
      action      = "block"
      enabled     = true
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 60
        requests_per_period = var.api_requests_per_minute
        mitigation_timeout  = var.rate_limit_mitigation_seconds
      }
    }
  ]
}
