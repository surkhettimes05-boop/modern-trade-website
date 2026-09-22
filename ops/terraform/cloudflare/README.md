# Cloudflare production edge

This module creates proxied CNAME records for the storefront and API, blocks
unsupported HTTP methods, and rate-limits public API traffic. Cloudflare's
managed and OWASP rulesets are opt-in because availability depends on the zone's
plan.

## Before the first plan

1. Create a least-privilege Cloudflare API token with `Zone:DNS:Edit`,
   `Zone:Zone:Read`, and `Zone:Firewall Services:Edit` for the production zone.
2. Export the token as `CLOUDFLARE_API_TOKEN`; never place it in a `.tfvars` file.
3. Copy `terraform.tfvars.example` to `terraform.tfvars` and replace every
   example value.
4. If the DNS records or ruleset phases already exist, import them into state
   before applying. A zone can have only one entry-point ruleset per phase, and
   this module is intended to own the phases it declares.
5. Store Terraform state in an encrypted, access-controlled remote backend before
   the first production apply. Do not use local state for production.

Then run:

```powershell
terraform init
terraform fmt -check
terraform validate
terraform plan -out production.tfplan
terraform apply production.tfplan
```

## Origin protection is a separate control

A proxied DNS record prevents ordinary clients from resolving the origin through
your public hostname, but it does not make a separately discoverable hosting URL
private. Restrict origin ingress to Cloudflare IP ranges, use authenticated origin
pulls, or place the origin behind Cloudflare Tunnel where the hosting platform
supports it. Do not call the origin "hidden" until direct-origin requests have
been tested and rejected.

Keep backend rate limiting enabled as defense in depth. Edge limits are IP based
and cannot replace per-account, per-session, or per-operation limits enforced by
the application.
