terraform {
  required_version = ">= 1.8.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.15"
    }
  }
}

provider "cloudflare" {
  # Authentication is supplied through CLOUDFLARE_API_TOKEN. Keeping the token
  # out of Terraform configuration prevents it from being written to source.
}
