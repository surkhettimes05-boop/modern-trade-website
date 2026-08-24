import Redis from "ioredis";
import { logger } from "../utils/logger.js";

class RedisService {
  private client: Redis | null = null;
  private namespace: string = "storesync";

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const namespace = process.env.REDIS_NAMESPACE || "storesync";

    this.namespace = namespace;
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 5_000,
      commandTimeout: 5_000,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on("connect", () => {
      logger.info("Redis connected");
    });

    this.client.on("error", (err: Error) => {
      logger.error("Redis connection error", { error: err.message });
    });

    this.client.on("close", () => {
      logger.info("Redis connection closed");
    });

    // Test connection
    try {
      await this.client.ping();
      logger.info("Redis connection test successful");
    } catch (error) {
      logger.error("Redis connection test failed", {
        error: error instanceof Error ? error.message : "UNKNOWN_REDIS_ERROR",
      });
      throw error;
    }
  }

  /**
   * Disconnect Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  /**
   * Get Redis client
   */
  getClient(): Redis {
    if (!this.client) {
      throw new Error("Redis client not initialized. Call connect() first.");
    }
    return this.client;
  }

  /**
   * Generate namespaced key
   */
  private namespacedKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  /**
   * Set value with expiration
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);

    if (ttlSeconds) {
      await client.setex(namespacedKey, ttlSeconds, value);
    } else {
      await client.set(namespacedKey, value);
    }
  }

  /**
   * Get value
   */
  async get(key: string): Promise<string | null> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    return await client.get(namespacedKey);
  }

  /**
   * Set JSON value
   */
  async setJSON(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const jsonValue = JSON.stringify(value);
    await this.set(key, jsonValue, ttlSeconds);
  }

  /**
   * Get JSON value
   */
  async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      logger.warn("Failed to parse JSON from Redis", {
        error: error instanceof Error ? error.message : "INVALID_REDIS_JSON",
      });
      return null;
    }
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<void> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    await client.del(namespacedKey);
  }

  /**
   * Delete multiple keys
   */
  async delMultiple(keys: string[]): Promise<void> {
    const client = this.getClient();
    const namespacedKeys = keys.map((k) => this.namespacedKey(k));
    await client.del(...namespacedKeys);
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    const result = await client.exists(namespacedKey);
    return result === 1;
  }

  /**
   * Set expiration on existing key
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    await client.expire(namespacedKey, ttlSeconds);
  }

  /**
   * Get TTL of key
   */
  async ttl(key: string): Promise<number> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    return await client.ttl(namespacedKey);
  }

  /**
   * Increment value
   */
  async incr(key: string): Promise<number> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    return await client.incr(namespacedKey);
  }

  /**
   * Increment value by amount
   */
  async incrBy(key: string, amount: number): Promise<number> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    return await client.incrby(namespacedKey, amount);
  }

  /**
   * Decrement value
   */
  async decr(key: string): Promise<number> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    return await client.decr(namespacedKey);
  }

  /**
   * Decrement value by amount
   */
  async decrBy(key: string, amount: number): Promise<number> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    return await client.decrby(namespacedKey, amount);
  }

  /**
   * Set value only if key doesn't exist
   */
  async setNX(key: string, value: string): Promise<boolean> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    const result = await client.setnx(namespacedKey, value);
    return result === 1;
  }

  /**
   * Get and delete key
   */
  async getDel(key: string): Promise<string | null> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    return await client.getdel(namespacedKey);
  }

  /**
   * Acquire distributed lock
   */
  async acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(`lock:${lockKey}`);
    const lockValue = Date.now().toString();

    const result = await client.set(
      namespacedKey,
      lockValue,
      "PX",
      ttlSeconds * 1000,
      "NX",
    );
    return result === "OK";
  }

  /**
   * Release distributed lock
   */
  async releaseLock(lockKey: string): Promise<void> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(`lock:${lockKey}`);
    await client.del(namespacedKey);
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    const client = this.getClient();
    const namespacedPattern = this.namespacedKey(pattern);
    const keys = await client.keys(namespacedPattern);

    if (keys.length > 0) {
      await client.del(...keys);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    const client = this.getClient();
    const info = await client.info("stats");
    const memory = await client.info("memory");

    return {
      stats: info,
      memory: memory,
    };
  }

  /**
   * Get keys by pattern
   */
  async keys(pattern: string): Promise<string[]> {
    const client = this.getClient();
    const namespacedPattern = this.namespacedKey(pattern);
    return await client.keys(namespacedPattern);
  }

  /**
   * Add to set
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    return await client.sadd(namespacedKey, ...members);
  }

  /**
   * Get all set members
   */
  async smembers(key: string): Promise<string[]> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    return await client.smembers(namespacedKey);
  }

  /**
   * Remove from set
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    const client = this.getClient();
    const namespacedKey = this.namespacedKey(key);
    return await client.srem(namespacedKey, ...members);
  }

  /**
   * Flush all keys in namespace
   */
  async flushNamespace(): Promise<void> {
    const client = this.getClient();
    const pattern = this.namespacedKey("*");
    const keys = await client.keys(pattern);

    if (keys.length > 0) {
      await client.del(...keys);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.ping();
      return true;
    } catch (error) {
      logger.warn("Redis health check failed", {
        error: error instanceof Error ? error.message : "REDIS_HEALTH_ERROR",
      });
      return false;
    }
  }
}

// Export singleton instance
export const redisService = new RedisService();
