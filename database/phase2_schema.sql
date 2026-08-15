-- Phase 2 Database Schema: Customer Identity and Loyalty

-- ============================================
-- CUSTOMER PROFILES
-- ============================================

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_normalized VARCHAR(15) NOT NULL UNIQUE,
    phone_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash for lookup
    phone_encrypted TEXT, -- Encrypted phone for verification
    phone_masked VARCHAR(20), -- Masked for staff views (98XXXXXX)
    preferred_name VARCHAR(100),
    email VARCHAR(255),
    language VARCHAR(5) DEFAULT 'en', -- 'en' or 'ne'
    home_store_id UUID REFERENCES stores(id),
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, DELETED
    verification_status VARCHAR(20) DEFAULT 'UNVERIFIED', -- UNVERIFIED, VERIFIED
    enrollment_source VARCHAR(50), -- POS, WEBSITE, APP, ADMIN
    enrollment_location_id UUID REFERENCES stores(id),
    enrollment_channel VARCHAR(50), -- IN_STORE, ONLINE, MOBILE
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    enrolled_by VARCHAR(100),
    last_login_at TIMESTAMP,
    last_login_ip VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(100),
    merge_target_id UUID REFERENCES customers(id), -- If merged, points to surviving customer
    merge_reason TEXT,
    merged_at TIMESTAMP,
    merged_by VARCHAR(100)
);

CREATE INDEX idx_customers_phone_normalized ON customers(phone_normalized);
CREATE INDEX idx_customers_phone_hash ON customers(phone_hash);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_verification_status ON customers(verification_status);
CREATE INDEX idx_customers_home_store ON customers(home_store_id);

-- ============================================
-- CUSTOMER MERGE AUDIT
-- ============================================

CREATE TABLE IF NOT EXISTS customer_merge_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_customer_id UUID NOT NULL,
    target_customer_id UUID NOT NULL,
    merge_reason TEXT NOT NULL,
    merged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    merged_by VARCHAR(100) NOT NULL,
    approval_required BOOLEAN DEFAULT FALSE,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    -- Snapshot of source customer before merge
    source_snapshot JSONB,
    -- Snapshot of target customer before merge
    target_snapshot JSONB
);

CREATE INDEX idx_customer_merge_audit_source ON customer_merge_audit(source_customer_id);
CREATE INDEX idx_customer_merge_audit_target ON customer_merge_audit(target_customer_id);

-- ============================================
-- CONSENT RECORDS
-- ============================================

CREATE TABLE IF NOT EXISTS customer_consent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    consent_type VARCHAR(50) NOT NULL, -- MARKETING, TRANSACTIONAL, ANALYTICS, PROFILE
    consent_state VARCHAR(20) NOT NULL, -- GRANTED, WITHDRAWN
    channel VARCHAR(50), -- SMS, EMAIL, APP, WEB
    policy_version VARCHAR(20) NOT NULL,
    source VARCHAR(50), -- CUSTOMER, STAFF, SYSTEM
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_ip VARCHAR(45),
    withdrawn_at TIMESTAMP,
    withdrawn_reason TEXT,
    evidence_url TEXT, -- Link to consent evidence if applicable
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_consent_customer ON customer_consent(customer_id);
CREATE INDEX idx_customer_consent_type ON customer_consent(consent_type);
CREATE INDEX idx_customer_consent_state ON customer_consent(consent_state);

-- ============================================
-- DATA REQUESTS (Access/Deletion)
-- ============================================

CREATE TABLE IF NOT EXISTS customer_data_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    request_type VARCHAR(20) NOT NULL, -- ACCESS, DELETION, CORRECTION
    request_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, COMPLETED, REJECTED
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    requested_ip VARCHAR(45),
    processed_at TIMESTAMP,
    processed_by VARCHAR(100),
    rejection_reason TEXT,
    export_url TEXT, -- For access requests
    deletion_completed_at TIMESTAMP,
    notes TEXT
);

CREATE INDEX idx_customer_data_requests_customer ON customer_data_requests(customer_id);
CREATE INDEX idx_customer_data_requests_status ON customer_data_requests(request_status);

-- ============================================
-- OTP RECORDS
-- ============================================

CREATE TABLE IF NOT EXISTS customer_otp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id),
    phone_normalized VARCHAR(15) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    purpose VARCHAR(50) NOT NULL, -- LOGIN, VERIFICATION, ENROLLMENT
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    attempt_count INTEGER DEFAULT 0,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_otp_phone ON customer_otp(phone_normalized);
CREATE INDEX idx_customer_otp_customer ON customer_otp(customer_id);
CREATE INDEX idx_customer_otp_expires ON customer_otp(expires_at);

