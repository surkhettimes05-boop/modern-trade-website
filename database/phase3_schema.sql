-- Phase 3 Database Schema: Management Dashboards & Analytics
-- This schema adds tables for inventory, finance, operations, and system monitoring

-- ============================================
-- BUSINESS DATE FUNCTION
-- ============================================

-- Function to convert UTC timestamp to Nepal business date
-- Nepal business day starts at 6:00 AM UTC (11:45 AM Nepal Time)
CREATE OR REPLACE FUNCTION utc_to_nepal_business_date(utc_timestamp TIMESTAMP WITH TIME ZONE)
RETURNS DATE AS $$
BEGIN
    -- Subtract 5 hours 45 minutes to convert UTC to Nepal Time
    -- Then adjust for business day start at 11:45 AM (6:00 AM UTC)
    RETURN (utc_timestamp - INTERVAL '5 hours 45 minutes')::DATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- INVENTORY TRANSACTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type VARCHAR(20) NOT NULL, -- RECEIPT, ISSUE, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT, STOCKOUT
    store_id UUID NOT NULL REFERENCES stores(id),
    product_id UUID NOT NULL REFERENCES products(id),
    batch_id VARCHAR(100),
    quantity DECIMAL(10, 2) NOT NULL,
    unit_cost DECIMAL(12, 2),
    total_cost DECIMAL(12, 2),
    reference_id UUID, -- Link to PO, transfer, adjustment, etc.
    reference_type VARCHAR(50),
    reason TEXT,
    performed_by VARCHAR(100),
    transaction_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    business_date DATE GENERATED ALWAYS AS (utc_to_nepal_business_date(transaction_timestamp)) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_inventory_transactions_store ON inventory_transactions(store_id);
CREATE INDEX idx_inventory_transactions_product ON inventory_transactions(product_id);
CREATE INDEX idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX idx_inventory_transactions_date ON inventory_transactions(business_date);
CREATE INDEX idx_inventory_transactions_ref ON inventory_transactions(reference_type, reference_id);

-- ============================================
-- INVENTORY TRANSFERS
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_number VARCHAR(50) UNIQUE NOT NULL,
    from_store_id UUID NOT NULL REFERENCES stores(id),
    to_store_id UUID NOT NULL REFERENCES stores(id),
    transfer_status VARCHAR(20) DEFAULT 'REQUESTED', -- REQUESTED, APPROVED, IN_TRANSIT, RECEIVED, CANCELLED
    transfer_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    business_date DATE GENERATED ALWAYS AS (utc_to_nepal_business_date(transfer_timestamp)) STORED,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    received_by VARCHAR(100),
    received_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_inventory_transfers_from ON inventory_transfers(from_store_id);
CREATE INDEX idx_inventory_transfers_to ON inventory_transfers(to_store_id);
CREATE INDEX idx_inventory_transfers_status ON inventory_transfers(transfer_status);
CREATE INDEX idx_inventory_transfers_date ON inventory_transfers(business_date);

-- ============================================
-- INVENTORY TRANSFER ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES inventory_transfers(id),
    product_id UUID NOT NULL REFERENCES products(id),
    batch_id VARCHAR(100),
    quantity DECIMAL(10, 2) NOT NULL,
    unit_cost DECIMAL(12, 2),
    total_cost DECIMAL(12, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_inventory_transfer_items_transfer ON inventory_transfer_items(transfer_id);
CREATE INDEX idx_inventory_transfer_items_product ON inventory_transfer_items(product_id);

-- ============================================
-- BATCH INVENTORY
-- ============================================

CREATE TABLE IF NOT EXISTS batch_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    product_id UUID NOT NULL REFERENCES products(id),
    batch_id VARCHAR(100) NOT NULL,
    batch_number VARCHAR(100),
    expiry_date DATE,
    quantity DECIMAL(10, 2) NOT NULL,
    unit_cost DECIMAL(12, 2),
    total_cost DECIMAL(12, 2),
    received_date DATE,
    supplier VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(store_id, product_id, batch_id)
);

