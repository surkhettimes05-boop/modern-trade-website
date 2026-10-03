-- Pasalho launch hardening: preserve authoritative delivery geography,
-- record COD collection, and correct legacy Nepal storefront currency rows.

ALTER TABLE web_orders
  ADD COLUMN IF NOT EXISTS shipping_municipality_id INTEGER REFERENCES nepal_municipalities(id),
  ADD COLUMN IF NOT EXISTS shipping_ward_id INTEGER REFERENCES nepal_wards(id),
  ADD COLUMN IF NOT EXISTS cod_collected_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cod_collected_by VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_web_orders_shipping_municipality
  ON web_orders(shipping_municipality_id);
CREATE INDEX IF NOT EXISTS idx_web_orders_shipping_ward
  ON web_orders(shipping_ward_id);

-- The Nepal launch catalog is NPR. Migration 013 originally seeded demo price
-- rows as INR; make existing Nepal data consistent without touching prices.
UPDATE product_prices
   SET currency_code = 'NPR'
 WHERE currency_code = 'INR';
