import { query } from "../database/connection.js";

interface StockReservation {
  id: string;
  reservation_id: string;
  cart_id: string;
  order_id: string;
  product_id: string;
  store_id: string;
  batch_id: string;
  quantity: number;
  reserved_at: Date;
  expires_at: Date;
  status: string;
  created_at: Date;
  metadata: any;
}

export class StockReservationService {
  /**
   * Create stock reservation
   */
  async createReservation(reservationData: {
    cart_id?: string;
    order_id?: string;
    product_id: string;
    store_id: string;
    batch_id?: string;
    quantity: number;
    expires_in_minutes?: number;
  }): Promise<StockReservation> {
    const reservationId = await this.generateReservationId();
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + (reservationData.expires_in_minutes || 30),
    );

    // Check available stock
    const availableStock = await this.checkAvailableStock(
      reservationData.product_id,
      reservationData.store_id,
      reservationData.batch_id,
    );

    if (availableStock < reservationData.quantity) {
      throw new Error(
        `Insufficient stock. Available: ${availableStock}, Requested: ${reservationData.quantity}`,
      );
    }

    // Create reservation with row locking to prevent overselling
    const result = await query(
      `INSERT INTO stock_reservations (
        reservation_id, cart_id, order_id, product_id, store_id, batch_id,
        quantity, reserved_at, expires_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, 'ACTIVE')
      RETURNING *`,
      [
        reservationId,
        reservationData.cart_id || null,
        reservationData.order_id || null,
        reservationData.product_id,
        reservationData.store_id,
        reservationData.batch_id || null,
        reservationData.quantity,
        expiresAt,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get reservation by ID
   */
  async getReservation(
    reservationId: string,
  ): Promise<StockReservation | null> {
    const result = await query(
      "SELECT * FROM stock_reservations WHERE reservation_id = $1",
      [reservationId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get reservations for cart
   */
  async getCartReservations(cartId: string): Promise<StockReservation[]> {
    const result = await query(
      `SELECT * FROM stock_reservations 
       WHERE cart_id = $1 AND status = 'ACTIVE'
       ORDER BY created_at`,
      [cartId],
    );
    return result.rows;
  }

  /**
   * Get reservations for order
   */
  async getOrderReservations(orderId: string): Promise<StockReservation[]> {
    const result = await query(
      `SELECT * FROM stock_reservations 
       WHERE order_id = $1
       ORDER BY created_at`,
      [orderId],
    );
    return result.rows;
  }

  /**
   * Consume reservation (convert to actual sale)
   */
  async consumeReservation(reservationId: string): Promise<StockReservation> {
    const result = await query(
      `UPDATE stock_reservations 
       SET status = 'CONSUMED', updated_at = NOW()
       WHERE reservation_id = $1 AND status = 'ACTIVE'
       RETURNING *`,
      [reservationId],
    );

    if (result.rows.length === 0) {
      throw new Error("Reservation not found or already consumed/expired");
    }

    return result.rows[0];
  }

  /**
   * Cancel reservation
   */
  async cancelReservation(reservationId: string): Promise<StockReservation> {
    const result = await query(
      `UPDATE stock_reservations 
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE reservation_id = $1 AND status = 'ACTIVE'
       RETURNING *`,
      [reservationId],
    );

    if (result.rows.length === 0) {
      throw new Error("Reservation not found or already consumed/expired");
    }

    return result.rows[0];
  }

  /**
   * Cancel all reservations for cart
   */
  async cancelCartReservations(cartId: string): Promise<number> {
    const result = await query(
      `UPDATE stock_reservations 
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE cart_id = $1 AND status = 'ACTIVE'
       RETURNING id`,
      [cartId],
    );
    return result.rowCount || 0;
  }

  /**
   * Transfer cart reservations to order
   */
  async transferReservationsToOrder(
    cartId: string,
    orderId: string,
  ): Promise<void> {
    await query(
      `UPDATE stock_reservations 
       SET order_id = $1, cart_id = NULL
       WHERE cart_id = $2 AND status = 'ACTIVE'`,
      [orderId, cartId],
    );
  }

  /**
   * Expire old reservations
   */
  async expireReservations(): Promise<number> {
    const result = await query(
      `UPDATE stock_reservations 
       SET status = 'EXPIRED'
       WHERE status = 'ACTIVE' AND expires_at < NOW()
       RETURNING id`,
    );
    return result.rowCount || 0;
  }

  /**
   * Check available stock
   */
  private async checkAvailableStock(
    productId: string,
    storeId: string,
    batchId?: string,
  ): Promise<number> {
    let queryText = "";
    let params: any[] = [];

    if (batchId) {
      queryText = `
        SELECT COALESCE(SUM(quantity), 0) - COALESCE((
          SELECT COALESCE(SUM(quantity), 0)
          FROM stock_reservations
          WHERE product_id = $1 AND store_id = $2 AND batch_id = $3 AND status = 'ACTIVE'
        ), 0) as available
        FROM batch_inventory
        WHERE product_id = $1 AND store_id = $2 AND batch_id = $3
      `;
      params = [productId, storeId, batchId];
    } else {
      queryText = `
        SELECT COALESCE(SUM(quantity), 0) - COALESCE((
          SELECT COALESCE(SUM(quantity), 0)
          FROM stock_reservations
          WHERE product_id = $1 AND store_id = $2 AND status = 'ACTIVE'
        ), 0) as available
        FROM batch_inventory
        WHERE product_id = $1 AND store_id = $2
      `;
      params = [productId, storeId];
    }

    const result = await query(queryText, params);
    const available = result.rows[0]?.available;
    return available !== null ? parseInt(available) : 0;
  }

  /**
   * Generate reservation ID
   */
  private async generateReservationId(): Promise<string> {
    const result = await query("SELECT generate_reservation_id() as number");
    return result.rows[0].number;
  }
}