CREATE INDEX idx_batch_inventory_store ON batch_inventory(store_id);
CREATE INDEX idx_batch_inventory_product ON batch_inventory(product_id);
CREATE INDEX idx_batch_inventory_expiry ON batch_inventory(expiry_date);
CREATE INDEX idx_batch_inventory_batch ON batch_inventory(batch_id);

-- ============================================
-- INVENTORY QUALITY EXCEPTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_quality_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    product_id UUID REFERENCES products(id),
    exception_type VARCHAR(50) NOT NULL, -- NEGATIVE_QUANTITY, MISSING_COST, EXPIRED_IN_STOCK, DUPLICATE_RECORD
    severity VARCHAR(20) DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, CRITICAL
    description TEXT,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    detected_by VARCHAR(100) DEFAULT 'SYSTEM',
    status VARCHAR(20) DEFAULT 'OPEN', -- OPEN, INVESTIGATING, RESOLVED, IGNORED
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(100),
    resolution_notes TEXT
);

CREATE INDEX idx_inventory_quality_exceptions_store ON inventory_quality_exceptions(store_id);
CREATE INDEX idx_inventory_quality_exceptions_type ON inventory_quality_exceptions(exception_type);
CREATE INDEX idx_inventory_quality_exceptions_status ON inventory_quality_exceptions(status);
CREATE INDEX idx_inventory_quality_exceptions_detected ON inventory_quality_exceptions(detected_at);

-- ============================================
-- TENDERS (Payment Breakdown)
-- ============================================

CREATE TABLE IF NOT EXISTS tenders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id),
    tender_type VARCHAR(50) NOT NULL, -- CASH, CARD, UPI, WALLET, VOUCHER
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NPR',
    card_last_4 VARCHAR(4),
    reference_number VARCHAR(100),
    tender_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    business_date DATE GENERATED ALWAYS AS (utc_to_nepal_business_date(tender_timestamp)) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tenders_sale ON tenders(sale_id);
CREATE INDEX idx_tenders_type ON tenders(tender_type);
CREATE INDEX idx_tenders_date ON tenders(business_date);

-- ============================================
-- SHIFTS
-- ============================================

CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    shift_number VARCHAR(50) UNIQUE NOT NULL,
    shift_date DATE NOT NULL,
    staff_id VARCHAR(100),
    shift_type VARCHAR(20) DEFAULT 'REGULAR', -- REGULAR, HOLIDAY, SPECIAL
    opening_amount DECIMAL(12, 2),
    closing_amount DECIMAL(12, 2),
    expected_close_time TIMESTAMP WITH TIME ZONE,
    actual_close_time TIMESTAMP WITH TIME ZONE,
    shift_status VARCHAR(20) DEFAULT 'OPEN', -- OPEN, CLOSED, VOIDED
    opened_by VARCHAR(100),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_by VARCHAR(100),
    closed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_shifts_store ON shifts(store_id);
CREATE INDEX idx_shifts_date ON shifts(shift_date);
CREATE INDEX idx_shifts_status ON shifts(shift_status);

-- ============================================
-- RECONCILIATION EXCEPTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exception_type VARCHAR(50) NOT NULL, -- TENDER_MISMATCH, MISSING_PAYMENT, DUPLICATE_PAYMENT, SHORTAGE, OVERAGE
    store_id UUID NOT NULL REFERENCES stores(id),
    shift_id UUID REFERENCES shifts(id),
    sale_id UUID REFERENCES sales(id),
    tender_id UUID REFERENCES tenders(id),
    expected_amount DECIMAL(12, 2),
    actual_amount DECIMAL(12, 2),
    difference_amount DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'NPR',
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    detected_by VARCHAR(100) DEFAULT 'SYSTEM',
    status VARCHAR(20) DEFAULT 'OPEN', -- OPEN, INVESTIGATING, RESOLVED, WRITTEN_OFF
    assigned_to VARCHAR(100),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(100),
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reconciliation_exceptions_store ON reconciliation_exceptions(store_id);
CREATE INDEX idx_reconciliation_exceptions_type ON reconciliation_exceptions(exception_type);
CREATE INDEX idx_reconciliation_exceptions_status ON reconciliation_exceptions(status);
CREATE INDEX idx_reconciliation_exceptions_detected ON reconciliation_exceptions(detected_at);

