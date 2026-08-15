-- WP0: Organization and Store Configuration Schema
-- This migration adds multi-country support to the existing schema

-- ============================================
-- ORGANIZATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    registration_number VARCHAR(100),
    tax_id VARCHAR(100),
    country_code VARCHAR(2) NOT NULL, -- ISO 3166-1 alpha-2 (e.g., IN, NP)
    default_currency_code VARCHAR(3) NOT NULL, -- ISO 4217 alpha-3 (e.g., INR, NPR)
    default_locale VARCHAR(10) NOT NULL, -- IETF BCP 47 (e.g., en-IN, ne-NP)
    default_timezone VARCHAR(50) NOT NULL, -- IANA timezone (e.g., Asia/Kolkata)
    tax_regime VARCHAR(50) NOT NULL, -- e.g., GST, IRD, VAT
    payment_providers JSONB NOT NULL DEFAULT '[]', -- Array of enabled payment providers
    address_format JSONB, -- Country-specific address validation rules
    feature_flags JSONB NOT NULL DEFAULT '{}', -- Organization-level feature flags
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, TERMINATED
    settings JSONB NOT NULL DEFAULT '{}', -- Additional organization settings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_organizations_country ON organizations(country_code);
CREATE INDEX idx_organizations_status ON organizations(status);

-- ============================================
-- STORE CONFIGURATION UPDATES
-- ============================================

-- Add organization_id to stores if it doesn't exist
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Add country-specific configuration to stores
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2), -- ISO 3166-1 alpha-2
ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3), -- ISO 4217 alpha-3
ADD COLUMN IF NOT EXISTS locale VARCHAR(10), -- IETF BCP 47
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50), -- IANA timezone
ADD COLUMN IF NOT EXISTS tax_regime VARCHAR(50), -- Tax system identifier
ADD COLUMN IF NOT EXISTS payment_providers JSONB DEFAULT '[]', -- Store-specific payment providers
ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}', -- Store-level feature flags
ADD COLUMN IF NOT EXISTS store_settings JSONB DEFAULT '{}'; -- Additional store settings

-- Create indexes for new store columns
CREATE INDEX IF NOT EXISTS idx_stores_organization ON stores(organization_id);
CREATE INDEX IF NOT EXISTS idx_stores_country ON stores(country_code);

-- ============================================
-- FEATURE FLAGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_key VARCHAR(100) UNIQUE NOT NULL,
    flag_name VARCHAR(255) NOT NULL,
    description TEXT,
    flag_type VARCHAR(20) NOT NULL, -- COUNTRY, MODULE, EXPERIMENT, DEPLOYMENT
    default_value BOOLEAN DEFAULT FALSE,
    rollout_percentage INTEGER DEFAULT 0, -- For gradual rollouts
    target_countries VARCHAR(2)[], -- Array of country codes this flag applies to
    target_stores UUID[], -- Array of store IDs this flag applies to
    target_roles VARCHAR(50)[], -- Array of roles this flag applies to
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE INDEX idx_feature_flags_key ON feature_flags(flag_key);
CREATE INDEX idx_feature_flags_type ON feature_flags(flag_type);
CREATE INDEX idx_feature_flags_active ON feature_flags(is_active);

-- ============================================
-- COUNTRY CONFIGURATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS country_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(2) UNIQUE NOT NULL, -- ISO 3166-1 alpha-2
    country_name VARCHAR(255) NOT NULL,
    default_currency_code VARCHAR(3) NOT NULL, -- ISO 4217 alpha-3
    default_locale VARCHAR(10) NOT NULL, -- IETF BCP 47
    default_timezone VARCHAR(50) NOT NULL, -- IANA timezone
    tax_regime VARCHAR(50) NOT NULL, -- e.g., GST, IRD, VAT
    available_payment_providers JSONB NOT NULL DEFAULT '[]', -- Payment providers available in this country
    address_format JSONB, -- Address validation rules
    phone_format VARCHAR(50), -- Phone number validation regex
    postal_code_format VARCHAR(50), -- Postal code validation regex
    tax_rate_config JSONB, -- Default tax rates and rules
    business_hours_config JSONB, -- Default business hours
    holiday_calendar JSONB, -- Country-specific holidays
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_country_configurations_code ON country_configurations(country_code);
CREATE INDEX idx_country_configurations_active ON country_configurations(is_active);

-- ============================================
-- TRIGGER FOR updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON feature_flags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_country_configurations_updated_at BEFORE UPDATE ON country_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INITIAL DATA - COUNTRY CONFIGURATIONS
-- ============================================

