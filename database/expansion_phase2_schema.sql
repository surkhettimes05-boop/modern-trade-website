-- ============================================
-- EXPANSION PHASE 2: PAYMENTS, MAPS, AND LOGISTICS
-- ============================================

-- ============================================
-- PAYMENT PROVIDER ABSTRACTION
-- ============================================

-- Payment intents table (enhanced for provider abstraction)
CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id VARCHAR(100) UNIQUE NOT NULL,
    order_id UUID REFERENCES web_orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    
    -- Provider-independent fields
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NPR',
    status VARCHAR(50) NOT NULL, -- PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, REFUNDED
    payment_method VARCHAR(50), -- eSewa, Khalti, FonePay, CASH, CARD_TERMINAL
    
    -- Provider-specific fields
    provider VARCHAR(50) NOT NULL,
    provider_intent_id VARCHAR(255),
    provider_metadata JSONB,
    
    -- Idempotency
    idempotency_key VARCHAR(100) UNIQUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_payment_intents_order ON payment_intents(order_id);
CREATE INDEX idx_payment_intents_customer ON payment_intents(customer_id);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_payment_intents_provider ON payment_intents(provider);
CREATE INDEX idx_payment_intents_idempotency ON payment_intents(idempotency_key);

-- Payment webhooks table
CREATE TABLE IF NOT EXISTS payment_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id VARCHAR(100) UNIQUE NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_webhook_id VARCHAR(255),
    payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
    
    -- Webhook data
    event_type VARCHAR(100),
    raw_payload JSONB,
    processed_payload JSONB,
    
    -- Processing status
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, PROCESSED, FAILED
    processing_attempts INTEGER DEFAULT 0,
    last_error TEXT,
    
    -- Timestamps
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    metadata JSONB
);

CREATE INDEX idx_payment_webhooks_provider ON payment_webhooks(provider);
CREATE INDEX idx_payment_webhooks_intent ON payment_webhooks(payment_intent_id);
CREATE INDEX idx_payment_webhooks_status ON payment_webhooks(status);
CREATE INDEX idx_payment_webhooks_received ON payment_webhooks(received_at);

-- Payment refunds table
CREATE TABLE IF NOT EXISTS payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id VARCHAR(100) UNIQUE NOT NULL,
    payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
    
    -- Refund details
    amount DECIMAL(12, 2) NOT NULL,
    reason TEXT,
    
    -- Provider-specific fields
    provider VARCHAR(50) NOT NULL,
    provider_refund_id VARCHAR(255),
    provider_metadata JSONB,
    
    -- Status
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_payment_refunds_intent ON payment_refunds(payment_intent_id);
CREATE INDEX idx_payment_refunds_status ON payment_refunds(status);
CREATE INDEX idx_payment_refunds_provider ON payment_refunds(provider);

-- Payment reconciliation table
CREATE TABLE IF NOT EXISTS payment_reconciliation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id VARCHAR(100) UNIQUE NOT NULL,
    date DATE NOT NULL,
    provider VARCHAR(50) NOT NULL,
    
    -- Reconciliation data
    total_transactions INTEGER DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    matched_transactions INTEGER DEFAULT 0,
    matched_amount DECIMAL(12, 2) DEFAULT 0,
    unmatched_transactions INTEGER DEFAULT 0,
    unmatched_amount DECIMAL(12, 2) DEFAULT 0,
    
    -- Status
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_payment_reconciliation_date ON payment_reconciliation(date);
CREATE INDEX idx_payment_reconciliation_provider ON payment_reconciliation(provider);
CREATE INDEX idx_payment_reconciliation_status ON payment_reconciliation(status);

-- ============================================
-- MAP PROVIDER ABSTRACTION
-- ============================================

-- Map provider configurations
CREATE TABLE IF NOT EXISTS map_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name VARCHAR(50) NOT NULL UNIQUE, -- BAATO, GALLI, GOOGLE
    api_key VARCHAR(255),
    api_secret VARCHAR(255),
    base_url VARCHAR(255),
    
    -- Configuration
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB
);

-- Geocoding cache
CREATE TABLE IF NOT EXISTS geocoding_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    
    -- Results
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    formatted_address TEXT,
    raw_response JSONB,
    
    -- Cache control
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(query, provider)
);

CREATE INDEX idx_geocoding_cache_query ON geocoding_cache(query);
CREATE INDEX idx_geocoding_cache_expires ON geocoding_cache(expires_at);

-- ============================================
-- DELIVERY OPERATIONS
-- ============================================

-- Delivery assignments
CREATE TABLE IF NOT EXISTS delivery_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id VARCHAR(100) UNIQUE NOT NULL,
    order_id UUID NOT NULL REFERENCES web_orders(id) ON DELETE CASCADE,
    
    -- Assignment details
    delivery_person_id VARCHAR(100),
    delivery_person_name VARCHAR(255),
    delivery_person_phone VARCHAR(20),
    
    -- Status
    status VARCHAR(50) DEFAULT 'ASSIGNED', -- ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, FAILED, CANCELLED
    
    -- Timestamps
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    picked_up_at TIMESTAMP WITH TIME ZONE,
    in_transit_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Delivery details
    delivery_notes TEXT,
    proof_of_delivery_url VARCHAR(255),
    customer_signature_url VARCHAR(255),
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_delivery_assignments_order ON delivery_assignments(order_id);
CREATE INDEX idx_delivery_assignments_person ON delivery_assignments(delivery_person_id);
CREATE INDEX idx_delivery_assignments_status ON delivery_assignments(status);

-- Delivery tracking events
CREATE TABLE IF NOT EXISTS delivery_tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_assignment_id UUID NOT NULL REFERENCES delivery_assignments(id) ON DELETE CASCADE,
    
    -- Event details
    event_type VARCHAR(50) NOT NULL, -- ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, FAILED, CANCELLED
    status VARCHAR(50) NOT NULL,
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_delivery_tracking_events_assignment ON delivery_tracking_events(delivery_assignment_id);
CREATE INDEX idx_delivery_tracking_events_created ON delivery_tracking_events(created_at);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate payment intent ID
CREATE OR REPLACE FUNCTION generate_payment_intent_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'PAY-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate refund ID
CREATE OR REPLACE FUNCTION generate_refund_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'REF-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate webhook ID
CREATE OR REPLACE FUNCTION generate_webhook_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'WH-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate reconciliation ID
CREATE OR REPLACE FUNCTION generate_reconciliation_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'REC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at triggers
CREATE TRIGGER update_payment_intents_updated_at BEFORE UPDATE ON payment_intents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_refunds_updated_at BEFORE UPDATE ON payment_refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_reconciliation_updated_at BEFORE UPDATE ON payment_reconciliation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_map_provider_configs_updated_at BEFORE UPDATE ON map_provider_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_assignments_updated_at BEFORE UPDATE ON delivery_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