-- ============================================
-- PAYMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_number VARCHAR(50) UNIQUE NOT NULL,
    payment_type VARCHAR(50) NOT NULL, -- RECEIPT, REFUND, ADJUSTMENT
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NPR',
    tender_type VARCHAR(50),
    reference_number VARCHAR(100),
    matched_to_sale UUID REFERENCES sales(id),
    matched_to_return UUID REFERENCES returns(id),
    matched_at TIMESTAMP WITH TIME ZONE,
    payment_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    business_date DATE GENERATED ALWAYS AS (utc_to_nepal_business_date(payment_timestamp)) STORED,
    status VARCHAR(20) DEFAULT 'UNMATCHED', -- UNMATCHED, MATCHED, PARTIALLY_MATCHED
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_number ON payments(payment_number);
CREATE INDEX idx_payments_type ON payments(payment_type);
CREATE INDEX idx_payments_matched_sale ON payments(matched_to_sale);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_date ON payments(business_date);

-- ============================================
-- WEB ANALYTICS
-- ============================================

CREATE TABLE IF NOT EXISTS web_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255),
    user_id UUID REFERENCES customers(id),
    event_type VARCHAR(50) NOT NULL, -- PAGE_VIEW, PRODUCT_VIEW, SEARCH, OFFER_CLICK, ENROLLMENT_START, ENROLLMENT_COMPLETE
    page_type VARCHAR(50), -- STORE, PRODUCT, OFFER, ACCOUNT, CHECKOUT
    page_url TEXT,
    product_id UUID REFERENCES products(id),
    offer_id UUID REFERENCES offers(id),
    search_query TEXT,
    referrer TEXT,
    user_agent TEXT,
    ip_address VARCHAR(45),
    event_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    business_date DATE GENERATED ALWAYS AS (utc_to_nepal_business_date(event_timestamp)) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_web_analytics_session ON web_analytics(session_id);
CREATE INDEX idx_web_analytics_user ON web_analytics(user_id);
CREATE INDEX idx_web_analytics_type ON web_analytics(event_type);
CREATE INDEX idx_web_analytics_date ON web_analytics(business_date);
CREATE INDEX idx_web_analytics_product ON web_analytics(product_id);

-- ============================================
-- DATA FRESHNESS TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS data_freshness_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projection_name VARCHAR(100) NOT NULL UNIQUE,
    table_name VARCHAR(100) NOT NULL,
    last_updated_at TIMESTAMP WITH TIME ZONE,
    last_updated_by VARCHAR(100),
    update_status VARCHAR(20) DEFAULT 'SUCCESS', -- SUCCESS, FAILED, IN_PROGRESS
    update_duration_ms INTEGER,
    row_count BIGINT,
    error_message TEXT,
    expected_refresh_interval_minutes INTEGER,
    is_stale BOOLEAN DEFAULT FALSE,
    stale_threshold_minutes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_data_freshness_projection ON data_freshness_tracking(projection_name);
CREATE INDEX idx_data_freshness_status ON data_freshness_tracking(update_status);

-- ============================================
-- STORE SYNC STATUS
-- ============================================

CREATE TABLE IF NOT EXISTS store_sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    sync_type VARCHAR(50) NOT NULL, -- FULL, INCREMENTAL, OFFLINE_QUEUE
    last_successful_sync TIMESTAMP WITH TIME ZONE,
    last_failed_sync TIMESTAMP WITH TIME ZONE,
    last_sync_status VARCHAR(20) DEFAULT 'UNKNOWN', -- SUCCESS, FAILED, IN_PROGRESS, OFFLINE
    last_sync_duration_ms INTEGER,
    records_synced INTEGER,
    error_message TEXT,
    is_online BOOLEAN DEFAULT TRUE,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(store_id, sync_type)
);