INSERT INTO country_configurations (
    country_code, country_name, default_currency_code, default_locale, 
    default_timezone, tax_regime, available_payment_providers, 
    address_format, phone_format, postal_code_format
) VALUES
(
    'IN',
    'India',
    'INR',
    'en-IN',
    'Asia/Kolkata',
    'GST',
    '["razorpay", "upi", "paytm", "phonepe", "gpay", "card", "cash", "netbanking"]'::JSONB,
    '{
        "fields": [
            {"key": "line1", "label": "Street Address", "required": true},
            {"key": "line2", "label": "Area", "required": false},
            {"key": "city", "label": "City", "required": true},
            {"key": "state", "label": "State", "required": true},
            {"key": "postal_code", "label": "PIN Code", "required": true, "pattern": "^[1-9][0-9]{5}$"}
        ],
        "display_order": ["line1", "line2", "city", "state", "postal_code"]
    }'::JSONB,
    '^[6-9][0-9]{9}$',
    '^[1-9][0-9]{5}$'
),
(
    'NP',
    'Nepal',
    'NPR',
    'ne-NP',
    'Asia/Kathmandu',
    'IRD',
    '["esewa", "khalti", "imepay", "card", "cash", "bank_transfer"]'::JSONB,
    '{
        "fields": [
            {"key": "line1", "label": "Street Address", "required": true},
            {"key": "line2", "label": "Area", "required": false},
            {"key": "city", "label": "City", "required": true},
            {"key": "district", "label": "District", "required": true},
            {"key": "postal_code", "label": "Postal Code", "required": false}
        ],
        "display_order": ["line1", "line2", "city", "district", "postal_code"]
    }'::JSONB,
    '^[9][6-9][0-9]{8}$',
    '^[0-9]{5}$'
)
ON CONFLICT (country_code) DO NOTHING;

-- ============================================
-- INITIAL DATA - FEATURE FLAGS
-- ============================================

INSERT INTO feature_flags (flag_key, flag_name, description, flag_type, default_value, target_countries) VALUES
('ENABLE_NEPAL_IRD_TAX', 'Enable Nepal IRD Tax Integration', 'Enable IRD tax regime for Nepal stores', 'COUNTRY', false, ARRAY['NP']),
('ENABLE_ESEWA_PAYMENT', 'Enable eSewa Payment Provider', 'Enable eSewa payment integration', 'COUNTRY', false, ARRAY['NP']),
('ENABLE_KHALTI_PAYMENT', 'Enable Khalti Payment Provider', 'Enable Khalti payment integration', 'COUNTRY', false, ARRAY['NP']),
('ENABLE_NEPALESE_LOCALE', 'Enable Nepali Language Support', 'Enable Nepali language in UI', 'COUNTRY', false, ARRAY['NP']),
('ENABLE_GST_TAX', 'Enable GST Tax Integration', 'Enable GST tax regime for India stores', 'COUNTRY', true, ARRAY['IN']),
('ENABLE_RAZORPAY', 'Enable Razorpay Payment', 'Enable Razorpay payment integration', 'COUNTRY', true, ARRAY['IN']),
('ENABLE_UPI', 'Enable UPI Payments', 'Enable UPI payment integration', 'COUNTRY', true, ARRAY['IN'])
ON CONFLICT (flag_key) DO NOTHING;

-- ============================================
-- INITIAL DATA - DEFAULT ORGANIZATION
-- ============================================

INSERT INTO organizations (
    organization_name, legal_name, country_code, default_currency_code, 
    default_locale, default_timezone, tax_regime, payment_providers, feature_flags
) VALUES
(
    'NOVA MART India',
    'NOVA MART Retail Private Limited',
    'IN',
    'INR',
    'en-IN',
    'Asia/Kolkata',
    'GST',
    '["razorpay", "upi", "paytm", "phonepe", "gpay", "card", "cash", "netbanking"]'::JSONB,
    '{
        "ENABLE_GST_TAX": true,
        "ENABLE_RAZORPAY": true,
        "ENABLE_UPI": true,
        "ENABLE_NEPAL_IRD_TAX": false,
        "ENABLE_ESEWA_PAYMENT": false,
        "ENABLE_KHALTI_PAYMENT": false,
        "ENABLE_NEPALESE_LOCALE": false
    }'::JSONB
)
ON CONFLICT DO NOTHING;

-- ============================================
-- MIGRATION: UPDATE EXISTING STORES
-- ============================================

-- Update existing stores to link to the default organization and set India defaults
-- This assumes stores exist and need to be migrated
UPDATE stores
SET 
    organization_id = (SELECT id FROM organizations WHERE country_code = 'IN' LIMIT 1),
    country_code = 'IN',
    currency_code = 'INR',
    locale = 'en-IN',
    timezone = 'Asia/Kolkata',
    tax_regime = 'GST',
    payment_providers = '["razorpay", "upi", "card", "cash"]'::JSONB,
    feature_flags = '{"ENABLE_GST_TAX": true, "ENABLE_RAZORPAY": true, "ENABLE_UPI": true}'::JSONB
WHERE organization_id IS NULL;
