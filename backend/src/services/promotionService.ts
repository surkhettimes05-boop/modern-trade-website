import { query } from "../database/connection.js";

interface Promotion {
  id: string;
  promotion_id: string;
  store_id: string;
  name: string;
  description: string;
  promotion_type: string;
  discount_value: number;
  minimum_order_value: number;
  maximum_discount_amount: number;
  applicable_categories: any;
  applicable_products: any;
  customer_segments: any;
  buy_quantity: number;
  get_quantity: number;
  get_product_id: string;
  is_active: boolean;
  start_date: Date;
  end_date: Date;
  usage_limit: number;
  current_usage: number;
  can_combine_with_other_promotions: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  metadata: any;
}

interface CouponCode {
  id: string;
  coupon_id: string;
  promotion_id: string;
  code: string;
  usage_limit: number;
  current_usage: number;
  usage_limit_per_customer: number;
  customer_restrictions: any;
  is_active: boolean;
  valid_from: Date;
  valid_until: Date;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  metadata: any;
}

export class PromotionService {
  /**
   * Create promotion
   */
  async createPromotion(promotionData: {
    store_id: string;
    name: string;
    description?: string;
    promotion_type: string;
    discount_value: number;
    minimum_order_value?: number;
    maximum_discount_amount?: number;
    applicable_categories?: any;
    applicable_products?: any;
    customer_segments?: any;
    buy_quantity?: number;
    get_quantity?: number;
    get_product_id?: string;
    start_date?: Date;
    end_date?: Date;
    usage_limit?: number;
    can_combine_with_other_promotions?: boolean;
    created_by?: string;
    metadata?: any;
  }): Promise<Promotion> {
    const promotionId = this.generatePromotionId();

    const result = await query(
      `INSERT INTO promotions (
        promotion_id, store_id, name, description, promotion_type, discount_value,
        minimum_order_value, maximum_discount_amount, applicable_categories,
        applicable_products, customer_segments, buy_quantity, get_quantity,
        get_product_id, start_date, end_date, usage_limit,
        can_combine_with_other_promotions, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        promotionId,
        promotionData.store_id,
        promotionData.name,
        promotionData.description || null,
        promotionData.promotion_type,
        promotionData.discount_value,
        promotionData.minimum_order_value || null,
        promotionData.maximum_discount_amount || null,
        JSON.stringify(promotionData.applicable_categories || []),
        JSON.stringify(promotionData.applicable_products || []),
        JSON.stringify(promotionData.customer_segments || []),
        promotionData.buy_quantity || null,
        promotionData.get_quantity || null,
        promotionData.get_product_id || null,
        promotionData.start_date || null,
        promotionData.end_date || null,
        promotionData.usage_limit || null,
        promotionData.can_combine_with_other_promotions || false,
        promotionData.created_by || null,
        JSON.stringify(promotionData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get promotion by ID
   */
  async getPromotion(promotionId: string): Promise<Promotion | null> {
    const result = await query(
      "SELECT * FROM promotions WHERE promotion_id = $1",
      [promotionId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get active promotions for store
   */
  async getActivePromotionsForStore(storeId: string): Promise<Promotion[]> {
    const result = await query(
      `SELECT * FROM promotions 
       WHERE store_id = $1 AND is_active = TRUE 
       AND (start_date IS NULL OR start_date <= NOW())
       AND (end_date IS NULL OR end_date >= NOW())
       AND (usage_limit IS NULL OR current_usage < usage_limit)
       ORDER BY created_at DESC`,
      [storeId],
    );
    return result.rows;
  }

  /**
   * Create coupon code
   */
  async createCouponCode(couponData: {
    promotion_id: string;
    code: string;
    usage_limit?: number;
    usage_limit_per_customer?: number;
    customer_restrictions?: any;
    valid_from?: Date;
    valid_until?: Date;
    created_by?: string;
    metadata?: any;
  }): Promise<CouponCode> {
    const couponId = this.generateCouponId();

    const result = await query(
      `INSERT INTO coupon_codes (
        coupon_id, promotion_id, code, usage_limit, usage_limit_per_customer,
        customer_restrictions, valid_from, valid_until, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        couponId,
        couponData.promotion_id,
        couponData.code.toUpperCase(),
        couponData.usage_limit || null,
        couponData.usage_limit_per_customer || null,
        JSON.stringify(couponData.customer_restrictions || {}),
        couponData.valid_from || null,
        couponData.valid_until || null,
        couponData.created_by || null,
        JSON.stringify(couponData.metadata || {}),
      ],
    );

    return result.rows[0];
  }

