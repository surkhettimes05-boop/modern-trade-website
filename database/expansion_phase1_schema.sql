-- ============================================
-- EXPANSION PHASE 1: CORE COMMERCE AND LOCALIZATION
-- ============================================

-- ============================================
-- NEPAL ADMINISTRATIVE DIVISIONS
-- ============================================

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
    municipality_type VARCHAR(50), -- Metropolitan City, Sub-Metropolitan City, Municipality, Rural Municipality
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nepal_wards (
    id SERIAL PRIMARY KEY,
    municipality_id INTEGER REFERENCES nepal_municipalities(id),
    ward_number INTEGER NOT NULL,
    name_en VARCHAR(100),
    name_ne VARCHAR(100),
    UNIQUE(municipality_id, ward_number),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_nepal_districts_province ON nepal_districts(province_id);
CREATE INDEX idx_nepal_municipalities_district ON nepal_municipalities(district_id);
CREATE INDEX idx_nepal_wards_municipality ON nepal_wards(municipality_id);

-- ============================================
-- CUSTOMER ADDRESSES
-- ============================================

CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Nepal-specific fields
    province_id INTEGER REFERENCES nepal_provinces(id),
    district_id INTEGER REFERENCES nepal_districts(id),
    municipality_id INTEGER REFERENCES nepal_municipalities(id),
    ward_id INTEGER REFERENCES nepal_wards(id),
    
    -- Address components
    tole_locality VARCHAR(255),
    landmark VARCHAR(255),
    street VARCHAR(255),
    house_number VARCHAR(50),
    postal_code VARCHAR(20),
    
    -- Contact
    phone VARCHAR(20),
    delivery_instructions TEXT,
    
    -- Coordinates
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Address metadata
    address_type VARCHAR(50) DEFAULT 'HOME', -- HOME, WORK, OTHER
    is_default BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, VERIFIED, FAILED
    map_provider VARCHAR(50),
    map_reference_id VARCHAR(255),
    
    -- Serviceability
    is_serviceable BOOLEAN DEFAULT TRUE,
    serviceability_result JSONB,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX idx_customer_addresses_default ON customer_addresses(customer_id) WHERE is_default = TRUE;
CREATE INDEX idx_customer_addresses_municipality ON customer_addresses(municipality_id);

-- ============================================
-- DELIVERY ZONES
-- ============================================

CREATE TABLE IF NOT EXISTS delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name VARCHAR(100) NOT NULL,
    store_id UUID REFERENCES stores(id),
    zone_type VARCHAR(50) DEFAULT 'STANDARD', -- STANDARD, EXPRESS, RESTRICTED
    
    -- Zone boundaries (can be defined by municipality/ward lists or polygon)
    included_municipalities INTEGER[], -- Array of municipality IDs
    included_wards INTEGER[], -- Array of ward IDs
    excluded_areas TEXT[], -- Array of specific areas to exclude
    
    -- Pricing
    base_fee DECIMAL(12, 2) NOT NULL DEFAULT 0,
    surcharge DECIMAL(12, 2) DEFAULT 0,
    free_delivery_threshold DECIMAL(12, 2),
    minimum_order_value DECIMAL(12, 2),
    
    -- Timing
    estimated_delivery_hours INTEGER,
    delivery_time_slots JSONB, -- Array of time slot objects
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    effective_date DATE,
    expiry_date DATE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_delivery_zones_store ON delivery_zones(store_id);
CREATE INDEX idx_delivery_zones_active ON delivery_zones(store_id) WHERE is_active = TRUE;

-- ============================================
-- STOCK RESERVATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS stock_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id VARCHAR(100) UNIQUE NOT NULL,
    cart_id UUID REFERENCES shopping_carts(id) ON DELETE CASCADE,
    order_id UUID REFERENCES web_orders(id) ON DELETE SET NULL,
    
    product_id UUID NOT NULL REFERENCES products(id),
    store_id UUID NOT NULL REFERENCES stores(id),
    batch_id VARCHAR(100),
    
    quantity INTEGER NOT NULL,
    reserved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, CONSUMED, EXPIRED, CANCELLED
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_stock_reservations_cart ON stock_reservations(cart_id);
CREATE INDEX idx_stock_reservations_order ON stock_reservations(order_id);
CREATE INDEX idx_stock_reservations_product ON stock_reservations(product_id);
CREATE INDEX idx_stock_reservations_store ON stock_reservations(store_id);
CREATE INDEX idx_stock_reservations_expires ON stock_reservations(expires_at) WHERE status = 'ACTIVE';

-- ============================================
-- COD POLICY RULES
-- ============================================

CREATE TABLE IF NOT EXISTS cod_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_name VARCHAR(100) NOT NULL,
    store_id UUID REFERENCES stores(id),
    
    -- COD limits
    max_cod_amount DECIMAL(12, 2),
    min_cod_amount DECIMAL(12, 2),
    
    -- Zone restrictions
    restricted_zones UUID[], -- Array of delivery zone IDs where COD is not allowed
    
    -- Category restrictions
    restricted_categories UUID[], -- Array of category IDs where COD is not allowed
    
    -- High-value item rules
    high_value_threshold DECIMAL(12, 2),
    high_value_cod_allowed BOOLEAN DEFAULT FALSE,
    
    -- Customer risk flags
    allow_for_risk_customers BOOLEAN DEFAULT FALSE,
    
    -- Prepaid-only conditions
    prepaid_only_for_new_customers BOOLEAN DEFAULT FALSE,
    prepaid_only_days_after_registration INTEGER,
    
    -- Failed delivery thresholds
    max_failed_deliveries INTEGER,
    failed_delivery_block_days INTEGER,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    effective_date DATE,
    expiry_date DATE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB
);

