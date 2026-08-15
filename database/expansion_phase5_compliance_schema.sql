-- ============================================
-- EXPANSION PHASE 5: IRD COMPLIANCE, FISCAL INTEGRITY, PRODUCTION HARDENING
-- ============================================

-- ============================================
-- IRD TAX COMPLIANCE
-- ============================================

CREATE TABLE IF NOT EXISTS ird_tax_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    
    -- VAT Configuration
    vat_enabled BOOLEAN DEFAULT TRUE,
    vat_rate DECIMAL(5, 2) DEFAULT 13.00,
    vat_registration_number VARCHAR(50),
    
    -- Excise Duty Configuration
    excise_duty_enabled BOOLEAN DEFAULT FALSE,
    excise_duty_rates JSONB,
    
    -- Withholding Tax Configuration
    withholding_tax_enabled BOOLEAN DEFAULT FALSE,
    withholding_tax_rate DECIMAL(5, 2) DEFAULT 1.50,
    
    -- IRD API Configuration
    ird_api_url VARCHAR(255),
    ird_api_username VARCHAR(100),
    ird_api_password_encrypted TEXT,
    
    -- Audit Trail
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(100),
    
    UNIQUE(store_id)
);

CREATE INDEX idx_ird_tax_configurations_store ON ird_tax_configurations(store_id);

-- ============================================
-- TAX TRANSACTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS tax_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    store_id UUID NOT NULL REFERENCES stores(id),
    
    -- Transaction Details
    transaction_type VARCHAR(50) NOT NULL, -- SALE, PURCHASE, REFUND, ADJUSTMENT
    reference_id UUID,
    reference_type VARCHAR(50),
    
    -- Tax Details
    vat_amount DECIMAL(12, 2) DEFAULT 0,
    excise_duty_amount DECIMAL(12, 2) DEFAULT 0,
    withholding_tax_amount DECIMAL(12, 2) DEFAULT 0,
    total_tax_amount DECIMAL(12, 2) NOT NULL,
    
    -- Amounts
    net_amount DECIMAL(12, 2) NOT NULL,
    gross_amount DECIMAL(12, 2) NOT NULL,
    
    -- IRD Submission
    ird_submission_status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, SUBMITTED, ACCEPTED, REJECTED
    ird_submission_id VARCHAR(100),
    ird_submission_timestamp TIMESTAMP WITH TIME ZONE,
    ird_response JSONB,
    
    -- Timestamps
    transaction_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    business_date DATE GENERATED ALWAYS AS (utc_to_nepal_business_date(transaction_timestamp)) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tax_transactions_store ON tax_transactions(store_id);
CREATE INDEX idx_tax_transactions_type ON tax_transactions(transaction_type);
CREATE INDEX idx_tax_transactions_date ON tax_transactions(business_date);
CREATE INDEX idx_tax_transactions_ird_status ON tax_transactions(ird_submission_status);
CREATE INDEX idx_tax_transactions_reference ON tax_transactions(reference_type, reference_id);

-- ============================================
-- IRD SUBMISSION BATCHES
-- ============================================

CREATE TABLE IF NOT EXISTS ird_submission_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id VARCHAR(100) UNIQUE NOT NULL,
    store_id UUID NOT NULL REFERENCES stores(id),
    
    -- Batch Details
    submission_type VARCHAR(50) NOT NULL, -- VAT_RETURN, EXCISE_RETURN, WITHHOLDING_RETURN
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Summary
    total_transactions INTEGER DEFAULT 0,
    total_tax_amount DECIMAL(12, 2) DEFAULT 0,
    
    -- Status
    submission_status VARCHAR(50) DEFAULT 'DRAFT', -- DRAFT, SUBMITTED, ACCEPTED, REJECTED
    ird_submission_id VARCHAR(100),
    ird_submission_timestamp TIMESTAMP WITH TIME ZONE,
    ird_response JSONB,
    
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_ird_submission_batches_store ON ird_submission_batches(store_id);
CREATE INDEX idx_ird_submission_batches_type ON ird_submission_batches(submission_type);
CREATE INDEX idx_ird_submission_batches_period ON ird_submission_batches(period_start, period_end);
CREATE INDEX idx_ird_submission_batches_status ON ird_submission_batches(submission_status);

-- ============================================
-- AUDIT TRAILS
-- ============================================

CREATE TABLE IF NOT EXISTS audit_trails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Actor
    user_id VARCHAR(100),
    user_type VARCHAR(50), -- STAFF, CUSTOMER, SYSTEM, API
    session_id VARCHAR(255),
    
    -- Action
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    
    -- Changes
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    
    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(100),
    
    -- Timestamps
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    business_date DATE GENERATED ALWAYS AS (utc_to_nepal_business_date(occurred_at)) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_trails_user ON audit_trails(user_id);
CREATE INDEX idx_audit_trails_action ON audit_trails(action);
CREATE INDEX idx_audit_trails_entity ON audit_trails(entity_type, entity_id);
CREATE INDEX idx_audit_trails_date ON audit_trails(business_date);
CREATE INDEX idx_audit_trails_occurred ON audit_trails(occurred_at);

