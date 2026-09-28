-- PASALO fulfillment handoff state and explicit cross-system mappings.
-- These identifiers are references in another database; they intentionally
-- have no local foreign-key constraint.

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS pasalo_branch_id UUID;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS pasalo_product_id UUID;

ALTER TABLE web_orders
  ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS fulfillment_order_id UUID,
  ADD COLUMN IF NOT EXISTS fulfillment_order_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fulfillment_error TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_attempted_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_pasalo_branch
  ON stores(pasalo_branch_id)
  WHERE pasalo_branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_pasalo_product
  ON products(pasalo_product_id)
  WHERE pasalo_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_web_orders_fulfillment_status
  ON web_orders(fulfillment_status);

CREATE INDEX IF NOT EXISTS idx_web_orders_fulfillment_order
  ON web_orders(fulfillment_order_id);
