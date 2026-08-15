export interface GeocodeRequest {
  address: string;
  municipality?: string;
  district?: string;
  country?: string;
}

export interface GeocodeResponse {
  latitude: number;
  longitude: number;
  formatted_address: string;
  components: {
    municipality?: string;
    district?: string;
    ward?: string;
    tole?: string;
    street?: string;
    landmark?: string;
    country?: string;
  };
  raw_response?: any;
}

export interface ReverseGeocodeRequest {
  latitude: number;
  longitude: number;
}

export interface ReverseGeocodeResponse {
  formatted_address: string;
  components: {
    municipality?: string;
    district?: string;
    ward?: string;
    tole?: string;
    street?: string;
    landmark?: string;
    country?: string;
  };
  raw_response?: any;
}

export interface AutocompleteRequest {
  query: string;
  limit?: number;
  municipality?: string;
  district?: string;
}

export interface AutocompleteResponse {
  predictions: Array<{
    place_id: string;
    description: string;
    structured_formatting: {
      main_text: string;
      secondary_text: string;
    };
    components: any;
  }>;
  raw_response?: any;
}

export interface RouteRequest {
  origin: {
    latitude: number;
    longitude: number;
  };
  destination: {
    latitude: number;
    longitude: number;
  };
  mode?: "driving" | "walking" | "cycling";
}

export interface RouteResponse {
  distance: number; // in meters
  duration: number; // in seconds
  polyline: string;
  steps: Array<{
    instruction: string;
    distance: number;
    duration: number;
  }>;
  raw_response?: any;
}

export interface DistanceRequest {
  origins: Array<{ latitude: number; longitude: number }>;
  destinations: Array<{ latitude: number; longitude: number }>;
}

export interface DistanceResponse {
  distances: number[][];
  durations: number[][];
  raw_response?: any;
}

/**
 * Abstract base class for map providers
 */
export abstract class BaseMapProvider {
  protected providerName: string;
  protected apiKey: string;
  protected baseUrl: string;

  constructor(providerName: string, apiKey: string, baseUrl: string) {
    this.providerName = providerName;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return this.providerName;
  }

  /**
   * Geocode address to coordinates
   */
  abstract geocode(request: GeocodeRequest): Promise<GeocodeResponse>;

  /**
   * Reverse geocode coordinates to address
   */
  abstract reverseGeocode(
    request: ReverseGeocodeRequest,
  ): Promise<ReverseGeocodeResponse>;

  /**
   * Autocomplete address suggestions
   */
  abstract autocomplete(
    request: AutocompleteRequest,
  ): Promise<AutocompleteResponse>;

  /**
   * Get route between two points
   */
  abstract getRoute(request: RouteRequest): Promise<RouteResponse>;

  /**
   * Get distance matrix
   */
  abstract getDistanceMatrix(
    request: DistanceRequest,
  ): Promise<DistanceResponse>;

  /**
   * Validate coordinates
   */
  protected validateCoordinates(latitude: number, longitude: number): void {
    if (latitude < -90 || latitude > 90) {
      throw new Error("Invalid latitude");
    }
    if (longitude < -180 || longitude > 180) {
      throw new Error("Invalid longitude");
    }
  }

  /**
   * Validate address
   */
  protected validateAddress(address: string): void {
    if (!address || address.trim().length < 3) {
      throw new Error("Address too short");
    }
  }

  /**
   * Format address components
   */
  protected formatAddress(components: any): string {
    const parts = [];
    if (components.tole) parts.push(components.tole);
    if (components.ward) parts.push(`Ward ${components.ward}`);
    if (components.municipality) parts.push(components.municipality);
    if (components.district) parts.push(components.district);
    return parts.join(", ");
  }
}
