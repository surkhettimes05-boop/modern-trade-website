import { redisService } from "./redisService.js";

export class CacheService {
  private readonly DEFAULT_TTL = 3600; // 1 hour

  /**
   * Cache product data
   */
  async cacheProduct(
    productId: string,
    productData: any,
    ttlSeconds?: number,
  ): Promise<void> {
    const key = `product:${productId}`;
    await redisService.setJSON(
      key,
      productData,
      ttlSeconds || this.DEFAULT_TTL,
    );
  }

  /**
   * Get cached product
   */
  async getCachedProduct(productId: string): Promise<any | null> {
    const key = `product:${productId}`;
    return await redisService.getJSON(key);
  }

  /**
   * Invalidate product cache
   */
  async invalidateProductCache(productId: string): Promise<void> {
    const key = `product:${productId}`;
    await redisService.del(key);
  }

  /**
   * Cache category data
   */
  async cacheCategory(
    categoryId: string,
    categoryData: any,
    ttlSeconds?: number,
  ): Promise<void> {
    const key = `category:${categoryId}`;
    await redisService.setJSON(
      key,
      categoryData,
      ttlSeconds || this.DEFAULT_TTL,
    );
  }

  /**
   * Get cached category
   */
  async getCachedCategory(categoryId: string): Promise<any | null> {
    const key = `category:${categoryId}`;
    return await redisService.getJSON(key);
  }

  /**
   * Cache store data
   */
  async cacheStore(
    storeId: string,
    storeData: any,
    ttlSeconds?: number,
  ): Promise<void> {
    const key = `store:${storeId}`;
    await redisService.setJSON(key, storeData, ttlSeconds || this.DEFAULT_TTL);
  }

  /**
   * Get cached store
   */
  async getCachedStore(storeId: string): Promise<any | null> {
    const key = `store:${storeId}`;
    return await redisService.getJSON(key);
  }

  /**
   * Cache delivery zone data
   */
  async cacheDeliveryZone(
    zoneId: string,
    zoneData: any,
    ttlSeconds?: number,
  ): Promise<void> {
    const key = `delivery_zone:${zoneId}`;
    await redisService.setJSON(key, zoneData, ttlSeconds || this.DEFAULT_TTL);
  }

  /**
   * Get cached delivery zone
   */
  async getCachedDeliveryZone(zoneId: string): Promise<any | null> {
    const key = `delivery_zone:${zoneId}`;
    return await redisService.getJSON(key);
  }

  /**
   * Invalidate delivery zone cache
   */
  async invalidateDeliveryZoneCache(zoneId: string): Promise<void> {
    const key = `delivery_zone:${zoneId}`;
    await redisService.del(key);
  }

  /**
   * Cache cart data (short-lived)
   */
  async cacheCart(
    cartId: string,
    cartData: any,
    ttlSeconds = 1800,
  ): Promise<void> {
    const key = `cart:${cartId}`;
    await redisService.setJSON(key, cartData, ttlSeconds);
  }

  /**
   * Get cached cart
   */
  async getCachedCart(cartId: string): Promise<any | null> {
    const key = `cart:${cartId}`;
    return await redisService.getJSON(key);
  }

  /**
   * Invalidate cart cache
   */
  async invalidateCartCache(cartId: string): Promise<void> {
    const key = `cart:${cartId}`;
    await redisService.del(key);
  }

  /**
   * Cache stock reservation (very short-lived)
   */
  async cacheStockReservation(
    reservationId: string,
    reservationData: any,
    ttlSeconds = 600,
  ): Promise<void> {
    const key = `reservation:${reservationId}`;
    await redisService.setJSON(key, reservationData, ttlSeconds);
  }

  /**
   * Get cached stock reservation
   */
  async getCachedStockReservation(reservationId: string): Promise<any | null> {
    const key = `reservation:${reservationId}`;
    return await redisService.getJSON(key);
  }

  /**
   * Invalidate stock reservation cache
   */
  async invalidateStockReservationCache(reservationId: string): Promise<void> {
    const key = `reservation:${reservationId}`;
    await redisService.del(key);
  }

  /**
   * Cache COD policy
   */
  async cacheCODPolicy(
    storeId: string,
    policyData: any,
    ttlSeconds?: number,
  ): Promise<void> {
    const key = `cod_policy:${storeId}`;
    await redisService.setJSON(key, policyData, ttlSeconds || this.DEFAULT_TTL);
  }

  /**
   * Get cached COD policy
   */
  async getCachedCODPolicy(storeId: string): Promise<any | null> {
    const key = `cod_policy:${storeId}`;
    return await redisService.getJSON(key);
  }

  /**
   * Invalidate COD policy cache
   */
  async invalidateCODPolicyCache(storeId: string): Promise<void> {
    const key = `cod_policy:${storeId}`;
    await redisService.del(key);
  }

  /**
   * Cache search results
   */
  async cacheSearchResults(
    query: string,
    language: string,
    results: any[],
    ttlSeconds = 300,
  ): Promise<void> {
    const key = `search:${language}:${this.hashQuery(query)}`;
    await redisService.setJSON(key, results, ttlSeconds);
  }

  /**
   * Get cached search results
   */
  async getCachedSearchResults(
    query: string,
    language: string,
  ): Promise<any[] | null> {
    const key = `search:${language}:${this.hashQuery(query)}`;
    return await redisService.getJSON(key);
  }

  /**
   * Simple hash function for query strings
   */
  private hashQuery(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Invalidate all product-related cache
   */
  async invalidateProductCacheAll(): Promise<void> {
    await redisService.invalidatePattern("product:*");
  }

  /**
   * Invalidate all category cache
   */
  async invalidateCategoryCacheAll(): Promise<void> {
    await redisService.invalidatePattern("category:*");
  }

  /**
   * Invalidate all store cache
   */
  async invalidateStoreCacheAll(): Promise<void> {
    await redisService.invalidatePattern("store:*");
  }

  /**
   * Invalidate all delivery zone cache
   */
  async invalidateDeliveryZoneCacheAll(): Promise<void> {
    await redisService.invalidatePattern("delivery_zone:*");
  }

  /**
   * Invalidate all search cache
   */
  async invalidateSearchCacheAll(): Promise<void> {
    await redisService.invalidatePattern("search:*");
  }

  /**
   * Cache geocoding result
   */
  async cacheGeocoding(
    key: string,
    result: any,
    ttlSeconds = 86400,
  ): Promise<void> {
    await redisService.setJSON(key, result, ttlSeconds);
  }

  /**
   * Get cached geocoding result
   */
  async getCachedGeocoding(key: string): Promise<any | null> {
    return await redisService.getJSON(key);
  }

  /**
   * Warm up cache for frequently accessed data
   */
  async warmUpCache(
    products: any[],
    categories: any[],
    stores: any[],
  ): Promise<void> {
    const promises = [
      ...products.map((p) => this.cacheProduct(p.id, p)),
      ...categories.map((c) => this.cacheCategory(c.id, c)),
      ...stores.map((s) => this.cacheStore(s.id, s)),
    ];

    await Promise.allSettled(promises);
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<any> {
    return await redisService.getStats();
  }

  /**
   * Health check for cache
   */
  async healthCheck(): Promise<boolean> {
    return await redisService.healthCheck();
  }
}

// Export singleton instance
export const cacheService = new CacheService();
