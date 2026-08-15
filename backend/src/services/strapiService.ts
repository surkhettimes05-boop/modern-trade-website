import axios from "axios";

interface StrapiConfig {
  apiUrl: string;
  apiToken: string;
}

interface StrapiResponse<T> {
  data: T;
  meta: {
    pagination?: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

export class StrapiService {
  private config: StrapiConfig;

  constructor() {
    this.config = {
      apiUrl: process.env.STRAPI_API_URL || "http://localhost:1337/api",
      apiToken: process.env.STRAPI_API_TOKEN || "",
    };
  }

  /**
   * Get entries from Strapi
   */
  async getEntries<T>(
    contentType: string,
    options: {
      populate?: string | string[];
      filters?: any;
      sort?: string;
      limit?: number;
      start?: number;
      fields?: string[];
    } = {},
  ): Promise<StrapiResponse<T[]>> {
    const params: any = {};

    if (options.populate) {
      params.populate = options.populate;
    }

    if (options.filters) {
      params.filters = options.filters;
    }

    if (options.sort) {
      params.sort = options.sort;
    }

    if (options.limit) {
      params["pagination[limit]"] = options.limit;
    }

    if (options.start) {
      params["pagination[start]"] = options.start;
    }

    if (options.fields) {
      params.fields = options.fields;
    }

    const response = await axios.get(`${this.config.apiUrl}/${contentType}`, {
      params,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
      },
    });

    return response.data;
  }

  /**
   * Get single entry from Strapi
   */
  async getEntry<T>(
    contentType: string,
    id: number | string,
    options: {
      populate?: string | string[];
      fields?: string[];
    } = {},
  ): Promise<StrapiResponse<T>> {
    const params: any = {};

    if (options.populate) {
      params.populate = options.populate;
    }

    if (options.fields) {
      params.fields = options.fields;
    }

    const response = await axios.get(
      `${this.config.apiUrl}/${contentType}/${id}`,
      {
        params,
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
        },
      },
    );

    return response.data;
  }

  /**
   * Create entry in Strapi
   */
  async createEntry<T>(
    contentType: string,
    data: any,
  ): Promise<StrapiResponse<T>> {
    const response = await axios.post(
      `${this.config.apiUrl}/${contentType}`,
      { data },
      {
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data;
  }

  /**
   * Update entry in Strapi
   */
  async updateEntry<T>(
    contentType: string,
    id: number | string,
    data: any,
  ): Promise<StrapiResponse<T>> {
    const response = await axios.put(
      `${this.config.apiUrl}/${contentType}/${id}`,
      { data },
      {
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data;
  }

  /**
   * Delete entry from Strapi
   */
  async deleteEntry(
    contentType: string,
    id: number | string,
  ): Promise<StrapiResponse<null>> {
    const response = await axios.delete(
      `${this.config.apiUrl}/${contentType}/${id}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
        },
      },
    );

    return response.data;
  }

  /**
   * Upload file to Strapi
   */
  async uploadFile(
    file: Buffer,
    filename: string,
    _mimeType: string,
  ): Promise<StrapiResponse<any>> {
    const formData = new FormData();
    formData.append("files", file, filename);

    const response = await axios.post(
      `${this.config.apiUrl}/upload`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "multipart/form-data",
        },
      },
    );

    return response.data;
  }

  /**
   * Get products from Strapi
   */
  async getProducts(
    options: {
      category?: string;
      limit?: number;
      populate?: string[];
    } = {},
  ): Promise<any[]> {
    const filters: any = {};

    if (options.category) {
      filters.category = { $eq: options.category };
    }

    const response = await this.getEntries("products", {
      populate: options.populate || ["category", "images", "variants"],
      filters,
      limit: options.limit,
    });

    return response.data;
  }

  /**
   * Get categories from Strapi
   */
  async getCategories(
    options: {
      limit?: number;
    } = {},
  ): Promise<any[]> {
    const response = await this.getEntries("categories", {
      populate: ["parent"],
      limit: options.limit,
    });

    return response.data;
  }

  /**
   * Get banners from Strapi
   */
  async getBanners(
    options: {
      location?: string;
      limit?: number;
    } = {},
  ): Promise<any[]> {
    const filters: any = {};

    if (options.location) {
      filters.location = { $eq: options.location };
    }

    const response = await this.getEntries("banners", {
      populate: ["image", "mobile_image"],
      filters,
      limit: options.limit,
      sort: "order:asc",
    });

    return response.data;
  }

  /**
   * Get pages from Strapi
   */
  async getPage(slug: string): Promise<any> {
    const response = await this.getEntries("pages", {
      filters: { slug: { $eq: slug } },
      populate: ["sections", "seo"],
      limit: 1,
    });

    return response.data[0] || null;
  }

  /**
   * Get settings from Strapi
   */
  async getSettings(): Promise<any> {
    const response = await this.getEntries("global-settings", {
      populate: ["logo", "favicon", "default_image"],
      limit: 1,
    });

    return response.data[0] || null;
  }

  /**
   * Clear Strapi cache
   */
  async clearCache(): Promise<void> {
    try {
      await axios.post(
        `${this.config.apiUrl}/cache/clear`,
        {},
        {
          headers: {
            Authorization: `Bearer ${this.config.apiToken}`,
          },
        },
      );
    } catch (error) {
      console.error("Failed to clear Strapi cache:", error);
    }
  }

  /**
   * Health check for Strapi
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.config.apiUrl}/health`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const strapiService = new StrapiService();
