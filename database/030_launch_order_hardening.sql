-- Pasalho launch hardening: authoritative Nepal delivery geography,
-- COD collection, and consistent NPR storefront currency.

CREATE TABLE IF NOT EXISTS nepal_provinces (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  name_ne VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nepal_districts (
  id SERIAL PRIMARY KEY,
  province_id INTEGER REFERENCES nepal_provinces(id),
  code VARCHAR(10) UNIQUE NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  name_ne VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nepal_municipalities (
  id SERIAL PRIMARY KEY,
  district_id INTEGER REFERENCES nepal_districts(id),
  code VARCHAR(10) UNIQUE NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  name_ne VARCHAR(100),
  municipality_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nepal_wards (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER REFERENCES nepal_municipalities(id),
  ward_number INTEGER NOT NULL,
  name_en VARCHAR(100),
  name_ne VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(municipality_id, ward_number)
);

CREATE INDEX IF NOT EXISTS idx_nepal_districts_province
  ON nepal_districts(province_id);
CREATE INDEX IF NOT EXISTS idx_nepal_municipalities_district
  ON nepal_municipalities(district_id);
CREATE INDEX IF NOT EXISTS idx_nepal_wards_municipality
  ON nepal_wards(municipality_id);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_name VARCHAR(100) NOT NULL,
  store_id UUID REFERENCES stores(id),
  zone_type VARCHAR(50) DEFAULT 'STANDARD',
  included_municipalities INTEGER[],
  included_wards INTEGER[],
  excluded_areas TEXT[],
  base_fee DECIMAL(12, 2) NOT NULL DEFAULT 0,
  surcharge DECIMAL(12, 2) DEFAULT 0,
  free_delivery_threshold DECIMAL(12, 2),
  minimum_order_value DECIMAL(12, 2),
  estimated_delivery_hours INTEGER,
  delivery_time_slots JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  effective_date DATE,
  expiry_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_store
  ON delivery_zones(store_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_active
  ON delivery_zones(store_id) WHERE is_active = TRUE;

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
