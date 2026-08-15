-- Phase 4 Database Schema: Offline Synchronization Enhancement
-- This schema extends the offline queue to support all transaction types with full sync capabilities

-- ============================================
-- DEVICE IDENTITY MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(100) UNIQUE NOT NULL,
    device_name VARCHAR(255),
    device_type VARCHAR(50) NOT NULL, -- POS, HANDHELD, TABLET, KIOSK
    store_id UUID NOT NULL REFERENCES stores(id),
    serial_number VARCHAR(100),
    mac_address VARCHAR(50),
    os_version VARCHAR(100),
    app_version VARCHAR(50),
    registration_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_sync TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, DECOMMISSIONED
    configuration JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_devices_device_id ON devices(device_id);
CREATE INDEX idx_devices_store ON devices(store_id);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);

-- ============================================
-- REFERENCE DATA VERSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS reference_data_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_type VARCHAR(50) NOT NULL, -- PRODUCTS, CUSTOMERS, RULES, PRICES, PROMOTIONS
    version_number VARCHAR(50) NOT NULL,
    effective_date TIMESTAMP WITH TIME ZONE NOT NULL,
    checksum VARCHAR(100) NOT NULL,
    data_snapshot JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(data_type, version_number)
);

CREATE INDEX idx_reference_data_type ON reference_data_versions(data_type);
CREATE INDEX idx_reference_data_version ON reference_data_versions(data_type, version_number);
CREATE INDEX idx_reference_data_effective ON reference_data_versions(effective_date);

-- ============================================
-- OFFLINE TRANSACTION QUEUE (Extended)
-- ============================================

CREATE TABLE IF NOT EXISTS offline_transaction_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Global unique identifier
    transaction_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
    
    -- Device identity
    device_id VARCHAR(100) NOT NULL REFERENCES devices(device_id),
    store_id UUID NOT NULL REFERENCES stores(id),
    
    -- Transaction type
    transaction_type VARCHAR(50) NOT NULL, -- SALE, RETURN, PAYMENT, ADJUSTMENT, CUSTOMER
    
    -- Local ordering
    local_sequence_number BIGINT NOT NULL,
    
    -- Timestamps
    original_occurrence_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    device_clock_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Reference data versions at time of transaction
    reference_data_versions JSONB,
    
    -- Transaction data (encrypted at rest)
    transaction_data JSONB NOT NULL,
    
    -- Checksum for integrity
    checksum VARCHAR(100) NOT NULL,
    
    -- Synchronization status
    sync_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, UPLOADING, UPLOADED, ACKNOWLEDGED, REJECTED, CONFLICT
    sync_attempts INTEGER DEFAULT 0,
    max_sync_attempts INTEGER DEFAULT 10,
    last_sync_attempt TIMESTAMP WITH TIME ZONE,
    sync_error_message TEXT,
    
    -- Server acknowledgement
    server_transaction_id UUID,
    server_acknowledged_at TIMESTAMP WITH TIME ZONE,
    
    -- Conflict resolution
    conflict_detected BOOLEAN DEFAULT FALSE,
    conflict_type VARCHAR(50), -- DUPLICATE_UUID, SEQUENCE_GAP, DATA_MISMATCH, CLOCK_DRIFT
    conflict_resolution VARCHAR(50), -- IGNORE, OVERRIDE, MERGE, MANUAL
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    
    -- Encryption metadata
    encryption_version VARCHAR(20) DEFAULT 'v1',
    signature VARCHAR(255),
    
    created_by VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(device_id, local_sequence_number),
    UNIQUE(transaction_uuid)
);

CREATE INDEX idx_offline_transaction_device ON offline_transaction_queue(device_id);
CREATE INDEX idx_offline_transaction_store ON offline_transaction_queue(store_id);
CREATE INDEX idx_offline_transaction_type ON offline_transaction_queue(transaction_type);
CREATE INDEX idx_offline_transaction_status ON offline_transaction_queue(sync_status);
CREATE INDEX idx_offline_transaction_uuid ON offline_transaction_queue(transaction_uuid);
CREATE INDEX idx_offline_transaction_timestamp ON offline_transaction_queue(original_occurrence_timestamp);
CREATE INDEX idx_offline_transaction_conflict ON offline_transaction_queue(conflict_detected);
CREATE INDEX idx_offline_transaction_server_id ON offline_transaction_queue(server_transaction_id);

-- ============================================
-- SYNC BATCH LOG
-- ============================================