CREATE INDEX idx_cod_policies_store ON cod_policies(store_id);
CREATE INDEX idx_cod_policies_active ON cod_policies(store_id) WHERE is_active = TRUE;

-- ============================================
-- PRODUCT SEARCH INDEXING
-- ============================================

CREATE TABLE IF NOT EXISTS product_search_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Search fields
    name_en VARCHAR(255),
    name_ne VARCHAR(255),
    name_romanized VARCHAR(255),
    description_en TEXT,
    description_ne TEXT,
    description_romanized TEXT,
    
    -- Synonyms
    synonyms TEXT[], -- Array of synonym terms
    
    -- Additional fields
    sku VARCHAR(100),
    barcode VARCHAR(100),
    brand VARCHAR(100),
    category VARCHAR(100),
    
    -- Search vectors
    search_vector_en tsvector,
    search_vector_ne tsvector,
    search_vector_romanized tsvector,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_product_search_index_product ON product_search_index(product_id);
CREATE INDEX idx_product_search_index_en ON product_search_index USING GIN(search_vector_en);
CREATE INDEX idx_product_search_index_ne ON product_search_index USING GIN(search_vector_ne);
CREATE INDEX idx_product_search_index_romanized ON product_search_index USING GIN(search_vector_romanized);

-- ============================================
-- ORDER EVENTS (for order lifecycle tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS order_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES web_orders(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- CREATED, CONFIRMED, PICKING, PACKED, SHIPPED, DELIVERED, CANCELLED, RETURNED, REFUNDED
    from_status VARCHAR(50),
    to_status VARCHAR(50),
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100)
);

CREATE INDEX idx_order_events_order ON order_events(order_id);
CREATE INDEX idx_order_events_type ON order_events(event_type);
CREATE INDEX idx_order_events_created ON order_events(created_at);

-- ============================================
-- WEB ORDERS (Enhanced for full lifecycle)
-- ============================================

-- Add columns to existing web_orders table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'web_orders') THEN
        -- Add new columns if they don't exist
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS delivery_zone_id UUID;
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(12, 2) DEFAULT 0;
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS delivery_quote JSONB;
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS fulfillment_store_id UUID REFERENCES stores(id);
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS reservation_id VARCHAR(100);
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255);
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50);
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS payment_metadata JSONB;
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(100);
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS return_reason TEXT;
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(12, 2);
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS refund_reason TEXT;
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS notes TEXT;
        
        -- Update status enum to include all states
        ALTER TABLE web_orders ALTER COLUMN status TYPE VARCHAR(50);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_web_orders_delivery_zone ON web_orders(delivery_zone_id);
