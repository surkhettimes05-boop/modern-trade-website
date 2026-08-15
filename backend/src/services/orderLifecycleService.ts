import { query } from "../database/connection.js";
import { StockReservationService } from "./stockReservationService.js";
import { DeliveryZoneService } from "./deliveryZoneService.js";
import { CODPolicyService } from "./codPolicyService.js";

const stockReservationService = new StockReservationService();
const deliveryZoneService = new DeliveryZoneService();
const codPolicyService = new CODPolicyService();

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
   * Valid state transitions
   */
  private readonly validTransitions: Record<string, string[]> = {
    DRAFT: ["PENDING_PAYMENT", "CANCELLED"],
    PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["PICKING", "CANCELLED"],
    PICKING: ["PACKED", "CANCELLED"],
    PACKED: ["OUT_FOR_DELIVERY", "CANCELLED"],
    OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
    DELIVERED: ["RETURN_REQUESTED"],
    RETURN_REQUESTED: ["RETURNED"],
    RETURNED: ["REFUNDED"],
    CANCELLED: [],
    REFUNDED: [],
  };

  /**
   * Transition order status
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
    // Get current order status
    const orderResult = await query(
      "SELECT status FROM web_orders WHERE id = $1",
      [orderId],
    );

    if (orderResult.rows.length === 0) {
      throw new Error("Order not found");
    }

    const currentStatus = orderResult.rows[0].status;

    // Validate transition
    if (!this.validTransitions[currentStatus]?.includes(toStatus)) {
      throw new Error(
        `Invalid transition from ${currentStatus} to ${toStatus}`,
      );
    }

    // Update order status
    const updateResult = await query(
      `UPDATE web_orders 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [toStatus, orderId],
    );

    // Log order event
    await this.logOrderEvent({
      order_id: orderId,
      event_type: this.getEventTypeForTransition(currentStatus, toStatus),
      from_status: currentStatus,
      to_status: toStatus,
      reason: options.reason,
      metadata: options.metadata,
      created_by: options.created_by,
    });

    // Handle specific transition side effects
    await this.handleTransitionSideEffects(orderId, currentStatus, toStatus);

    return updateResult.rows[0];
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
   * Cancel order
   */
  async cancelOrder(
    orderId: string,
    options: {
      reason?: string;
      cancelled_by?: string;
    } = {},
  ): Promise<any> {
    // Get current order
    const orderResult = await query("SELECT * FROM web_orders WHERE id = $1", [
      orderId,
    ]);

    if (orderResult.rows.length === 0) {
      throw new Error("Order not found");
    }

    const order = orderResult.rows[0];

    // Check if order can be cancelled
    if (
      !["DRAFT", "PENDING_PAYMENT", "CONFIRMED", "PICKING", "PACKED"].includes(
        order.status,
      )
    ) {
      throw new Error(`Order in ${order.status} status cannot be cancelled`);
    }

    // Cancel order
    const result = await this.transitionOrderStatus(orderId, "CANCELLED", {
      reason: options.reason,
      created_by: options.cancelled_by,
    });

    // Update cancellation details
    await query(
      `UPDATE web_orders 
       SET cancellation_reason = $1, cancelled_at = NOW(), cancelled_by = $2
       WHERE id = $3`,
      [options.reason || null, options.cancelled_by || null, orderId],
    );

    // Release stock reservations
    if (order.reservation_id) {
      await stockReservationService.cancelReservation(order.reservation_id);
    }

    // Cancel cart reservations
    if (order.cart_id) {
      await stockReservationService.cancelCartReservations(order.cart_id);
    }

    return result;
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
   * Get event type for transition
   */
  private getEventTypeForTransition(
    fromStatus: string,
    toStatus: string,
  ): string {
    const transitionMap: Record<string, string> = {
      "DRAFT->PENDING_PAYMENT": "CREATED",
      "PENDING_PAYMENT->CONFIRMED": "CONFIRMED",
      "CONFIRMED->PICKING": "PICKING",
      "PICKING->PACKED": "PACKED",
      "PACKED->OUT_FOR_DELIVERY": "SHIPPED",
      "OUT_FOR_DELIVERY->DELIVERED": "DELIVERED",
      "DELIVERED->RETURN_REQUESTED": "RETURN_REQUESTED",
      "RETURN_REQUESTED->RETURNED": "RETURNED",
      "RETURNED->REFUNDED": "REFUNDED",
    };

    const key = `${fromStatus}->${toStatus}`;
    return transitionMap[key] || "STATUS_CHANGE";
  }

  /**
   * Handle transition side effects
   */
  private async handleTransitionSideEffects(
    orderId: string,
    fromStatus: string,
    toStatus: string,
  ): Promise<void> {
    // When order is confirmed, consume stock reservations
    if (toStatus === "CONFIRMED") {
      const orderResult = await query(
        "SELECT reservation_id FROM web_orders WHERE id = $1",
        [orderId],
      );

      if (orderResult.rows[0]?.reservation_id) {
        await stockReservationService.consumeReservation(
          orderResult.rows[0].reservation_id,
        );
      }
    }

    // When order is cancelled, release reservations (handled in cancelOrder)
    // When order is delivered, trigger delivery confirmation
    // When order is returned, trigger return processing
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