-- ============================================
-- CUSTOMER SESSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS customer_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    session_token VARCHAR(255) NOT NULL UNIQUE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_reason TEXT
);

CREATE INDEX idx_customer_sessions_customer ON customer_sessions(customer_id);
CREATE INDEX idx_customer_sessions_token ON customer_sessions(session_token);
CREATE INDEX idx_customer_sessions_expires ON customer_sessions(expires_at);

-- ============================================
-- LOYALTY LEDGER (Immutable)
-- ============================================

CREATE TABLE IF NOT EXISTS loyalty_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    points_signed INTEGER NOT NULL, -- Positive for earn, negative for redeem
    entry_type VARCHAR(20) NOT NULL, -- EARN, REDEEM, EXPIRE, ADJUST, REVERSAL
    entry_status VARCHAR(20) DEFAULT 'POSTED', -- POSTED, PENDING, FAILED
    effective_timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Source information
    source_type VARCHAR(50) NOT NULL, -- SALE, RETURN, ADJUSTMENT, CAMPAIGN, EXPIRY_JOB
    source_id UUID, -- Reference to sale, return, etc.
    location_id UUID REFERENCES stores(id),
    
    -- Rule reference
    rule_id UUID,
    rule_version INTEGER,
    
    -- Idempotency
    idempotency_key VARCHAR(255) UNIQUE,
    
    -- Actor and reason
    actor VARCHAR(100), -- SYSTEM, CUSTOMER, STAFF_ID
    reason TEXT,
    
    -- Reversal support
    reversal_of_id UUID REFERENCES loyalty_ledger(id),
    reversal_reason TEXT,
    
    -- Calculation metadata
    calculation_metadata JSONB, -- Store calculation details for transparency
    
    -- Constraints
    CONSTRAINT ledger_points_not_zero CHECK (points_signed != 0),
    CONSTRAINT ledger_reversal_type CHECK (
        (entry_type = 'REVERSAL' AND reversal_of_id IS NOT NULL) OR
        (entry_type != 'REVERSAL')
    )
);

CREATE INDEX idx_loyalty_ledger_customer ON loyalty_ledger(customer_id);
CREATE INDEX idx_loyalty_ledger_type ON loyalty_ledger(entry_type);
CREATE INDEX idx_loyalty_ledger_status ON loyalty_ledger(entry_status);
CREATE INDEX idx_loyalty_ledger_source ON loyalty_ledger(source_type, source_id);
CREATE INDEX idx_loyalty_ledger_effective ON loyalty_ledger(effective_timestamp);
CREATE INDEX idx_loyalty_ledger_reversal ON loyalty_ledger(reversal_of_id);

-- ============================================
-- EARN LOTS (For expiry tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS loyalty_earn_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    ledger_entry_id UUID NOT NULL REFERENCES loyalty_ledger(id),
    original_points INTEGER NOT NULL,
    remaining_points INTEGER NOT NULL,
    available_date TIMESTAMP NOT NULL, -- When points become available
    expiry_date TIMESTAMP NOT NULL,
    is_expired BOOLEAN DEFAULT FALSE,
    expired_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT earn_lots_remaining_non_negative CHECK (remaining_points >= 0),
    CONSTRAINT earn_lots_original_positive CHECK (original_points > 0)
);

CREATE INDEX idx_loyalty_earn_lots_customer ON loyalty_earn_lots(customer_id);
CREATE INDEX idx_loyalty_earn_lots_expiry ON loyalty_earn_lots(expiry_date);
CREATE INDEX idx_loyalty_earn_lots_ledger ON loyalty_earn_lots(ledger_entry_id);

-- ============================================
-- LOYALTY RULES (Versioned Configuration)
-- ============================================

CREATE TABLE IF NOT EXISTS loyalty_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    rule_type VARCHAR(50) NOT NULL, -- base_earning, product_multiplier, campaign_bonus, etc.
    config JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT, PUBLISHED, RETIRED
    effective_from TIMESTAMP,
    effective_to TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    published_at TIMESTAMP,
    published_by VARCHAR(100),
    retired_at TIMESTAMP,
    retired_by VARCHAR(100),
    
    CONSTRAINT rule_version_positive CHECK (version > 0),
    CONSTRAINT rule_unique_name_version UNIQUE (name, version)
);

