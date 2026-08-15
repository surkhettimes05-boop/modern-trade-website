import { redisService } from "./redisService.js";

interface CacheConfig {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
}

export class ProductionCacheService {
  /**
   * Cache data with TTL
   */
  async set(key: string, value: any, config: CacheConfig = {}): Promise<void> {
    const serialized = JSON.stringify(value);
    const ttl = config.ttl || 3600; // Default 1 hour

    await redisService.set(key, serialized, ttl);

    // Store cache tags if provided
    if (config.tags && config.tags.length > 0) {
      for (const tag of config.tags) {
        await redisService.sadd(`cache:tag:${tag}`, key);
      }
    }
  }

  /**
   * Get cached data
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await redisService.get(key);
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error("Failed to parse cached value:", error);
      return null;
    }
  }

  /**
   * Delete cached data
   */
  async delete(key: string): Promise<void> {
    await redisService.del(key);
  }

  /**
   * Invalidate cache by tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    const keys = await redisService.smembers(`cache:tag:${tag}`);

    if (keys.length === 0) {
      return 0;
    }

    // Delete all keys with this tag
    await redisService.delMultiple(keys);

    // Remove the tag set
    await redisService.del(`cache:tag:${tag}`);

    return keys.length;
  }

  /**
   * Invalidate multiple tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    let totalInvalidated = 0;

    for (const tag of tags) {
      totalInvalidated += await this.invalidateByTag(tag);
    }

    return totalInvalidated;
  }

  /**
   * Get or set pattern (cache-aside)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    config: CacheConfig = {},
  ): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, config);

    return value;
  }

  /**
   * Cache API response
   */
  async cacheResponse(
    key: string,
    response: any,
    config: CacheConfig = {},
  ): Promise<void> {
    await this.set(key, response, config);
  }

  /**
   * Get cached API response
   */
  async getCachedResponse<T>(key: string): Promise<T | null> {
    return await this.get<T>(key);
  }

  /**
   * Generate cache key for API endpoint
   */
  generateCacheKey(endpoint: string, params?: any): string {
    if (!params || Object.keys(params).length === 0) {
      return `api:${endpoint}`;
    }

    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}=${JSON.stringify(params[key])}`)
      .join("&");

    return `api:${endpoint}:${Buffer.from(sortedParams).toString("base64")}`;
  }

  /**
   * Warm up cache with data
   */
  async warmCache(
    entries: Array<{ key: string; value: any; config?: CacheConfig }>,
  ): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.config);
    }
  }

  /**
   * Clear all cache (use with caution)
   */
  async clearAll(): Promise<void> {
    // Get all keys with cache: prefix
    const keys = await redisService.keys("cache:*");

    if (keys.length > 0) {
      await redisService.delMultiple(keys);
    }
  }

  /**
   * Get cache statistics
   */
  async getStatistics(): Promise<any> {
    const keys = await redisService.keys("cache:*");
    const tagKeys = await redisService.keys("cache:tag:*");

    let totalSize = 0;
    for (const key of keys) {
      const value = await redisService.get(key);
      if (value) {
        totalSize += Buffer.byteLength(value, "utf8");
      }
    }

    return {
      total_keys: keys.length,
      total_tags: tagKeys.length,
      total_size_bytes: totalSize,
      total_size_mb: (totalSize / (1024 * 1024)).toFixed(2),
    };
  }

  /**
   * Set cache with sliding expiration
   */
  async setWithSlidingExpiration(
    key: string,
    value: any,
    ttl: number,
  ): Promise<void> {
    await this.set(key, value, { ttl });
  }

  /**
   * Get and refresh TTL (sliding expiration)
   */
  async getAndRefresh<T>(key: string, ttl: number): Promise<T | null> {
    const value = await this.get<T>(key);

    if (value !== null) {
      await redisService.expire(key, ttl);
    }

    return value;
  }
}

export const productionCacheService = new ProductionCacheService();