CREATE INDEX idx_store_sync_status_store ON store_sync_status(store_id);
CREATE INDEX idx_store_sync_status_type ON store_sync_status(sync_type);
CREATE INDEX idx_store_sync_status_heartbeat ON store_sync_status(last_heartbeat);

-- ============================================
-- EVENT QUEUE
-- ============================================

CREATE TABLE IF NOT EXISTS event_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    source_system VARCHAR(50),
    priority INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PROCESSING, PROCESSED, FAILED, RETRY
    processing_attempts INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_event_queue_type ON event_queue(event_type);
CREATE INDEX idx_event_queue_status ON event_queue(status);
CREATE INDEX idx_event_queue_priority ON event_queue(priority);
CREATE INDEX idx_event_queue_retry ON event_queue(next_retry_at) WHERE status = 'RETRY';

-- ============================================
-- API ERROR LOG
-- ============================================

CREATE TABLE IF NOT EXISTS api_error_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    error_message TEXT,
    request_body TEXT,
    user_id VARCHAR(100),
    ip_address VARCHAR(45),
    user_agent TEXT,
    error_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    business_date DATE GENERATED ALWAYS AS (utc_to_nepal_business_date(error_timestamp)) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_api_error_log_endpoint ON api_error_log(endpoint);
CREATE INDEX idx_api_error_log_status ON api_error_log(status_code);
CREATE INDEX idx_api_error_log_date ON api_error_log(business_date);
CREATE INDEX idx_api_error_log_timestamp ON api_error_log(error_timestamp);

-- ============================================
-- SYSTEM MONITORING
-- ============================================

CREATE TABLE IF NOT EXISTS system_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_name VARCHAR(100) NOT NULL UNIQUE,
    check_type VARCHAR(50) NOT NULL, -- DATABASE, API, QUEUE, SYNC, CONNECTIVITY
    status VARCHAR(20) DEFAULT 'UNKNOWN', -- HEALTHY, WARNING, CRITICAL, UNKNOWN
    last_check_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    check_interval_minutes INTEGER DEFAULT 5,
    threshold_config JSONB,
    current_value JSONB,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_system_monitoring_name ON system_monitoring(check_name);
CREATE INDEX idx_system_monitoring_type ON system_monitoring(check_type);
CREATE INDEX idx_system_monitoring_status ON system_monitoring(status);

-- ============================================
-- ALERTS
-- ============================================

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
    entity_type VARCHAR(50),
    entity_id UUID,
    store_id UUID REFERENCES stores(id),
    threshold_config JSONB,
    current_value JSONB,
    message TEXT NOT NULL,
    first_detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'OPEN', -- OPEN, ACKNOWLEDGED, RESOLVED, IGNORED
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    assigned_to VARCHAR(100),
    assigned_at TIMESTAMP WITH TIME ZONE,
    assigned_by VARCHAR(100),
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(100),
    escalation_level INTEGER DEFAULT 0,
    escalated_at TIMESTAMP WITH TIME ZONE,
    escalated_to VARCHAR(100),
    escalated_by VARCHAR(100),
    link_to_records TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_store ON alerts(store_id);
CREATE INDEX idx_alerts_entity ON alerts(entity_type, entity_id);
CREATE INDEX idx_alerts_detected ON alerts(first_detected_at);
CREATE INDEX idx_alerts_assigned ON alerts(assigned_to);

-- ============================================
-- METRIC GOVERNANCE
-- ============================================

