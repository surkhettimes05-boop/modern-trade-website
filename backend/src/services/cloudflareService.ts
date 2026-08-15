import axios from "axios";

interface CloudflareConfig {
  apiToken: string;
  accountId: string;
  zoneId: string;
}

export class CloudflareService {
  private config: CloudflareConfig;

  constructor() {
    this.config = {
      apiToken: process.env.CLOUDFLARE_API_TOKEN || "",
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
      zoneId: process.env.CLOUDFLARE_ZONE_ID || "",
    };
  }

  /**
   * Purge cache by URL
   */
  async purgeCacheByUrl(urls: string[]): Promise<any> {
    if (!this.config.apiToken || !this.config.zoneId) {
      console.warn("Cloudflare API token or zone ID not configured");
      return { success: false, reason: "not_configured" };
    }

    try {
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/purge_cache`,
        {
          files: urls,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Failed to purge Cloudflare cache:", error);
      throw error;
    }
  }

  /**
   * Purge cache by prefix
   */
  async purgeCacheByPrefix(prefixes: string[]): Promise<any> {
    if (!this.config.apiToken || !this.config.zoneId) {
      console.warn("Cloudflare API token or zone ID not configured");
      return { success: false, reason: "not_configured" };
    }

    try {
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/purge_cache`,
        {
          prefixes: prefixes,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Failed to purge Cloudflare cache by prefix:", error);
      throw error;
    }
  }

  /**
   * Purge entire cache
   */
  async purgeEntireCache(): Promise<any> {
    if (!this.config.apiToken || !this.config.zoneId) {
      console.warn("Cloudflare API token or zone ID not configured");
      return { success: false, reason: "not_configured" };
    }

    try {
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/purge_cache`,
        {
          purge_everything: true,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Failed to purge entire Cloudflare cache:", error);
      throw error;
    }
  }

  /**
   * Create cache rule
   */
  async createCacheRule(rule: {
    name: string;
    expression: string;
    action: string;
    value?: string;
  }): Promise<any> {
    if (!this.config.apiToken || !this.config.zoneId) {
      console.warn("Cloudflare API token or zone ID not configured");
      return { success: false, reason: "not_configured" };
    }

    try {
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/cache_rules`,
        {
          name: rule.name,
          expression: rule.expression,
          action: rule.action,
          value: rule.value,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Failed to create Cloudflare cache rule:", error);
      throw error;
    }
  }

  /**
   * Get zone analytics
   */
  async getZoneAnalytics(
    filters: {
      since?: Date;
      until?: Date;
      metrics?: string[];
    } = {},
  ): Promise<any> {
    if (!this.config.apiToken || !this.config.zoneId) {
      console.warn("Cloudflare API token or zone ID not configured");
      return { success: false, reason: "not_configured" };
    }

    try {
      const params: any = {
        metrics: filters.metrics || [
          "requests",
          "bandwidth",
          "threats",
          "cached_requests",
          "uncached_requests",
        ],
      };

      if (filters.since) {
        params.since = filters.since.toISOString();
      }

      if (filters.until) {
        params.until = filters.until.toISOString();
      }

      const response = await axios.get(
        `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/analytics/dashboard`,
        {
          params,
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Failed to get Cloudflare zone analytics:", error);
      throw error;
    }
  }

  /**
   * Set security level
   */
  async setSecurityLevel(
    level:
      "off" | "essentially_off" | "low" | "medium" | "high" | "under_attack",
  ): Promise<any> {
    if (!this.config.apiToken || !this.config.zoneId) {
      console.warn("Cloudflare API token or zone ID not configured");
      return { success: false, reason: "not_configured" };
    }

    try {
      const response = await axios.patch(
        `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/settings/security_level`,
        {
          value: level,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Failed to set Cloudflare security level:", error);
      throw error;
    }
  }

  /**
   * Create firewall rule
   */
  async createFirewallRule(rule: {
    name: string;
    expression: string;
    action: "block" | "challenge" | "allow" | "managed_challenge";
    description?: string;
  }): Promise<any> {
    if (!this.config.apiToken || !this.config.zoneId) {
      console.warn("Cloudflare API token or zone ID not configured");
      return { success: false, reason: "not_configured" };
    }

    try {
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/firewall/rules`,
        {
          name: rule.name,
          expression: rule.expression,
          action: rule.action,
          description: rule.description,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Failed to create Cloudflare firewall rule:", error);
      throw error;
    }
  }

  /**
   * Get firewall rules
   */
  async getFirewallRules(): Promise<any> {
    if (!this.config.apiToken || !this.config.zoneId) {
      console.warn("Cloudflare API token or zone ID not configured");
      return { success: false, reason: "not_configured" };
    }

    try {
      const response = await axios.get(
        `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}/firewall/rules`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Failed to get Cloudflare firewall rules:", error);
      throw error;
    }
  }

  /**
   * Health check for Cloudflare
   */
  async healthCheck(): Promise<boolean> {
    if (!this.config.apiToken || !this.config.zoneId) {
      return false;
    }

    try {
      const response = await axios.get(
        `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
          },
          timeout: 5000,
        },
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const cloudflareService = new CloudflareService();
