import { query } from "../database/connection.js";

interface ProductSearchIndex {
  id: string;
  product_id: string;
  name_en: string;
  name_ne: string;
  name_romanized: string;
  description_en: string;
  description_ne: string;
  description_romanized: string;
  synonyms: string[];
  sku: string;
  barcode: string;
  brand: string;
  category: string;
  created_at: Date;
  updated_at: Date;
}

export class ProductSearchService {
  /**
   * Index product for search
   */
  async indexProduct(productData: {
    product_id: string;
    name_en: string;
    name_ne?: string;
    name_romanized?: string;
    description_en?: string;
    description_ne?: string;
    description_romanized?: string;
    synonyms?: string[];
    sku?: string;
    barcode?: string;
    brand?: string;
    category?: string;
  }): Promise<ProductSearchIndex> {
    // Check if product is already indexed
    const existing = await query(
      "SELECT id FROM product_search_index WHERE product_id = $1",
      [productData.product_id],
    );

    if (existing.rows.length > 0) {
      // Update existing index
      const result = await query(
        `UPDATE product_search_index 
         SET name_en = $1, name_ne = $2, name_romanized = $3,
             description_en = $4, description_ne = $5, description_romanized = $6,
             synonyms = $7, sku = $8, barcode = $9, brand = $10, category = $11,
             updated_at = NOW()
         WHERE product_id = $12
         RETURNING *`,
        [
          productData.name_en,
          productData.name_ne || null,
          productData.name_romanized || null,
          productData.description_en || null,
          productData.description_ne || null,
          productData.description_romanized || null,
          productData.synonyms || [],
          productData.sku || null,
          productData.barcode || null,
          productData.brand || null,
          productData.category || null,
          productData.product_id,
        ],
      );
      return result.rows[0];
    }

    // Create new index
    const result = await query(
      `INSERT INTO product_search_index (
        product_id, name_en, name_ne, name_romanized, description_en,
        description_ne, description_romanized, synonyms, sku, barcode, brand, category
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        productData.product_id,
        productData.name_en,
        productData.name_ne || null,
        productData.name_romanized || null,
        productData.description_en || null,
        productData.description_ne || null,
        productData.description_romanized || null,
        productData.synonyms || [],
        productData.sku || null,
        productData.barcode || null,
        productData.brand || null,
        productData.category || null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Search products
   */
  async searchProducts(searchParams: {
    query: string;
    language?: "en" | "ne" | "romanized";
    limit?: number;
    offset?: number;
    store_id?: string;
  }): Promise<any[]> {
    const {
      query: searchQuery,
      language = "en",
      limit = 20,
      offset = 0,
      store_id,
    } = searchParams;

    if (!searchQuery || searchQuery.trim().length < 2) {
      return [];
    }

    let searchVector = "search_vector_en";
    if (language === "ne") {
      searchVector = "search_vector_ne";
    } else if (language === "romanized") {
      searchVector = "search_vector_romanized";
    }

    // Use PostgreSQL full-text search with ranking
    const queryText = `
      SELECT psi.*, p.price, p.image_url, p.is_published,
             ts_rank(psi.${searchVector}, plainto_tsquery('english', $1)) as rank
      FROM product_search_index psi
      LEFT JOIN products p ON psi.product_id = p.id
      WHERE psi.${searchVector} @@ plainto_tsquery('english', $1)
      ${store_id ? "AND p.id IN (SELECT product_id FROM store_inventory WHERE store_id = $4)" : ""}
      ORDER BY rank DESC, psi.name_en
      LIMIT $2 OFFSET $3
    `;

    const params = store_id
      ? [searchQuery, limit, offset, store_id]
      : [searchQuery, limit, offset];

    const result = await query(queryText, params);
    return result.rows;
  }

  /**
   * Search products with fuzzy matching (using pg_trgm)
   */
  async searchProductsFuzzy(searchParams: {
    query: string;
    language?: "en" | "ne" | "romanized";
    limit?: number;
    offset?: number;
    similarity_threshold?: number;
  }): Promise<any[]> {
    const {
      query: searchQuery,
      language = "en",
      limit = 20,
      offset = 0,
      similarity_threshold = 0.3,
    } = searchParams;

    if (!searchQuery || searchQuery.trim().length < 2) {
      return [];
    }

    let searchField = "name_en";
    if (language === "ne") {
      searchField = "name_ne";
    } else if (language === "romanized") {
      searchField = "name_romanized";
    }

    const queryText = `
      SELECT psi.*, p.price, p.image_url, p.is_published,
             similarity(psi.${searchField}, $1) as similarity
      FROM product_search_index psi
      LEFT JOIN products p ON psi.product_id = p.id
      WHERE similarity(psi.${searchField}, $1) > $2
      ORDER BY similarity DESC
      LIMIT $3 OFFSET $4
    `;

    const result = await query(queryText, [
      searchQuery,
      similarity_threshold,
      limit,
      offset,
    ]);
    return result.rows;
  }

  /**
   * Get product search index by product ID
   */
  async getProductIndex(productId: string): Promise<ProductSearchIndex | null> {
    const result = await query(
      "SELECT * FROM product_search_index WHERE product_id = $1",
      [productId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Add synonym to product
   */
  async addSynonym(
    productId: string,
    synonym: string,
  ): Promise<ProductSearchIndex> {
    const result = await query(
      `UPDATE product_search_index 
       SET synonyms = array_append(synonyms, $1), updated_at = NOW()
       WHERE product_id = $2
       RETURNING *`,
      [synonym, productId],
    );

    if (result.rows.length === 0) {
      throw new Error("Product not found in search index");
    }

    return result.rows[0];
  }

  /**
   * Remove synonym from product
   */
  async removeSynonym(
    productId: string,
    synonym: string,
  ): Promise<ProductSearchIndex> {
    const result = await query(
      `UPDATE product_search_index 
       SET synonyms = array_remove(synonyms, $1), updated_at = NOW()
       WHERE product_id = $2
       RETURNING *`,
      [synonym, productId],
    );

    if (result.rows.length === 0) {
      throw new Error("Product not found in search index");
    }

    return result.rows[0];
  }

  /**
   * Remove product from search index
   */
  async removeFromIndex(productId: string): Promise<void> {
    await query("DELETE FROM product_search_index WHERE product_id = $1", [
      productId,
    ]);
  }

  /**
   * Log zero-result searches
   */
  async logZeroResultSearch(
    searchQuery: string,
    language: string,
  ): Promise<void> {
    // This would log to a separate table for analysis
    // For now, we'll just log to console
    console.log(
      JSON.stringify({
        event: "zero_result_search",
        language,
        queryLength: searchQuery.length,
      }),
    );
  }

  /**
   * Rebuild search index for all products
   */
  async rebuildSearchIndex(): Promise<number> {
    // This would rebuild the entire search index from products table
    // For now, return 0 as a placeholder
    return 0;
  }
}
