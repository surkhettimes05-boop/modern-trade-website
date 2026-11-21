import { query } from "../database/connection.js";

export interface CustomerOrderNotification {
  notification_id: string;
  order_id: string;
  order_number: string;
  order_status: string;
  total_amount: number;
  order_date: Date;
  created_at: Date;
}

export class CustomerOrderNotificationService {
  async list(customerId: string): Promise<CustomerOrderNotification[]> {
    const result = await query(
      `WITH logical_updates AS (
         SELECT DISTINCT ON (oe.order_id, oe.to_status)
                oe.id AS notification_id,
                oe.order_id,
                oe.to_status AS order_status,
                oe.created_at,
                wo.order_number,
                wo.total_amount,
                wo.order_date
           FROM order_events oe
           JOIN web_orders wo ON wo.id = oe.order_id
          WHERE wo.customer_id = $1
            AND oe.to_status = ANY($2::text[])
          ORDER BY oe.order_id, oe.to_status, oe.created_at ASC, oe.id ASC
       )
       SELECT notification_id, order_id, order_number, order_status,
              total_amount, order_date, created_at
         FROM logical_updates
        ORDER BY created_at DESC, notification_id DESC
        LIMIT 100`,
      [
        customerId,
        ["CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
      ],
    );
    return result.rows;
  }
}