CREATE TABLE IF NOT EXISTS sync_batch_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
    device_id VARCHAR(100) NOT NULL REFERENCES devices(device_id),
    store_id UUID NOT NULL REFERENCES stores(id),
    
    -- Batch metadata
    transaction_count INTEGER NOT NULL,
    first_sequence_number BIGINT NOT NULL,
    last_sequence_number BIGINT NOT NULL,
    batch_checksum VARCHAR(100) NOT NULL,
    
    -- Upload tracking
    upload_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    upload_completed_at TIMESTAMP WITH TIME ZONE,
    upload_status VARCHAR(20) DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED, FAILED, PARTIAL
    
    -- Server acknowledgement
    server_acknowledged_at TIMESTAMP WITH TIME ZONE,
    server_batch_id UUID,
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sync_batch_batch_id ON sync_batch_log(batch_id);
CREATE INDEX idx_sync_batch_device ON sync_batch_log(device_id);
CREATE INDEX idx_sync_batch_status ON sync_batch_log(upload_status);
CREATE INDEX idx_sync_batch_timestamp ON sync_batch_log(upload_started_at);

-- ============================================
-- CLOCK DRIFT MONITORING
-- ============================================

CREATE TABLE IF NOT EXISTS clock_drift_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(100) NOT NULL REFERENCES devices(device_id),
    device_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    server_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    drift_seconds INTEGER NOT NULL,
    drift_threshold_seconds INTEGER DEFAULT 300, -- 5 minutes
    is_excessive BOOLEAN GENERATED ALWAYS AS (ABS(drift_seconds) > drift_threshold_seconds) STORED,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    corrective_action VARCHAR(50), -- IGNORE, WARN, CORRECT, DISABLE
    corrected_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

CREATE INDEX idx_clock_drift_device ON clock_drift_log(device_id);
CREATE INDEX idx_clock_drift_detected ON clock_drift_log(detected_at);
CREATE INDEX idx_clock_drift_excessive ON clock_drift_log(is_excessive);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to calculate checksum for transaction data
CREATE OR REPLACE FUNCTION calculate_transaction_checksum(
    transaction_uuid UUID,
    device_id VARCHAR,
    local_sequence BIGINT,
    transaction_data JSONB
) RETURNS VARCHAR AS $$
BEGIN
    RETURN encode(digest(transaction_uuid::text || device_id || local_sequence::text || transaction_data::text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to detect sequence gaps
CREATE OR REPLACE FUNCTION detect_sequence_gaps(device_id_param VARCHAR)
RETURNS TABLE(gap_start BIGINT, gap_end BIGINT) AS $$
BEGIN
    RETURN QUERY
    WITH numbered AS (
        SELECT local_sequence_number,
               LAG(local_sequence_number) OVER (ORDER BY local_sequence_number) as prev_seq
        FROM offline_transaction_queue
        WHERE device_id = device_id_param
          AND sync_status IN ('PENDING', 'UPLOADING', 'UPLOADED')
    )
    SELECT prev_seq + 1 as gap_start, local_sequence_number - 1 as gap_end
    FROM numbered
    WHERE local_sequence_number - prev_seq > 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get device sync status
CREATE OR REPLACE FUNCTION get_device_sync_status(device_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
    status JSONB;
BEGIN
    SELECT jsonb_build_object(
        'device_id', device_id_param,
        'pending_count', COUNT(*) FILTER (WHERE sync_status = 'PENDING'),
        'uploading_count', COUNT(*) FILTER (WHERE sync_status = 'UPLOADING'),
        'uploaded_count', COUNT(*) FILTER (WHERE sync_status = 'UPLOADED'),
        'acknowledged_count', COUNT(*) FILTER (WHERE sync_status = 'ACKNOWLEDGED'),
        'rejected_count', COUNT(*) FILTER (WHERE sync_status = 'REJECTED'),
        'conflict_count', COUNT(*) FILTER (WHERE conflict_detected = TRUE),
        'oldest_pending', MIN(original_occurrence_timestamp) FILTER (WHERE sync_status = 'PENDING'),
        'newest_pending', MAX(original_occurrence_timestamp) FILTER (WHERE sync_status = 'PENDING'),
        'last_sync', MAX(server_acknowledged_at),
        'last_seen', (SELECT last_seen FROM devices WHERE device_id = device_id_param)
    ) INTO status
    FROM offline_transaction_queue
    WHERE device_id = device_id_param;
    
    RETURN status;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to update updated_at
CREATE TRIGGER update_offline_transaction_queue_updated_at BEFORE UPDATE ON offline_transaction_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION: Migrate existing offline_earn_queue to new structure
-- ============================================

-- This migration script should be run after creating the new tables
-- It migrates existing offline earn queue entries to the new transaction queue

-- Note: This is a placeholder for the actual migration script
-- The actual migration will need to:
-- 1. Create device records for existing device_ids
-- 2. Migrate offline_earn_queue entries to offline_transaction_queue
-- 3. Update reference data versions
-- 4. Verify data integrity
