import { query } from "../database/connection.js";

export class FavoriteProductNotFoundError extends Error {
  constructor() {
    super("Product not found");
  }
}

export class CustomerFavoriteService {
  async list(customerId: string): Promise<string[]> {
    const result = await query(
      `SELECT product_id
         FROM customer_favorite_products
        WHERE customer_id = $1
        ORDER BY created_at DESC, product_id ASC`,
      [customerId],
    );
    return result.rows.map((row) => String(row.product_id));
  }

  async add(customerId: string, productId: string): Promise<void> {
    const result = await query(
      `WITH product AS MATERIALIZED (
         SELECT id FROM products WHERE id = $2
       ), inserted AS (
         INSERT INTO customer_favorite_products (customer_id, product_id)
         SELECT $1, id FROM product
         ON CONFLICT (customer_id, product_id) DO NOTHING
       )
       SELECT id FROM product`,
      [customerId, productId],
    );
    if (result.rows.length === 0) throw new FavoriteProductNotFoundError();
  }

  async remove(customerId: string, productId: string): Promise<void> {
    await query(
      `DELETE FROM customer_favorite_products
        WHERE customer_id = $1 AND product_id = $2`,
      [customerId, productId],
    );
  }
}
