-- COD launch lifecycle: normalize legacy order states and enforce the
-- RECEIVED -> CONFIRMED -> PROCESSING -> READY -> OUT_FOR_DELIVERY -> DELIVERED
-- lifecycle for launch commerce orders.

UPDATE web_orders
   SET status = 'RECEIVED',
       updated_at = NOW()
 WHERE payment_method = 'COD'
   AND status IN ('PENDING', 'PENDING_PAYMENT');

UPDATE web_orders
   SET status = 'PROCESSING',
       updated_at = NOW()
 WHERE payment_method = 'COD' AND status = 'PICKING';

UPDATE web_orders
   SET status = 'READY',
       updated_at = NOW()
 WHERE payment_method = 'COD' AND status = 'PACKED';

ALTER TABLE batch_inventory
  DROP CONSTRAINT IF EXISTS batch_inventory_quantity_nonnegative;

ALTER TABLE batch_inventory
  ADD CONSTRAINT batch_inventory_quantity_nonnegative CHECK (quantity >= 0);

CREATE INDEX IF NOT EXISTS idx_web_orders_launch_status
  ON web_orders(status, order_date);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_active_stock
  ON stock_reservations(store_id, product_id, status)
  WHERE status = 'ACTIVE';