CREATE TABLE IF NOT EXISTS metric_governance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_id VARCHAR(50) UNIQUE NOT NULL,
    metric_name VARCHAR(255) NOT NULL,
    business_definition TEXT NOT NULL,
    formula TEXT NOT NULL,
    source_tables TEXT[] NOT NULL,
    included_statuses TEXT[],
    exclusions TEXT[],
    timezone VARCHAR(50) DEFAULT 'UTC',
    business_date_behavior VARCHAR(100),
    refresh_frequency VARCHAR(50),
    metric_owner VARCHAR(100) NOT NULL,
    data_quality_requirements TEXT,
    drill_down_destination VARCHAR(255),
    version VARCHAR(20) DEFAULT '1.0',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(100)
);

CREATE INDEX idx_metric_governance_id ON metric_governance(metric_id);
CREATE INDEX idx_metric_governance_active ON metric_governance(is_active);

-- ============================================
-- ANALYTICS PROJECTIONS (Materialized Views)
-- ============================================

-- Daily Sales by Store
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_sales_by_store AS
SELECT 
    store_id,
    utc_to_nepal_business_date(sale_timestamp) AS business_date,
    COUNT(*) AS transaction_count,
    SUM(total_amount) AS gross_sales,
    SUM(total_amount - discount_amount) AS net_sales,
    SUM(discount_amount) AS total_discounts,
    AVG(total_amount) AS avg_basket_value,
    SUM(points_earned) AS total_points_earned,
    SUM(points_redeemed) AS total_points_redeemed,
    COUNT(DISTINCT customer_id) AS customer_count,
    COUNT(CASE WHEN customer_id IS NOT NULL THEN 1 END) AS identified_sales,
    MIN(sale_timestamp) AS first_sale_time,
    MAX(sale_timestamp) AS last_sale_time
FROM sales
WHERE sale_status = 'COMPLETED'
GROUP BY store_id, utc_to_nepal_business_date(sale_timestamp);

CREATE UNIQUE INDEX idx_mv_daily_sales_store_date ON mv_daily_sales_by_store(store_id, business_date);
CREATE INDEX idx_mv_daily_sales_date ON mv_daily_sales_by_store(business_date);

-- Daily Customer Metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_customer_metrics AS
SELECT 
    utc_to_nepal_business_date(enrolled_at) AS business_date,
    COUNT(*) AS new_members,
    COUNT(CASE WHEN verification_status = 'VERIFIED' THEN 1 END) AS verified_members,
    COUNT(CASE WHEN home_store_id IS NOT NULL THEN 1 END) AS members_with_home_store
FROM customers
WHERE status = 'ACTIVE'
GROUP BY utc_to_nepal_business_date(enrolled_at);

CREATE UNIQUE INDEX idx_mv_daily_customer_date ON mv_daily_customer_metrics(business_date);

-- Daily Loyalty Metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_loyalty_metrics AS
SELECT 
    utc_to_nepal_business_date(effective_timestamp) AS business_date,
    SUM(CASE WHEN entry_type = 'EARN' THEN points_signed ELSE 0 END) AS total_earned,
    SUM(CASE WHEN entry_type = 'REDEEM' THEN points_signed ELSE 0 END) AS total_redeemed,
    SUM(CASE WHEN entry_type = 'EXPIRE' THEN points_signed ELSE 0 END) AS total_expired,
    SUM(CASE WHEN entry_type = 'ADJUST' THEN points_signed ELSE 0 END) AS total_adjusted,
    COUNT(CASE WHEN entry_type = 'EARN' THEN 1 END) AS earn_transactions,
    COUNT(CASE WHEN entry_type = 'REDEEM' THEN 1 END) AS redeem_transactions,
    COUNT(DISTINCT customer_id) AS active_customers
FROM loyalty_ledger
WHERE entry_status = 'POSTED'
GROUP BY utc_to_nepal_business_date(effective_timestamp);

CREATE UNIQUE INDEX idx_mv_daily_loyalty_date ON mv_daily_loyalty_metrics(business_date);

-- Daily Returns by Store
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_returns_by_store AS
SELECT 
    store_id,
    utc_to_nepal_business_date(return_timestamp) AS business_date,
    COUNT(*) AS return_count,
    SUM(total_amount) AS total_return_amount,
    SUM(points_reversed) AS total_points_reversed,
    SUM(redemption_reversed) AS total_redemption_reversed