  /**
   * Get coupon by code
   */
  async getCouponByCode(code: string): Promise<CouponCode | null> {
    const result = await query(
      `SELECT * FROM coupon_codes 
       WHERE code = $1 AND is_active = TRUE
       AND (valid_from IS NULL OR valid_from <= NOW())
       AND (valid_until IS NULL OR valid_until >= NOW())
       AND (usage_limit IS NULL OR current_usage < usage_limit)`,
      [code.toUpperCase()],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Validate coupon for customer
   */
  async validateCouponForCustomer(
    code: string,
    customerId: string,
  ): Promise<any> {
    const coupon = await this.getCouponByCode(code);
    if (!coupon) {
      return { valid: false, reason: "Coupon not found or expired" };
    }

    // Check customer restrictions
    if (
      coupon.customer_restrictions &&
      Object.keys(coupon.customer_restrictions).length > 0
    ) {
      const restrictions = coupon.customer_restrictions;
      if (
        restrictions.allowed_customers &&
        !restrictions.allowed_customers.includes(customerId)
      ) {
        return {
          valid: false,
          reason: "Coupon not applicable to this customer",
        };
      }
      if (
        restrictions.blocked_customers &&
        restrictions.blocked_customers.includes(customerId)
      ) {
        return {
          valid: false,
          reason: "Coupon not applicable to this customer",
        };
      }
    }

    // Check per-customer usage limit
    if (coupon.usage_limit_per_customer) {
      const usageResult = await query(
        `SELECT COUNT(*) as usage_count FROM coupon_usages 
         WHERE coupon_id = $1 AND customer_id = $2`,
        [coupon.id, customerId],
      );
      const usageCount = parseInt(usageResult.rows[0].usage_count);
      if (usageCount >= coupon.usage_limit_per_customer) {
        return {
          valid: false,
          reason: "Coupon usage limit exceeded for this customer",
        };
      }
    }

    // Get promotion details
    const promotion = await this.getPromotion(coupon.promotion_id);
    if (!promotion || !promotion.is_active) {
      return { valid: false, reason: "Promotion not active" };
    }

    return {
      valid: true,
      coupon,
      promotion,
    };
  }

  /**
   * Apply coupon to order
   */
  async applyCouponToOrder(
    couponId: string,
    customerId: string,
    orderId: string,
    discountAmount: number,
  ): Promise<void> {
    await query(
      `INSERT INTO coupon_usages (coupon_id, customer_id, order_id, discount_amount)
       VALUES ($1, $2, $3, $4)`,
      [couponId, customerId, orderId, discountAmount],
    );

    // Increment coupon usage
    await query(
      `UPDATE coupon_codes SET current_usage = current_usage + 1 WHERE id = $1`,
      [couponId],
    );

    // Increment promotion usage
    await query(
      `UPDATE promotions SET current_usage = current_usage + 1 WHERE id = 
       (SELECT promotion_id FROM coupon_codes WHERE id = $1)`,
      [couponId],
    );
  }

  /**
   * Calculate discount for order
   */
  async calculateDiscount(
    promotionId: string,
    orderData: {
      subtotal: number;
      items: Array<{ product_id: string; quantity: number; price: number }>;
      customer_id?: string;
    },
  ): Promise<{ discount_amount: number; discount_details: any }> {
    const promotion = await this.getPromotion(promotionId);
    if (!promotion) {
      throw new Error("Promotion not found");
    }

    let discountAmount = 0;
    const discountDetails: any = {};

    switch (promotion.promotion_type) {
      case "PERCENTAGE":
        discountAmount = orderData.subtotal * (promotion.discount_value / 100);
        if (promotion.maximum_discount_amount) {
          discountAmount = Math.min(
            discountAmount,
            promotion.maximum_discount_amount,
          );
        }
        discountDetails.type = "percentage";
        discountDetails.percentage = promotion.discount_value;
        break;

      case "FIXED_AMOUNT":
        discountAmount = promotion.discount_value;
        discountDetails.type = "fixed";
        discountDetails.amount = promotion.discount_value;
        break;

      case "BUY_X_GET_Y":
        if (promotion.buy_quantity && promotion.get_quantity) {
          const applicableItems = orderData.items.filter((item) => {
            if (
              promotion.applicable_products &&
              promotion.applicable_products.length > 0
            ) {
              return promotion.applicable_products.includes(item.product_id);
            }
            return true;
          });

          const totalQuantity = applicableItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          );
          const freeItems =
            Math.floor(totalQuantity / promotion.buy_quantity) *
            promotion.get_quantity;

          if (promotion.get_product_id) {
            const getItem = applicableItems.find(
              (item) => item.product_id === promotion.get_product_id,
            );
            if (getItem) {
              discountAmount = freeItems * getItem.price;
            }
          } else {
            const cheapestItem = applicableItems.reduce((min, item) =>
              item.price < min.price ? item : min,
            );
            discountAmount = freeItems * cheapestItem.price;
          }

          discountDetails.type = "buy_x_get_y";
          discountDetails.buy_quantity = promotion.buy_quantity;
          discountDetails.get_quantity = promotion.get_quantity;
        }
        break;

      case "FREE_SHIPPING":
        discountAmount = 0; // Calculated separately based on delivery fees
        discountDetails.type = "free_shipping";
        break;
    }

    // Check minimum order value
    if (
      promotion.minimum_order_value &&
      orderData.subtotal < promotion.minimum_order_value
    ) {
      return {
        discount_amount: 0,
        discount_details: { reason: "Minimum order value not met" },
      };
    }

    return {
      discount_amount: Math.round(discountAmount * 100) / 100,
      discount_details: discountDetails,
    };
  }

  /**
   * Update promotion status
   */
  async updatePromotionStatus(
    promotionId: string,
    isActive: boolean,
  ): Promise<Promotion> {
    const result = await query(
      `UPDATE promotions SET is_active = $1, updated_at = NOW() 
       WHERE promotion_id = $2 RETURNING *`,
      [isActive, promotionId],
    );
    return result.rows[0];
  }

  /**
   * Generate promotion ID
   */
  private generatePromotionId(): string {
    return `PRM-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Generate coupon ID
   */
  private generateCouponId(): string {
    return `CPN-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const promotionService = new PromotionService();
