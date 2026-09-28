-- Customer commerce address contract extracted from the repository's
-- expansion-phase address model. This focused migration is safe for
-- databases that already contain the later cart/order tables.

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
  UNIQUE (municipality_id, ward_number),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nepal_districts_province
  ON nepal_districts(province_id);
CREATE INDEX IF NOT EXISTS idx_nepal_municipalities_district
  ON nepal_municipalities(district_id);
CREATE INDEX IF NOT EXISTS idx_nepal_wards_municipality
  ON nepal_wards(municipality_id);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  province_id INTEGER REFERENCES nepal_provinces(id),
  district_id INTEGER REFERENCES nepal_districts(id),
  municipality_id INTEGER REFERENCES nepal_municipalities(id),
  ward_id INTEGER REFERENCES nepal_wards(id),
  tole_locality VARCHAR(255),
  landmark VARCHAR(255),
  street VARCHAR(255),
  house_number VARCHAR(50),
  postal_code VARCHAR(20),
  phone VARCHAR(20),
  delivery_instructions TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  address_type VARCHAR(50) DEFAULT 'HOME',
  is_default BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status VARCHAR(20) DEFAULT 'PENDING',
  map_provider VARCHAR(50),
  map_reference_id VARCHAR(255),
  is_serviceable BOOLEAN DEFAULT TRUE,
  serviceability_result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer
  ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default
  ON customer_addresses(customer_id) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_customer_addresses_municipality
  ON customer_addresses(municipality_id);

CREATE OR REPLACE FUNCTION ensure_single_default_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    UPDATE customer_addresses
       SET is_default = FALSE
     WHERE customer_id = NEW.customer_id AND id != NEW.id
       AND is_default = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_single_default_address_trigger
  ON customer_addresses;
CREATE TRIGGER ensure_single_default_address_trigger
  BEFORE INSERT OR UPDATE ON customer_addresses
  FOR EACH ROW EXECUTE FUNCTION ensure_single_default_address();
