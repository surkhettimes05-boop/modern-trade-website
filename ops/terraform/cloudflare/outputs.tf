output "proxied_hostnames" {
  description = "Public hostnames routed through the Cloudflare proxy."
  value = {
    storefront = cloudflare_dns_record.storefront.name
    api        = cloudflare_dns_record.api.name
  }
}

output "managed_waf_enabled" {
  description = "Whether the Cloudflare managed rulesets are configured."
  value       = var.enable_managed_waf
}
