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
} from "./baseMapProvider.js";

export class BaatoProvider extends BaseMapProvider {
  constructor() {
    super(
      "Baato",
      process.env.BAATO_API_KEY || "",
      process.env.BAATO_BASE_URL || "https://api.baato.com/api/v1",
    );
  }

  /**
   * Geocode address to coordinates
   */
  async geocode(request: GeocodeRequest): Promise<GeocodeResponse> {
    this.validateAddress(request.address);

    // In production, call Baato's geocoding API
    // Mock response for now
    return {
      latitude: 27.7172,
      longitude: 85.3238,
      formatted_address: request.address,
      components: {
        municipality: request.municipality,
        district: request.district,
        country: request.country || "Nepal",
      },
    };
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(
    request: ReverseGeocodeRequest,
  ): Promise<ReverseGeocodeResponse> {
    this.validateCoordinates(request.latitude, request.longitude);

    // In production, call Baato's reverse geocoding API
    // Mock response for now
    return {
      formatted_address: "Unknown Location, Nepal",
      components: {
        country: "Nepal",
      },
    };
  }

  /**
   * Autocomplete address suggestions
   */
  async autocomplete(
    request: AutocompleteRequest,
  ): Promise<AutocompleteResponse> {
    this.validateAddress(request.query);

    // In production, call Baato's autocomplete API
    // Mock response for now
    return {
      predictions: [
        {
          place_id: "1",
          description: request.query,
          structured_formatting: {
            main_text: request.query,
            secondary_text: "Nepal",
          },
          components: {},
        },
      ],
    };
  }

  /**
   * Get route between two points
   */
  async getRoute(request: RouteRequest): Promise<RouteResponse> {
    this.validateCoordinates(request.origin.latitude, request.origin.longitude);
    this.validateCoordinates(
      request.destination.latitude,
      request.destination.longitude,
    );

    // In production, call Baato's routing API
    // Mock response for now
    return {
      distance: 1000,
      duration: 300,
      polyline: "",
      steps: [
        {
          instruction: "Head north",
          distance: 500,
          duration: 150,
        },
        {
          instruction: "Turn right",
          distance: 500,
          duration: 150,
        },
      ],
    };
  }

  /**
   * Get distance matrix
   */
  async getDistanceMatrix(request: DistanceRequest): Promise<DistanceResponse> {
    // Validate all coordinates
    request.origins.forEach((o) =>
      this.validateCoordinates(o.latitude, o.longitude),
    );
    request.destinations.forEach((d) =>
      this.validateCoordinates(d.latitude, d.longitude),
    );

    // In production, call Baato's distance matrix API
    // Mock response for now
    const distances = request.origins.map(() =>
      request.destinations.map(() => 1000),
    );
    const durations = request.origins.map(() =>
      request.destinations.map(() => 300),
    );

    return {
      distances,
      durations,
    };
  }
}
