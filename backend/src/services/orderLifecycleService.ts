import { query } from "../database/connection.js";
import { StockReservationService } from "./stockReservationService.js";
import { DeliveryZoneService } from "./deliveryZoneService.js";
import { CODPolicyService } from "./codPolicyService.js";
import { WebOrderService } from "./webOrderService.js";

const stockReservationService = new StockReservationService();
const deliveryZoneService = new DeliveryZoneService();
const codPolicyService = new CODPolicyService();
const webOrderService = new WebOrderService();

interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  from_status: string;
  to_status: string;
  reason: string;
  metadata: any;
  created_at: Date;
  created_by: string;
}

export class OrderLifecycleService {
  /**
   * Transition order status through the canonical transactional order service.
   * This keeps inventory reservations, audit events, and realtime store updates
   * identical no matter which staff API initiates the transition.
   */
  async transitionOrderStatus(
    orderId: string,
    toStatus: string,
    options: {
      reason?: string;
      created_by?: string;
      metadata?: any;
    } = {},
  ): Promise<any> {
    return webOrderService.updateWebOrderStatus(
      orderId,
      toStatus,
      options.created_by || "system",
      options.reason,
    );
  }

  /**
   * Log order event
   */
  async logOrderEvent(eventData: {
    order_id: string;
    event_type: string;
    from_status?: string;
    to_status?: string;
    reason?: string;
    metadata?: any;
    created_by?: string;
  }): Promise<OrderEvent> {
    const result = await query(
      `INSERT INTO order_events (
        order_id, event_type, from_status, to_status, reason, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        eventData.order_id,
        eventData.event_type,
        eventData.from_status || null,
        eventData.to_status || null,
        eventData.reason || null,
        JSON.stringify(eventData.metadata || {}),
        eventData.created_by || null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get order events
   */
  async getOrderEvents(orderId: string): Promise<OrderEvent[]> {
    const result = await query(
      `SELECT * FROM order_events 
       WHERE order_id = $1 
       ORDER BY created_at ASC`,
      [orderId],
    );
    return result.rows;
  }

  /**
   * Cancel order using the canonical transactional lifecycle implementation.
   */
  async cancelOrder(
    orderId: string,
    options: {
      reason?: string;
      cancelled_by?: string;
    } = {},
  ): Promise<any> {
    return this.transitionOrderStatus(orderId, "CANCELLED", {
      reason: options.reason,
      created_by: options.cancelled_by,
    });
  }

  /**
   * Request return
   */
  async requestReturn(
    orderId: string,
    options: {
      reason?: string;
      requested_by?: string;
    } = {},
  ): Promise<any> {
    const result = await this.transitionOrderStatus(
      orderId,
      "RETURN_REQUESTED",
      {
        reason: options.reason,
        created_by: options.requested_by,
      },
    );

    await query(
      `UPDATE web_orders 
       SET return_reason = $1, returned_at = NOW()
       WHERE id = $2`,
      [options.reason || null, orderId],
    );

    return result;
  }

  /**
   * Process refund
   */
  async processRefund(
    orderId: string,
    options: {
      refund_amount?: number;
      refund_reason?: string;
      processed_by?: string;
    } = {},
  ): Promise<any> {
    const orderResult = await query(
      "SELECT total_amount FROM web_orders WHERE id = $1",
      [orderId],
    );

    if (orderResult.rows.length === 0) {
      throw new Error("Order not found");
    }

    const totalAmount = parseFloat(orderResult.rows[0].total_amount);
    const refundAmount = options.refund_amount || totalAmount;

    if (refundAmount > totalAmount) {
      throw new Error("Refund amount cannot exceed order total");
    }

    const result = await this.transitionOrderStatus(orderId, "REFUNDED", {
      reason: options.refund_reason,
      created_by: options.processed_by,
    });

    await query(
      `UPDATE web_orders 
       SET refund_amount = $1, refund_reason = $2, refunded_at = NOW()
       WHERE id = $3`,
      [refundAmount, options.refund_reason || null, orderId],
    );

    return result;
  }

  /**
   * Validate checkout data
   */
  async validateCheckout(checkoutData: {
    cart_id: string;
    customer_id?: string;
    address_id?: string;
    delivery_zone_id?: string;
    store_id: string;
    payment_method: string;
  }): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate stock availability
    const cartItems = await query(
      `SELECT ci.*, p.name FROM cart_items ci
       LEFT JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = $1`,
      [checkoutData.cart_id],
    );

    if (cartItems.rows.length === 0) {
      errors.push("Cart is empty");
    }

    for (const item of cartItems.rows) {
      const availableStock = await stockReservationService[
        "checkAvailableStock"
      ](item.product_id, checkoutData.store_id);

      if (availableStock < item.quantity) {
        errors.push(`Insufficient stock for ${item.name}`);
      }
    }

    // Validate COD eligibility if payment method is COD
    if (checkoutData.payment_method === "COD") {
      const cartTotal = await query(
        "SELECT SUM(line_total) as total FROM cart_items WHERE cart_id = $1",
        [checkoutData.cart_id],
      );

      const codEligibility = await codPolicyService.checkCODEligibility({
        order_total: parseFloat(cartTotal.rows[0].total || "0"),
        customer_id: checkoutData.customer_id,
        delivery_zone_id: checkoutData.delivery_zone_id,
        store_id: checkoutData.store_id,
      });

      if (!codEligibility.eligible) {
        errors.push(codEligibility.reason || "COD not eligible");
      }
    }

    // Validate delivery zone
    if (checkoutData.delivery_zone_id) {
      const zone = await deliveryZoneService.getDeliveryZone(
        checkoutData.delivery_zone_id,
      );
      if (!zone) {
        errors.push("Invalid delivery zone");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
