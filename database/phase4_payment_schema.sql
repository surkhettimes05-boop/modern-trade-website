-- Phase 4 Database Schema: Payment Integration
-- This schema adds tables for payment processing, reconciliation, and webhook tracking

-- ============================================
-- PAYMENT INTENTS
-- ============================================

CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_number VARCHAR(100) UNIQUE NOT NULL,
    provider VARCHAR(20) NOT NULL, -- ESEWA, KHALTI, CASH, CARD
    amount_npr DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NPR',
    status VARCHAR(20) NOT NULL, -- CREATED, PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, REFUNDED
    order_reference VARCHAR(100), -- Optional order or sale reference
    customer_id UUID REFERENCES customers(id),
    store_id UUID REFERENCES stores(id),
    device_id VARCHAR(100) REFERENCES devices(device_id),
    
    -- Provider-specific data
    provider_transaction_id VARCHAR(100),
    provider_payment_url VARCHAR(500),
    provider_metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    refunded_at TIMESTAMP WITH TIME ZONE,
    
    -- Security
    idempotency_key VARCHAR(100) UNIQUE,
    signature VARCHAR(255),
    
    -- Metadata
    metadata JSONB,
    created_by VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payment_intents_number ON payment_intents(intent_number);
CREATE INDEX idx_payment_intents_provider ON payment_intents(provider);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_payment_intents_order ON payment_intents(order_reference);
CREATE INDEX idx_payment_intents_customer ON payment_intents(customer_id);
CREATE INDEX idx_payment_intents_store ON payment_intents(store_id);
CREATE INDEX idx_payment_intents_idempotency ON payment_intents(idempotency_key);
CREATE INDEX idx_payment_intents_created ON payment_intents(created_at);

-- ============================================
-- PAYMENT WEBHOOK LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS payment_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(20) NOT NULL,
    webhook_id VARCHAR(100),
    event_type VARCHAR(50) NOT NULL,
    payment_intent_id UUID REFERENCES payment_intents(id),
    provider_transaction_id VARCHAR(100),
    
    -- Request data
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    request_headers JSONB,
    request_body JSONB,
    
    -- Verification
    signature_provided VARCHAR(255),
    signature_calculated VARCHAR(255),
    signature_valid BOOLEAN,
    
    -- Processing
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_status VARCHAR(20), -- PENDING, PROCESSED, FAILED, DUPLICATE
    processing_error TEXT,
    
    -- Replay protection
    is_duplicate BOOLEAN DEFAULT FALSE,
    original_webhook_id UUID REFERENCES payment_webhook_logs(id),
    
    metadata JSONB
);

CREATE INDEX idx_webhook_logs_provider ON payment_webhook_logs(provider);
CREATE INDEX idx_webhook_logs_webhook_id ON payment_webhook_logs(webhook_id);
CREATE INDEX idx_webhook_logs_payment_intent ON payment_webhook_logs(payment_intent_id);
CREATE INDEX idx_webhook_logs_received ON payment_webhook_logs(received_at);
CREATE INDEX idx_webhook_logs_duplicate ON payment_webhook_logs(is_duplicate);

-- ============================================
-- PAYMENT RECONCILIATION
-- ============================================

CREATE TABLE IF NOT EXISTS payment_reconciliation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_date DATE NOT NULL,
    provider VARCHAR(20) NOT NULL,
    store_id UUID REFERENCES stores(id),
    
    -- Counts and amounts
    transaction_count INTEGER NOT NULL,
    total_amount_npr DECIMAL(12, 2) NOT NULL,
    successful_count INTEGER NOT NULL,
    successful_amount_npr DECIMAL(12, 2) NOT NULL,
    failed_count INTEGER NOT NULL,
    failed_amount_npr DECIMAL(12, 2) NOT NULL,
    refunded_count INTEGER NOT NULL,
    refunded_amount_npr DECIMAL(12, 2) NOT NULL,
    
    -- Provider data
    provider_report_count INTEGER,
    provider_report_amount_npr DECIMAL(12, 2),
    
    -- Discrepancies
    count_discrepancy INTEGER,
    amount_discrepancy_npr DECIMAL(12, 2),
    discrepancy_details JSONB,
    
    -- Status
    reconciliation_status VARCHAR(20) NOT NULL, -- MATCHED, DISCREPANCY, PENDING_PROVIDER, FAILED
    reconciled_by VARCHAR(100),
    reconciled_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(reconciliation_date, provider, store_id)
);

CREATE INDEX idx_reconciliation_date ON payment_reconciliation(reconciliation_date);
CREATE INDEX idx_reconciliation_provider ON payment_reconciliation(provider);
CREATE INDEX idx_reconciliation_store ON payment_reconciliation(store_id);
CREATE INDEX idx_reconciliation_status ON payment_reconciliation(reconciliation_status);

-- ============================================
-- PAYMENT REFUNDS
-- ============================================

CREATE TABLE IF NOT EXISTS payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_number VARCHAR(100) UNIQUE NOT NULL,
    payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
    provider VARCHAR(20) NOT NULL,
    amount_npr DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NPR',
    status VARCHAR(20) NOT NULL, -- REQUESTED, PROCESSING, COMPLETED, FAILED, CANCELLED
    reason TEXT,
    
    -- Provider data
    provider_refund_id VARCHAR(100),
    provider_metadata JSONB,
    
    -- Timestamps
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    
    -- Security
    idempotency_key VARCHAR(100) UNIQUE,
    
    metadata JSONB,
    created_by VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_refunds_number ON payment_refunds(refund_number);
CREATE INDEX idx_refunds_payment_intent ON payment_refunds(payment_intent_id);
CREATE INDEX idx_refunds_provider ON payment_refunds(provider);
CREATE INDEX idx_refunds_status ON payment_refunds(status);
CREATE INDEX idx_refunds_idempotency ON payment_refunds(idempotency_key);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate payment intent number
CREATE OR REPLACE FUNCTION generate_payment_intent_number()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('payment_intent_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Create sequence for payment intent numbers
CREATE SEQUENCE IF NOT EXISTS payment_intent_seq START 1;

-- Function to check for duplicate webhook
CREATE OR REPLACE FUNCTION is_duplicate_webhook(provider_param VARCHAR, webhook_id_param VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM payment_webhook_logs
        WHERE provider = provider_param
          AND webhook_id = webhook_id_param
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to update updated_at
CREATE TRIGGER update_payment_intents_updated_at BEFORE UPDATE ON payment_intents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_reconciliation_updated_at BEFORE UPDATE ON payment_reconciliation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_refunds_updated_at BEFORE UPDATE ON payment_refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
