-- ============================================
-- EXPANSION PHASE 3: INSTALLABLE POS, HARDWARE, OFFLINE, UNIFIED LOYALTY
-- ============================================

-- ============================================
-- POS DEVICE REGISTRATION
-- ============================================

CREATE TABLE IF NOT EXISTS pos_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(100) UNIQUE NOT NULL,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    
    -- Device details
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL, -- DESKTOP, TABLET, MOBILE, KIOSK
    operating_system VARCHAR(100),
    os_version VARCHAR(50),
    app_version VARCHAR(50),
    hardware_profile JSONB,
    
    -- Location
    location_name VARCHAR(255),
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_online BOOLEAN DEFAULT TRUE,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    
    -- Configuration
    config JSONB,
    
    -- Audit
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    registered_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_pos_devices_store ON pos_devices(store_id);
CREATE INDEX idx_pos_devices_active ON pos_devices(is_active);
CREATE INDEX idx_pos_devices_online ON pos_devices(is_online);
CREATE INDEX idx_pos_devices_heartbeat ON pos_devices(last_heartbeat);

-- ============================================
-- HARDWARE PERIPHERALS
-- ============================================

CREATE TABLE IF NOT EXISTS hardware_peripherals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peripheral_id VARCHAR(100) UNIQUE NOT NULL,
    device_id UUID NOT NULL REFERENCES pos_devices(id) ON DELETE CASCADE,
    
    -- Peripheral details
    peripheral_type VARCHAR(50) NOT NULL, -- PRINTER, SCANNER, CASH_DRAWER, CARD_READER, DISPLAY, SCALE
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(100),
    
    -- Connection
    connection_type VARCHAR(50), -- USB, BLUETOOTH, NETWORK, SERIAL
    port_identifier VARCHAR(100),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) DEFAULT 'CONNECTED', -- CONNECTED, DISCONNECTED, ERROR
    
    -- Configuration
    config JSONB,
    
    -- Audit
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX idx_hardware_peripherals_device ON hardware_peripherals(device_id);
CREATE INDEX idx_hardware_peripherals_type ON hardware_peripherals(peripheral_type);
CREATE INDEX idx_hardware_peripherals_status ON hardware_peripherals(status);

-- ============================================
-- OFFLINE DATA SNAPSHOTS
-- ============================================

CREATE TABLE IF NOT EXISTS offline_data_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id VARCHAR(100) UNIQUE NOT NULL,
    device_id UUID NOT NULL REFERENCES pos_devices(id) ON DELETE CASCADE,
    
    -- Snapshot details
    snapshot_type VARCHAR(50) NOT NULL, -- FULL, INCREMENTAL, PRODUCTS, CUSTOMERS, PRICES
    data_version INTEGER,
    
    -- Data
    data_hash VARCHAR(64),
    data_size_bytes BIGINT,
    record_count INTEGER,
    
    -- Status
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_offline_data_snapshots_device ON offline_data_snapshots(device_id);
CREATE INDEX idx_offline_data_snapshots_type ON offline_data_snapshots(snapshot_type);
CREATE INDEX idx_offline_data_snapshots_status ON offline_data_snapshots(status);
CREATE INDEX idx_offline_data_snapshots_created ON offline_data_snapshots(created_at);

-- ============================================
-- OFFLINE TRANSACTIONS QUEUE
-- ============================================

CREATE TABLE IF NOT EXISTS offline_transactions_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id VARCHAR(100) UNIQUE NOT NULL,
    device_id UUID NOT NULL REFERENCES pos_devices(id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_type VARCHAR(50) NOT NULL, -- SALE, RETURN, ADJUSTMENT, PAYMENT
    transaction_data JSONB NOT NULL,
    
    -- Processing
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, UPLOADING, UPLOADED, FAILED, REJECTED
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Synchronization
    created_at_device TIMESTAMP WITH TIME ZONE,
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    uploaded_at TIMESTAMP WITH TIME ZONE,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    
    -- Audit
    metadata JSONB
);

CREATE INDEX idx_offline_transactions_queue_device ON offline_transactions_queue(device_id);
CREATE INDEX idx_offline_transactions_queue_status ON offline_transactions_queue(status);
CREATE INDEX idx_offline_transactions_queue_queued ON offline_transactions_queue(queued_at);
CREATE INDEX idx_offline_transactions_queue_retry ON offline_transactions_queue(queued_at) WHERE status = 'FAILED' AND retry_count < max_retries;