-- ============================================
-- FISCAL SIGNATURES
-- ============================================

CREATE TABLE IF NOT EXISTS fiscal_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signature_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Document
    document_type VARCHAR(50) NOT NULL, -- INVOICE, RECEIPT, CREDIT_NOTE, DEBIT_NOTE
    document_id UUID NOT NULL,
    document_number VARCHAR(100) NOT NULL,
    
    -- Signature
    signature_value TEXT NOT NULL,
    signature_algorithm VARCHAR(50) DEFAULT 'RSA-SHA256',
    public_key_fingerprint VARCHAR(255),
    
    -- Validation
    is_valid BOOLEAN DEFAULT TRUE,
    validation_timestamp TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_fiscal_signatures_document ON fiscal_signatures(document_type, document_id);
CREATE INDEX idx_fiscal_signatures_number ON fiscal_signatures(document_number);
CREATE INDEX idx_fiscal_signatures_valid ON fiscal_signatures(is_valid);

-- ============================================
-- ENCRYPTION KEYS
-- ============================================

CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Key Details
    key_type VARCHAR(50) NOT NULL, -- DATA_ENCRYPTION, SIGNING, IRD_API
    key_algorithm VARCHAR(50) NOT NULL, -- AES-256-GCM, RSA-2048, RSA-4096
    key_usage VARCHAR(50) NOT NULL, -- ENCRYPTION, SIGNING, BOTH
    
    -- Key Material (Encrypted)
    public_key_encrypted TEXT,
    private_key_encrypted TEXT,
    
    -- Metadata
    key_version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Rotation
    rotated_at TIMESTAMP WITH TIME ZONE,
    rotated_by VARCHAR(100),
    
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_encryption_keys_type ON encryption_keys(key_type);
CREATE INDEX idx_encryption_keys_active ON encryption_keys(is_active);
CREATE INDEX idx_encryption_keys_usage ON encryption_keys(key_usage);

-- ============================================
-- SECURITY INCIDENTS
-- ============================================

CREATE TABLE IF NOT EXISTS security_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Incident Details
    incident_type VARCHAR(50) NOT NULL, -- UNAUTHORIZED_ACCESS, DATA_BREACH, FAILED_LOGIN, SUSPICIOUS_ACTIVITY
    severity VARCHAR(20) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
    
    -- Affected Resources
    affected_entity_type VARCHAR(50),
    affected_entity_id UUID,
    affected_user_id VARCHAR(100),
    
    -- Description
    description TEXT,
    technical_details JSONB,
    
    -- Status
    incident_status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, INVESTIGATING, RESOLVED, CLOSED
    resolution_notes TEXT,
    
    -- Timeline
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Assignment
    assigned_to VARCHAR(100),
    assigned_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    reported_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_security_incidents_type ON security_incidents(incident_type);
CREATE INDEX idx_security_incidents_severity ON security_incidents(severity);
CREATE INDEX idx_security_incidents_status ON security_incidents(incident_status);
CREATE INDEX idx_security_incidents_detected ON security_incidents(detected_at);

-- ============================================
-- COMPLIANCE REPORTS
-- ============================================

CREATE TABLE IF NOT EXISTS compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id VARCHAR(100) UNIQUE NOT NULL,
    store_id UUID NOT NULL REFERENCES stores(id),
    
    -- Report Details
    report_type VARCHAR(50) NOT NULL, -- VAT_RETURN, TAX_SUMMARY, AUDIT_TRAIL, SECURITY_REPORT
    report_period_start DATE NOT NULL,
    report_period_end DATE NOT NULL,
    
    -- Report Data
    report_data JSONB NOT NULL,
    
    -- Status
    generation_status VARCHAR(50) DEFAULT 'GENERATING', -- GENERATING, COMPLETED, FAILED
    file_path TEXT,
    file_checksum VARCHAR(64),
    
    -- Timestamps
    generated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100)
);

CREATE INDEX idx_compliance_reports_store ON compliance_reports(store_id);
CREATE INDEX idx_compliance_reports_type ON compliance_reports(report_type);
CREATE INDEX idx_compliance_reports_period ON compliance_reports(report_period_start, report_period_end);
CREATE INDEX idx_compliance_reports_status ON compliance_reports(generation_status);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate tax transaction ID
CREATE OR REPLACE FUNCTION generate_tax_transaction_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'TAX-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate IRD submission batch ID
CREATE OR REPLACE FUNCTION generate_ird_submission_batch_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'IRB-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate audit trail ID
CREATE OR REPLACE FUNCTION generate_audit_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'AUD-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate fiscal signature ID
CREATE OR REPLACE FUNCTION generate_fiscal_signature_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'FIS-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate encryption key ID
CREATE OR REPLACE FUNCTION generate_encryption_key_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'KEY-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate security incident ID
CREATE OR REPLACE FUNCTION generate_security_incident_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'SEC-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate compliance report ID
CREATE OR REPLACE FUNCTION generate_compliance_report_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'CMP-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
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

CREATE TRIGGER update_ird_tax_configurations_updated_at BEFORE UPDATE ON ird_tax_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
