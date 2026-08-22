-- Bring the canonical web_orders schema in line with the registered COD
-- checkout and customer order lifecycle routes.

ALTER TABLE web_orders
  ADD COLUMN IF NOT EXISTS cart_id UUID REFERENCES shopping_carts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS reservation_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS return_reason TEXT,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_web_orders_cart ON web_orders(cart_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_web_orders_customer_idempotency
  ON web_orders(customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