-- ============================================
-- UNIFIED LOYALTY TRANSACTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS unified_loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Channel
    channel VARCHAR(50) NOT NULL, -- POS, WEB, MOBILE, API
    channel_reference_id VARCHAR(100),
    device_id UUID REFERENCES pos_devices(id) ON DELETE SET NULL,
    
    -- Customer
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    loyalty_account_id UUID REFERENCES customer_loyalty_accounts(id) ON DELETE SET NULL,
    
    -- Transaction details
    transaction_type VARCHAR(50) NOT NULL, -- EARN, REDEEM, EXPIRE, ADJUST, REFUND
    points INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    
    -- Reference
    reference_type VARCHAR(50), -- ORDER, REFUND, MANUAL, PROMOTION
    reference_id VARCHAR(255),
    
    -- Amount
    amount DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'NPR',
    
    -- Details
    description TEXT,
    
    -- Timestamps
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_unified_loyalty_transactions_customer ON unified_loyalty_transactions(customer_id);
CREATE INDEX idx_unified_loyalty_transactions_account ON unified_loyalty_transactions(loyalty_account_id);
CREATE INDEX idx_unified_loyalty_transactions_channel ON unified_loyalty_transactions(channel);
CREATE INDEX idx_unified_loyalty_transactions_type ON unified_loyalty_transactions(transaction_type);
CREATE INDEX idx_unified_loyalty_transactions_reference ON unified_loyalty_transactions(reference_type, reference_id);
CREATE INDEX idx_unified_loyalty_transactions_occurred ON unified_loyalty_transactions(occurred_at);

-- ============================================
-- LOYALTY CHANNEL MAPPINGS
-- ============================================

CREATE TABLE IF NOT EXISTS loyalty_channel_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Channel identifiers
    channel VARCHAR(50) NOT NULL, -- POS, WEB, MOBILE
    channel_customer_id VARCHAR(255),
    
    -- Loyalty account
    loyalty_account_id UUID REFERENCES customer_loyalty_accounts(id) ON DELETE SET NULL,
    
    -- Status
    is_primary BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT TRUE,
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit
    metadata JSONB,
    
    UNIQUE(customer_id, channel, channel_customer_id)
);

CREATE INDEX idx_loyalty_channel_mappings_customer ON loyalty_channel_mappings(customer_id);
CREATE INDEX idx_loyalty_channel_mappings_channel ON loyalty_channel_mappings(channel);
CREATE INDEX idx_loyalty_channel_mappings_account ON loyalty_channel_mappings(loyalty_account_id);

-- ============================================
-- POS SESSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS pos_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(100) UNIQUE NOT NULL,
    device_id UUID NOT NULL REFERENCES pos_devices(id) ON DELETE CASCADE,
    staff_id VARCHAR(100),
    
    -- Session details
    session_type VARCHAR(50) DEFAULT 'REGISTER', -- REGISTER, SHIFT, TRAINING
    opening_amount DECIMAL(12, 2) DEFAULT 0,
    closing_amount DECIMAL(12, 2),
    
    -- Status
    status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, CLOSED, VOIDED
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- Transaction counts
    transaction_count INTEGER DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    
    -- Notes
    opening_notes TEXT,
    closing_notes TEXT,
    
    -- Audit
    opened_by VARCHAR(100),
    closed_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_pos_sessions_device ON pos_sessions(device_id);
CREATE INDEX idx_pos_sessions_staff ON pos_sessions(staff_id);
CREATE INDEX idx_pos_sessions_status ON pos_sessions(status);
CREATE INDEX idx_pos_sessions_opened ON pos_sessions(opened_at);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate device ID
CREATE OR REPLACE FUNCTION generate_device_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'DEV-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate peripheral ID
CREATE OR REPLACE FUNCTION generate_peripheral_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'PER-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate snapshot ID
CREATE OR REPLACE FUNCTION generate_snapshot_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'SNP-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate queue ID
CREATE OR REPLACE FUNCTION generate_queue_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'QUE-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate unified loyalty transaction ID
CREATE OR REPLACE FUNCTION generate_unified_loyalty_transaction_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'ULT-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate session ID
CREATE OR REPLACE FUNCTION generate_session_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'SES-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
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

-- Update device heartbeat on sync
CREATE TRIGGER update_pos_device_sync BEFORE UPDATE ON pos_devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
