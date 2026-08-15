-- Phase 05: authoritative storefront pricing and store availability.
CREATE TABLE IF NOT EXISTS product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  original_price NUMERIC(12, 2) CHECK (original_price IS NULL OR original_price >= price),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'INR',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_prices_lookup ON product_prices(product_id, store_id, active, valid_from DESC);

INSERT INTO product_prices (product_id, store_id, price, original_price, currency_code)
SELECT p.id, s.id,
  CASE p.sku WHEN 'RICE-5KG' THEN 799 WHEN 'OIL-1L' THEN 179 WHEN 'WATER-1L' THEN 25 ELSE 0 END,
  CASE p.sku WHEN 'RICE-5KG' THEN 999 WHEN 'OIL-1L' THEN 219 WHEN 'WATER-1L' THEN 30 ELSE NULL END,
  'INR'
FROM products p CROSS JOIN stores s
WHERE p.sku IN ('RICE-5KG', 'OIL-1L', 'WATER-1L')
  AND NOT EXISTS (SELECT 1 FROM product_prices pp WHERE pp.product_id = p.id AND pp.store_id = s.id);