FROM returns
WHERE return_status = 'PROCESSED'
GROUP BY store_id, utc_to_nepal_business_date(return_timestamp);

CREATE UNIQUE INDEX idx_mv_daily_returns_store_date ON mv_daily_returns_by_store(store_id, business_date);

-- Daily Void Sales by Store
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_voids_by_store AS
SELECT 
    store_id,
    utc_to_nepal_business_date(voided_at) AS business_date,
    COUNT(*) AS void_count,
    SUM(total_amount) AS total_void_amount,
    SUM(points_earned) AS total_points_earned_voided,
    SUM(points_redeemed) AS total_points_redeemed_voided
FROM sales
WHERE sale_status = 'VOIDED'
GROUP BY store_id, utc_to_nepal_business_date(voided_at);

CREATE UNIQUE INDEX idx_mv_daily_voids_store_date ON mv_daily_voids_by_store(store_id, business_date);

-- Daily Offline Queue Status
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_offline_queue AS
SELECT 
    store_id,
    device_id,
    utc_to_nepal_business_date(created_at) AS business_date,
    COUNT(*) FILTER (WHERE queue_status = 'PENDING') AS pending_count,
    COUNT(*) FILTER (WHERE queue_status = 'UPLOADED') AS uploaded_count,
    COUNT(*) FILTER (WHERE queue_status = 'FAILED') AS failed_count,
    COUNT(*) FILTER (WHERE queue_status = 'REJECTED') AS rejected_count,
    SUM(points_calculated) FILTER (WHERE queue_status = 'PENDING') AS pending_points,
    MIN(created_at) FILTER (WHERE queue_status = 'PENDING') AS oldest_pending_at
FROM offline_earn_queue
GROUP BY store_id, device_id, utc_to_nepal_business_date(created_at);

CREATE INDEX idx_mv_daily_offline_queue_date ON mv_daily_offline_queue(business_date);

-- ============================================
-- FUNCTIONS TO REFRESH MATERIALIZED VIEWS
-- ============================================

CREATE OR REPLACE FUNCTION refresh_analytics_projections()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_sales_by_store;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_customer_metrics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_loyalty_metrics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_returns_by_store;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_voids_by_store;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_offline_queue;
    
    -- Update freshness tracking
    UPDATE data_freshness_tracking 
    SET last_updated_at = NOW(),
        update_status = 'SUCCESS',
        row_count = (
            SELECT COUNT(*) FROM mv_daily_sales_by_store
        )
    WHERE projection_name = 'daily_sales_by_store';
    
    UPDATE data_freshness_tracking 
    SET last_updated_at = NOW(),
        update_status = 'SUCCESS'
    WHERE projection_name IN ('daily_customer_metrics', 'daily_loyalty_metrics', 'daily_returns_by_store', 'daily_voids_by_store', 'daily_offline_queue');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER FOR updated_at
-- ============================================

CREATE TRIGGER update_data_freshness_tracking_updated_at BEFORE UPDATE ON data_freshness_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_monitoring_updated_at BEFORE UPDATE ON system_monitoring
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_metric_governance_updated_at BEFORE UPDATE ON metric_governance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INITIAL DATA FOR DATA FRESHNESS TRACKING
-- ============================================

INSERT INTO data_freshness_tracking (projection_name, table_name, expected_refresh_interval_minutes, stale_threshold_minutes) VALUES
('daily_sales_by_store', 'mv_daily_sales_by_store', 60, 120),
('daily_customer_metrics', 'mv_daily_customer_metrics', 60, 120),
('daily_loyalty_metrics', 'mv_daily_loyalty_metrics', 60, 120),
('daily_returns_by_store', 'mv_daily_returns_by_store', 60, 120),
('daily_voids_by_store', 'mv_daily_voids_by_store', 60, 120),
('daily_offline_queue', 'mv_daily_offline_queue', 15, 30)
ON CONFLICT (projection_name) DO NOTHING;