CREATE INDEX IF NOT EXISTS idx_web_orders_fulfillment_store ON web_orders(fulfillment_store_id);
CREATE INDEX IF NOT EXISTS idx_web_orders_idempotency ON web_orders(idempotency_key);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate reservation ID
CREATE OR REPLACE FUNCTION generate_reservation_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'RES-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to update search vectors
CREATE OR REPLACE FUNCTION update_product_search_vectors()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector_en := to_tsvector('english', COALESCE(NEW.name_en, '') || ' ' || COALESCE(NEW.description_en, '') || ' ' || COALESCE(NEW.brand, '') || ' ' || COALESCE(NEW.category, ''));
    NEW.search_vector_ne := to_tsvector('simple', COALESCE(NEW.name_ne, '') || ' ' || COALESCE(NEW.description_ne, ''));
    NEW.search_vector_romanized := to_tsvector('english', COALESCE(NEW.name_romanized, '') || ' ' || COALESCE(NEW.description_romanized, '') || ' ' || array_to_string(NEW.synonyms, ' '));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to check COD eligibility
CREATE OR REPLACE FUNCTION check_cod_eligibility(
    p_order_total DECIMAL,
    p_customer_id UUID,
    p_delivery_zone_id UUID,
    p_product_categories UUID[]
)
RETURNS TABLE(eligible BOOLEAN, reason VARCHAR) AS $$
DECLARE
    v_policy RECORD;
    v_eligible BOOLEAN := TRUE;
    v_reason VARCHAR := '';
    v_failed_deliveries INTEGER;
    v_customer_days_since_registration INTEGER;
BEGIN
    -- Get active COD policy for the store (simplified - would need store_id parameter)
    SELECT * INTO v_policy FROM cod_policies WHERE is_active = TRUE LIMIT 1;
    
    IF NOT FOUND THEN
        -- No policy means COD is allowed
        RETURN QUERY SELECT TRUE, NULL::VARCHAR;
        RETURN;
    END IF;
    
    -- Check max amount
    IF v_policy.max_cod_amount IS NOT NULL AND p_order_total > v_policy.max_cod_amount THEN
        v_eligible := FALSE;
        v_reason := 'Order amount exceeds maximum COD limit';
    END IF;
    
    -- Check min amount
    IF v_eligible AND v_policy.min_cod_amount IS NOT NULL AND p_order_total < v_policy.min_cod_amount THEN
        v_eligible := FALSE;
        v_reason := 'Order amount below minimum COD limit';
    END IF;
    
    -- Check zone restrictions
    IF v_eligible AND p_delivery_zone_id IS NOT NULL AND v_policy.restricted_zones @> ARRAY[p_delivery_zone_id] THEN
        v_eligible := FALSE;
        v_reason := 'COD not available for this delivery zone';
    END IF;
    
    -- Check category restrictions
    IF v_eligible AND p_product_categories IS NOT NULL AND v_policy.restricted_categories && p_product_categories THEN
        v_eligible := FALSE;
        v_reason := 'COD not available for selected product categories';
    END IF;
    
    -- Check high-value items
    IF v_eligible AND v_policy.high_value_threshold IS NOT NULL AND p_order_total >= v_policy.high_value_threshold AND NOT v_policy.high_value_cod_allowed THEN
        v_eligible := FALSE;
        v_reason := 'COD not available for high-value orders';
    END IF;
    
    -- Check customer risk (simplified - would need actual customer risk data)
    IF v_eligible AND NOT v_policy.allow_for_risk_customers THEN
        -- Would check customer risk flag here
        NULL;
    END IF;
    
    -- Check new customer prepaid requirement
    IF v_eligible AND v_policy.prepaid_only_for_new_customers AND p_customer_id IS NOT NULL THEN
        SELECT EXTRACT(DAY FROM (NOW() - created_at)) INTO v_customer_days_since_registration
        FROM customers WHERE id = p_customer_id;
        
        IF v_customer_days_since_registration < v_policy.prepaid_only_days_after_registration THEN
            v_eligible := FALSE;
            v_reason := 'Prepaid only for new customers';
        END IF;
    END IF;
    
    RETURN QUERY SELECT v_eligible, v_reason;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER update_product_search_vectors_trigger
    BEFORE INSERT OR UPDATE ON product_search_index
    FOR EACH ROW EXECUTE FUNCTION update_product_search_vectors();

-- Trigger to ensure only one default address per customer
CREATE OR REPLACE FUNCTION ensure_single_default_address()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = TRUE THEN
        UPDATE customer_addresses 
        SET is_default = FALSE 
        WHERE customer_id = NEW.customer_id AND id != NEW.id AND is_default = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_default_address_trigger
    BEFORE INSERT OR UPDATE ON customer_addresses
    FOR EACH ROW EXECUTE FUNCTION ensure_single_default_address();