CREATE INDEX idx_loyalty_rules_name ON loyalty_rules(name);
CREATE INDEX idx_loyalty_rules_type ON loyalty_rules(rule_type);
CREATE INDEX idx_loyalty_rules_status ON loyalty_rules(status);
CREATE INDEX idx_loyalty_rules_effective ON loyalty_rules(effective_from, effective_to);

-- ============================================
-- SALES (For POS integration)
-- ============================================

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    store_id UUID NOT NULL REFERENCES stores(id),
    sale_status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT, PENDING, COMPLETED, VOIDED, RETURNED
    total_amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NPR',
    points_earned INTEGER DEFAULT 0,
    points_redeemed INTEGER DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    payment_method VARCHAR(50),
    sale_timestamp TIMESTAMP,
    completed_at TIMESTAMP,
    voided_at TIMESTAMP,
    voided_by VARCHAR(100),
    void_reason TEXT,
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_store ON sales(store_id);
CREATE INDEX idx_sales_status ON sales(sale_status);
CREATE INDEX idx_sales_number ON sales(sale_number);
CREATE INDEX idx_sales_timestamp ON sales(sale_timestamp);

-- ============================================
-- SALE ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id),
    product_id UUID REFERENCES products(id),
    sku VARCHAR(100),
    product_name VARCHAR(255),
    quantity DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    line_total DECIMAL(12, 2) NOT NULL,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    points_eligible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

-- ============================================
-- RETURNS
-- ============================================

CREATE TABLE IF NOT EXISTS returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_number VARCHAR(50) UNIQUE NOT NULL,
    sale_id UUID NOT NULL REFERENCES sales(id),
    customer_id UUID REFERENCES customers(id),
    store_id UUID NOT NULL REFERENCES stores(id),
    return_status VARCHAR(20) DEFAULT 'REQUESTED', -- REQUESTED, APPROVED, PROCESSED, REJECTED
    total_amount DECIMAL(12, 2) NOT NULL,
    points_reversed INTEGER DEFAULT 0,
    redemption_reversed INTEGER DEFAULT 0,
    return_timestamp TIMESTAMP,
    processed_at TIMESTAMP,
    processed_by VARCHAR(100),
    rejection_reason TEXT,
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_returns_sale ON returns(sale_id);
CREATE INDEX idx_returns_customer ON returns(customer_id);
CREATE INDEX idx_returns_status ON returns(return_status);

-- ============================================
-- RETURN ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES returns(id),
    sale_item_id UUID NOT NULL REFERENCES sale_items(id),
    quantity DECIMAL(10, 2) NOT NULL,
    return_amount DECIMAL(12, 2) NOT NULL,
    points_reversed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_return_items_return ON return_items(return_id);
CREATE INDEX idx_return_items_sale_item ON return_items(sale_item_id);

-- ============================================
-- OFFLINE QUEUE (For pending earns)
-- ============================================

CREATE TABLE IF NOT EXISTS offline_earn_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id),
    store_id UUID REFERENCES stores(id),
    sale_data JSONB NOT NULL,
    points_calculated INTEGER NOT NULL,
    queue_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, UPLOADED, REJECTED, FAILED
    device_id VARCHAR(100),
    local_sale_id VARCHAR(100),
    uploaded_at TIMESTAMP,
    server_sale_id UUID REFERENCES sales(id),
    rejection_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_offline_queue_customer ON offline_earn_queue(customer_id);
CREATE INDEX idx_offline_queue_status ON offline_earn_queue(queue_status);
CREATE INDEX idx_offline_queue_device ON offline_earn_queue(device_id);

-- ============================================
-- AUDIT LOG (Extended for Phase 2)
-- ============================================

CREATE TABLE IF NOT EXISTS customer_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id),
    entity_type VARCHAR(50) NOT NULL, -- CUSTOMER, CONSENT, LEDGER, MERGE
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, MERGE, GRANT_CONSENT, WITHDRAW_CONSENT
    old_values JSONB,
    new_values JSONB,
    performed_by VARCHAR(100),
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    reason TEXT
);

CREATE INDEX idx_customer_audit_customer ON customer_audit_log(customer_id);
CREATE INDEX idx_customer_audit_entity ON customer_audit_log(entity_type, entity_id);
CREATE INDEX idx_customer_audit_action ON customer_audit_log(action);
CREATE INDEX idx_customer_audit_performed ON customer_audit_log(performed_at);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to relevant tables
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_consent_updated_at BEFORE UPDATE ON customer_consent
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_returns_updated_at BEFORE UPDATE ON returns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_offline_queue_updated_at BEFORE UPDATE ON offline_earn_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
