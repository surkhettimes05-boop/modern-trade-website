import {
  BaseMapProvider,
  GeocodeRequest,
  GeocodeResponse,
  ReverseGeocodeRequest,
  ReverseGeocodeResponse,
  AutocompleteRequest,
  AutocompleteResponse,
  RouteRequest,
  RouteResponse,
  DistanceRequest,
  DistanceResponse,
} from "./mapProviders/baseMapProvider.js";
import { BaatoProvider } from "./mapProviders/baatoProvider.js";
import { GalliProvider } from "./mapProviders/galliProvider.js";
import { query } from "../database/connection.js";
import { cacheService } from "./cacheService.js";

export class MapProviderService {
  private providers: Map<string, BaseMapProvider>;
  private defaultProvider: string;

  constructor() {
    this.providers = new Map();
    this.defaultProvider = process.env.DEFAULT_MAP_PROVIDER || "Baato";
    this.initializeProviders();
  }

  /**
   * Initialize map providers
   */
  private initializeProviders(): void {
    if (process.env.BAATO_API_KEY)
      this.providers.set("Baato", new BaatoProvider());
    if (process.env.GALLI_API_KEY)
      this.providers.set("Galli", new GalliProvider());
  }

  /**
   * Get provider by name
   */
  getProvider(providerName?: string): BaseMapProvider {
    const name = providerName || this.defaultProvider;
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`MAP_PROVIDER_UNAVAILABLE: ${name}`);
    }
    return provider;
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Geocode address with caching
   */
  async geocode(
    request: GeocodeRequest,
    providerName?: string,
  ): Promise<GeocodeResponse> {
    const cacheKey = `geocode:${request.address}:${providerName || this.defaultProvider}`;

    // Try cache first
    const cached = await cacheService.getCachedGeocoding(cacheKey);
    if (cached) {
      return cached;
    }

    const provider = this.getProvider(providerName);
    const result = await provider.geocode(request);

    // Cache for 24 hours
    await cacheService.cacheGeocoding(cacheKey, result, 86400);

    return result;
  }

  /**
   * Reverse geocode with caching
   */
  async reverseGeocode(
    request: ReverseGeocodeRequest,
    providerName?: string,
  ): Promise<ReverseGeocodeResponse> {
    const cacheKey = `reverse_geocode:${request.latitude},${request.longitude}:${providerName || this.defaultProvider}`;

    // Try cache first
    const cached = await cacheService.getCachedGeocoding(cacheKey);
    if (cached) {
      return cached;
    }

    const provider = this.getProvider(providerName);
    const result = await provider.reverseGeocode(request);

    // Cache for 24 hours
    await cacheService.cacheGeocoding(cacheKey, result, 86400);

    return result;
  }

  /**
   * Autocomplete address
   */
  async autocomplete(
    request: AutocompleteRequest,
    providerName?: string,
  ): Promise<AutocompleteResponse> {
    const provider = this.getProvider(providerName);
    return await provider.autocomplete(request);
  }

  /**
   * Get route
   */
  async getRoute(
    request: RouteRequest,
    providerName?: string,
  ): Promise<RouteResponse> {
    const provider = this.getProvider(providerName);
    return await provider.getRoute(request);
  }

  /**
   * Get distance matrix
   */
  async getDistanceMatrix(
    request: DistanceRequest,
    providerName?: string,
  ): Promise<DistanceResponse> {
    const provider = this.getProvider(providerName);
    return await provider.getDistanceMatrix(request);
  }

  /**
   * Save geocoding result to database
   */
  async saveGeocodingResult(
    queryString: string,
    provider: string,
    result: GeocodeResponse,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    // Check if already exists
    const existing = await query(
      "SELECT id FROM geocoding_cache WHERE query = $1 AND provider = $2",
      [queryString, provider],
    );

    if (existing.rows.length > 0) {
      // Update existing
      await query(
        `UPDATE geocoding_cache 
         SET latitude = $1, longitude = $2, formatted_address = $3, raw_response = $4, expires_at = $5
         WHERE query = $6 AND provider = $7`,
        [
          result.latitude,
          result.longitude,
          result.formatted_address,
          JSON.stringify(result),
          expiresAt,
          queryString,
          provider,
        ],
      );
    } else {
      // Insert new
      await query(
        `INSERT INTO geocoding_cache (query, provider, latitude, longitude, formatted_address, raw_response, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          queryString,
          provider,
          result.latitude,
          result.longitude,
          result.formatted_address,
          JSON.stringify(result),
          expiresAt,
        ],
      );
    }
  }

  /**
   * Get geocoding result from database
   */
  async getGeocodingResult(
    queryString: string,
    provider: string,
  ): Promise<GeocodeResponse | null> {
    const result = await query(
      `SELECT * FROM geocoding_cache 
       WHERE query = $1 AND provider = $2 AND expires_at > NOW()
       LIMIT 1`,
      [queryString, provider],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      latitude: parseFloat(result.rows[0].latitude),
      longitude: parseFloat(result.rows[0].longitude),
      formatted_address: result.rows[0].formatted_address,
      components: result.rows[0].raw_response?.components || {},
      raw_response: result.rows[0].raw_response,
    };
  }

  /**
   * Invalidate geocoding cache for address
   */
  async invalidateGeocodingCache(
    queryString: string,
    provider: string,
  ): Promise<void> {
    await query(
      "DELETE FROM geocoding_cache WHERE query = $1 AND provider = $2",
      [queryString, provider],
    );
  }

  /**
   * Clean expired geocoding cache
   */
  async cleanExpiredGeocodingCache(): Promise<number> {
    const result = await query(
      "DELETE FROM geocoding_cache WHERE expires_at < NOW() RETURNING id",
    );
    return result.rowCount || 0;
  }
}

// Export singleton instance
export const mapProviderService = new MapProviderService();
