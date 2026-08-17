import { query } from "../database/connection.js";

interface ShoppingCart {
  id: string;
  customer_id: string;
  session_id: string;
  store_id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}

interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

export class ShoppingCartService {
  /**
   * Create or get shopping cart
   */
  async getOrCreateCart(cartData: {
    customer_id?: string;
    session_id?: string;
    store_id: string;
  }): Promise<ShoppingCart> {
    // Try to find existing cart
    let cart: ShoppingCart | null = null;

    if (cartData.customer_id) {
      const result = await query(
        `SELECT * FROM shopping_carts 
         WHERE customer_id = $1 AND store_id = $2 AND status = 'ACTIVE'
         ORDER BY created_at DESC LIMIT 1`,
        [cartData.customer_id, cartData.store_id],
      );
      if (result.rows.length > 0) {
        cart = result.rows[0];
      }
    }

    if (!cart && cartData.session_id) {
      const result = await query(
        `SELECT * FROM shopping_carts 
         WHERE session_id = $1 AND store_id = $2 AND status = 'ACTIVE'
         ORDER BY created_at DESC LIMIT 1`,
        [cartData.session_id, cartData.store_id],
      );
      if (result.rows.length > 0) {
        cart = result.rows[0];
      }
    }

    if (cart) {
      // Update expires_at
      const updated = await query(
        `UPDATE shopping_carts 
         SET expires_at = NOW() + INTERVAL '24 hours', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [cart.id],
      );
      return updated.rows[0];
    }

    // Create new cart
    const result = await query(
      `INSERT INTO shopping_carts (customer_id, session_id, store_id, status, expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', NOW() + INTERVAL '24 hours')
       RETURNING *`,
      [
        cartData.customer_id || null,
        cartData.session_id || null,
        cartData.store_id,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get cart by ID
   */
  async getCart(cartId: string): Promise<ShoppingCart | null> {
    const result = await query("SELECT * FROM shopping_carts WHERE id = $1", [
      cartId,
    ]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get cart items
   */
  async getCartItems(cartId: string): Promise<CartItem[]> {
    const result = await query(
      `SELECT ci.*, p.name as product_name, p.sku 
       FROM cart_items ci
       LEFT JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at`,
      [cartId],
    );
    return result.rows;
  }

  /**
   * Add item to cart
   */
  async addToCart(itemData: {
    cart_id: string;
    product_id: string;
    quantity: number;
    unit_price?: number;
    discount_amount?: never;
    metadata?: any;
  }): Promise<CartItem> {
    const product = await query(
      `SELECT COALESCE(store_price.price, organization_price.price) AS price,
              COALESCE(spa.availability_status, CASE WHEN EXISTS (SELECT 1 FROM batch_inventory bi WHERE bi.product_id = p.id AND bi.store_id = sc.store_id AND bi.quantity > 0) THEN 'AVAILABLE' ELSE 'OUT_OF_STOCK' END) AS availability_status
       FROM shopping_carts sc
       JOIN products p ON p.id = $2 AND p.status = 'PUBLISHED'
       LEFT JOIN LATERAL (SELECT price FROM product_prices WHERE product_id = p.id AND store_id = sc.store_id AND active = TRUE ORDER BY valid_from DESC LIMIT 1) store_price ON TRUE
       LEFT JOIN LATERAL (SELECT price FROM product_prices WHERE product_id = p.id AND store_id IS NULL AND active = TRUE ORDER BY valid_from DESC LIMIT 1) organization_price ON TRUE
       LEFT JOIN store_product_availability spa ON spa.product_id = p.id AND spa.store_id = sc.store_id
       WHERE sc.id = $1 AND sc.status = 'ACTIVE'`,
      [itemData.cart_id, itemData.product_id],
    );
    if (
      !product.rows[0] ||
      product.rows[0].price === null ||
      product.rows[0].availability_status === "OUT_OF_STOCK"
    )
      throw new Error("Product is unavailable at this store");
    const authoritativePrice = Number(product.rows[0].price);

    // Check if item already exists in cart
    const existing = await query(
      `SELECT * FROM cart_items 
       WHERE cart_id = $1 AND product_id = $2`,
      [itemData.cart_id, itemData.product_id],
    );

    const lineTotal = itemData.quantity * authoritativePrice;

    if (existing.rows.length > 0) {
      // Update existing item
      const result = await query(
        `UPDATE cart_items 
         SET quantity = quantity + $1,
             unit_price = $2,
             discount_amount = $3,
             line_total = (quantity + $1) * $2 - $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [
          itemData.quantity,
          authoritativePrice,
          0,
          existing.rows[0].id,
        ],
      );
      return result.rows[0];
    }

    // Add new item
    const result = await query(
      `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price, discount_amount, line_total, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        itemData.cart_id,
        itemData.product_id,
        itemData.quantity,
        authoritativePrice,
        0,
        lineTotal,
        JSON.stringify(itemData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Update cart item
   */
  async updateCartItem(
    itemId: string,
    updates: {
      quantity?: number;
      unit_price?: never;
      discount_amount?: never;
    },
  ): Promise<CartItem> {
    const current = await query(
      `SELECT ci.cart_id, ci.product_id, sc.store_id FROM cart_items ci JOIN shopping_carts sc ON sc.id = ci.cart_id WHERE ci.id = $1 AND sc.status = 'ACTIVE'`,
      [itemId],
    );
    if (!current.rows[0]) throw new Error("Cart item not found");
    const price = await query(
      `SELECT COALESCE(store_price.price, organization_price.price) AS price FROM products p LEFT JOIN LATERAL (SELECT price FROM product_prices WHERE product_id = p.id AND store_id = $2 AND active = TRUE ORDER BY valid_from DESC LIMIT 1) store_price ON TRUE LEFT JOIN LATERAL (SELECT price FROM product_prices WHERE product_id = p.id AND store_id IS NULL AND active = TRUE ORDER BY valid_from DESC LIMIT 1) organization_price ON TRUE WHERE p.id = $1 AND p.status = 'PUBLISHED'`,
      [current.rows[0].product_id, current.rows[0].store_id],
    );
    if (!price.rows[0] || price.rows[0].price === null)
      throw new Error("Product price is no longer available");
    const fields: string[] = ["unit_price = $1"];
    const values: any[] = [Number(price.rows[0].price)];
    let paramIndex = 2;

    if (updates.quantity !== undefined) {
      fields.push(`quantity = $${paramIndex}`);
      values.push(updates.quantity);
      paramIndex++;
    }

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    fields.push(`line_total = quantity * unit_price - discount_amount`);
    fields.push(`updated_at = NOW()`);
    values.push(itemId);

    const result = await query(
      `UPDATE cart_items SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  /**
   * Remove item from cart
   */
  async removeFromCart(itemId: string): Promise<void> {
    await query("DELETE FROM cart_items WHERE id = $1", [itemId]);
  }

  /**
   * Clear cart
   */
  async clearCart(cartId: string): Promise<void> {
    await query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
  }

  /**
   * Update cart status
   */
  async updateCartStatus(
    cartId: string,
    status: string,
  ): Promise<ShoppingCart> {
    const result = await query(
      `UPDATE shopping_carts 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, cartId],
    );

    return result.rows[0];
  }

  /**
   * Get cart total
   */
  async getCartTotal(cartId: string): Promise<any> {
    const result = await query(
      `SELECT 
        COUNT(*) as item_count,
        SUM(quantity) as total_quantity,
        SUM(line_total) as subtotal,
        SUM(discount_amount) as total_discount
       FROM cart_items
       WHERE cart_id = $1`,
      [cartId],
    );

    return result.rows[0];
  }

  /**
   * Merge carts (session cart to customer cart)
   */
  async mergeCarts(
    sessionCartId: string,
    customerCartId: string,
  ): Promise<void> {
    // Get items from session cart
    const items = await query("SELECT * FROM cart_items WHERE cart_id = $1", [
      sessionCartId,
    ]);

    // Add items to customer cart
    for (const item of items.rows) {
      await this.addToCart({
        cart_id: customerCartId,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount,
      });
    }

    // Delete session cart
    await query("DELETE FROM shopping_carts WHERE id = $1", [sessionCartId]);
  }

  /**
   * Clean up expired carts
   */
  async cleanupExpiredCarts(): Promise<number> {
    const result = await query(
      `DELETE FROM shopping_carts 
       WHERE expires_at < NOW() AND status = 'ACTIVE'
       RETURNING id`,
    );
    return result.rowCount ?? 0;
  }
}
