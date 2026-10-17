-- Make the saved-address service available from a clean numbered-migration
-- install. The original expansion_phase1_schema.sql documented this table as
-- a manual setup step, so newer test/deploy databases never received it.
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
     WHERE customer_id = NEW.customer_id
       AND id <> NEW.id
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

ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON customer_addresses TO storesync_app;
    DROP POLICY IF EXISTS customer_addresses_backend_access ON customer_addresses;
    CREATE POLICY customer_addresses_backend_access ON customer_addresses
      FOR ALL TO storesync_app USING (TRUE) WITH CHECK (TRUE);
  END IF;
END
$$;
