-- ============================================
-- EXPANSION PHASE 3: LOYALTY, PROMOTIONS, AND ANALYTICS
-- ============================================

-- ============================================
-- LOYALTY POINTS AND REWARDS
-- ============================================

-- Loyalty programs table
CREATE TABLE IF NOT EXISTS loyalty_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id VARCHAR(100) UNIQUE NOT NULL,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    
    -- Program details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    points_per_currency DECIMAL(10, 4) DEFAULT 1.0, -- Points earned per currency unit
    currency_value_per_point DECIMAL(10, 4) DEFAULT 0.01, -- Currency value per point
    
    -- Program settings
    is_active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    
    -- Tiers
    enable_tiers BOOLEAN DEFAULT FALSE,
    tier_config JSONB,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_loyalty_programs_store ON loyalty_programs(store_id);
CREATE INDEX idx_loyalty_programs_active ON loyalty_programs(is_active);

-- Customer loyalty accounts
CREATE TABLE IF NOT EXISTS customer_loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id VARCHAR(100) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    program_id UUID REFERENCES loyalty_programs(id) ON DELETE CASCADE,
    
    -- Points balance
    current_points INTEGER DEFAULT 0,
    earned_points INTEGER DEFAULT 0,
    redeemed_points INTEGER DEFAULT 0,
    expired_points INTEGER DEFAULT 0,
    
    -- Tier
    current_tier VARCHAR(50),
    tier_progress JSONB,
    
    -- Status
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, TERMINATED
    
    -- Timestamps
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB,
    
    UNIQUE(customer_id, program_id)
);

CREATE INDEX idx_customer_loyalty_accounts_customer ON customer_loyalty_accounts(customer_id);
CREATE INDEX idx_customer_loyalty_accounts_program ON customer_loyalty_accounts(program_id);
CREATE INDEX idx_customer_loyalty_accounts_status ON customer_loyalty_accounts(status);

-- Loyalty point transactions
CREATE TABLE IF NOT EXISTS loyalty_point_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    account_id UUID REFERENCES customer_loyalty_accounts(id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_type VARCHAR(50) NOT NULL, -- EARN, REDEEM, EXPIRE, ADJUST, REFUND
    points INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    
    -- Reference
    reference_type VARCHAR(50), -- ORDER, REFUND, MANUAL, PROMOTION
    reference_id VARCHAR(255),
    
    -- Details
    description TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_loyalty_point_transactions_account ON loyalty_point_transactions(account_id);
CREATE INDEX idx_loyalty_point_transactions_type ON loyalty_point_transactions(transaction_type);
CREATE INDEX idx_loyalty_point_transactions_reference ON loyalty_point_transactions(reference_type, reference_id);
CREATE INDEX idx_loyalty_point_transactions_created ON loyalty_point_transactions(created_at);

-- Loyalty rewards catalog
CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reward_id VARCHAR(100) UNIQUE NOT NULL,
    program_id UUID REFERENCES loyalty_programs(id) ON DELETE CASCADE,
    
    -- Reward details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    reward_type VARCHAR(50) NOT NULL, -- DISCOUNT, PRODUCT, VOUCHER, EXPERIENCE
    points_cost INTEGER NOT NULL,
    
    -- Reward value
    discount_percentage DECIMAL(5, 2),
    discount_amount DECIMAL(12, 2),
    product_id UUID,
    voucher_code VARCHAR(100),
    
    -- Availability
    is_active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    max_redemptions INTEGER,
    current_redemptions INTEGER DEFAULT 0,
    
    -- Tier restrictions
    tier_restrictions JSONB,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_loyalty_rewards_program ON loyalty_rewards(program_id);
CREATE INDEX idx_loyalty_rewards_active ON loyalty_rewards(is_active);

-- Customer reward redemptions
CREATE TABLE IF NOT EXISTS customer_reward_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    redemption_id VARCHAR(100) UNIQUE NOT NULL,
    account_id UUID REFERENCES customer_loyalty_accounts(id) ON DELETE CASCADE,
    reward_id UUID REFERENCES loyalty_rewards(id) ON DELETE CASCADE,
    
    -- Redemption details
    points_used INTEGER NOT NULL,
    
    -- Reference
    reference_type VARCHAR(50),
    reference_id VARCHAR(255),
    
    -- Status
    status VARCHAR(50) DEFAULT 'REDEEMED', -- REDEEMED, USED, EXPIRED, CANCELLED
    
    -- Timestamps
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE,
    expired_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_customer_reward_redemptions_account ON customer_reward_redemptions(account_id);
CREATE INDEX idx_customer_reward_redemptions_reward ON customer_reward_redemptions(reward_id);
CREATE INDEX idx_customer_reward_redemptions_status ON customer_reward_redemptions(status);

-- ============================================
-- PROMOTIONS AND DISCOUNTS
-- ============================================

-- Promotions table
CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id VARCHAR(100) UNIQUE NOT NULL,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    
    -- Promotion details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    promotion_type VARCHAR(50) NOT NULL, -- PERCENTAGE, FIXED_AMOUNT, BUY_X_GET_Y, FREE_SHIPPING
    discount_value DECIMAL(12, 2) NOT NULL,
    
    -- Conditions
    minimum_order_value DECIMAL(12, 2),
    maximum_discount_amount DECIMAL(12, 2),
    applicable_categories JSONB,
    applicable_products JSONB,
    customer_segments JSONB,
    
    -- Buy X Get Y specific
    buy_quantity INTEGER,
    get_quantity INTEGER,
    get_product_id UUID,
    
    -- Availability
    is_active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    usage_limit INTEGER,
    current_usage INTEGER DEFAULT 0,
    
    -- Stacking rules
    can_combine_with_other_promotions BOOLEAN DEFAULT FALSE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_promotions_store ON promotions(store_id);
CREATE INDEX idx_promotions_active ON promotions(is_active);
CREATE INDEX idx_promotions_dates ON promotions(start_date, end_date);

-- Coupon codes
CREATE TABLE IF NOT EXISTS coupon_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id VARCHAR(100) UNIQUE NOT NULL,
    promotion_id UUID REFERENCES promotions(id) ON DELETE CASCADE,
    
    -- Coupon details
    code VARCHAR(100) UNIQUE NOT NULL,
    
    -- Usage limits
    usage_limit INTEGER,
    current_usage INTEGER DEFAULT 0,
    usage_limit_per_customer INTEGER,
    
    -- Customer restrictions
    customer_restrictions JSONB,
    
    -- Availability
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_coupon_codes_promotion ON coupon_codes(promotion_id);
CREATE INDEX idx_coupon_codes_code ON coupon_codes(code);
CREATE INDEX idx_coupon_codes_active ON coupon_codes(is_active);

-- Coupon usages
CREATE TABLE IF NOT EXISTS coupon_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID REFERENCES coupon_codes(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    order_id UUID REFERENCES web_orders(id) ON DELETE SET NULL,
    
    -- Usage details
    discount_amount DECIMAL(12, 2),
    
    -- Timestamps
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit
    metadata JSONB
);

CREATE INDEX idx_coupon_usages_coupon ON coupon_usages(coupon_id);
CREATE INDEX idx_coupon_usages_customer ON coupon_usages(customer_id);
CREATE INDEX idx_coupon_usages_order ON coupon_usages(order_id);

-- ============================================
-- CUSTOMER SEGMENTATION
-- ============================================

-- Customer segments
CREATE TABLE IF NOT EXISTS customer_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id VARCHAR(100) UNIQUE NOT NULL,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    
    -- Segment details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Segment rules
    rules JSONB NOT NULL, -- RFM rules, behavior rules, demographic rules
    
    -- Segment stats
    customer_count INTEGER DEFAULT 0,
    last_calculated_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_customer_segments_store ON customer_segments(store_id);
CREATE INDEX idx_customer_segments_active ON customer_segments(is_active);

-- Customer segment memberships
CREATE TABLE IF NOT EXISTS customer_segment_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    segment_id UUID REFERENCES customer_segments(id) ON DELETE CASCADE,
    
    -- Membership details
    score DECIMAL(10, 4),
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit
    metadata JSONB,
    
    UNIQUE(customer_id, segment_id)
);

CREATE INDEX idx_customer_segment_memberships_customer ON customer_segment_memberships(customer_id);
CREATE INDEX idx_customer_segment_memberships_segment ON customer_segment_memberships(segment_id);

-- ============================================
-- ANALYTICS AND REPORTING
-- ============================================

-- Analytics events
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Event details
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(100),
    
    -- Context
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    order_id UUID REFERENCES web_orders(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    
    -- Event data
    event_data JSONB,
    
    -- Timestamps
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    metadata JSONB
);

CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_customer ON analytics_events(customer_id);
CREATE INDEX idx_analytics_events_store ON analytics_events(store_id);
CREATE INDEX idx_analytics_events_order ON analytics_events(order_id);
CREATE INDEX idx_analytics_events_occurred ON analytics_events(occurred_at);

-- Saved reports
CREATE TABLE IF NOT EXISTS saved_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Report details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    report_type VARCHAR(50) NOT NULL, -- SALES, INVENTORY, CUSTOMER, LOYALTY, DELIVERY
    
    -- Report configuration
    query_config JSONB NOT NULL,
    visualization_config JSONB,
    
    -- Schedule
    schedule_config JSONB,
    
    -- Access control
    created_by VARCHAR(100),
    shared_with JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_run_at TIMESTAMP WITH TIME ZONE,
    
    metadata JSONB
);

CREATE INDEX idx_saved_reports_type ON saved_reports(report_type);
CREATE INDEX idx_saved_reports_created_by ON saved_reports(created_by);

-- Report executions
CREATE TABLE IF NOT EXISTS report_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id VARCHAR(100) UNIQUE NOT NULL,
    report_id UUID REFERENCES saved_reports(id) ON DELETE CASCADE,
    
    -- Execution details
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, RUNNING, COMPLETED, FAILED
    parameters JSONB,
    
    -- Results
    result_data JSONB,
    result_url VARCHAR(255),
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    executed_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_report_executions_report ON report_executions(report_id);
CREATE INDEX idx_report_executions_status ON report_executions(status);
CREATE INDEX idx_report_executions_started ON report_executions(started_at);

-- ============================================
-- NOTIFICATIONS AND ALERTS
-- ============================================

-- Notification templates
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Template details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    notification_type VARCHAR(50) NOT NULL, -- EMAIL, SMS, PUSH, IN_APP
    
    -- Content
    subject_template TEXT,
    body_template TEXT,
    
    -- Variables
    variables JSONB,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_notification_templates_type ON notification_templates(notification_type);
CREATE INDEX idx_notification_templates_active ON notification_templates(is_active);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Recipient
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    staff_id VARCHAR(100),
    
    -- Notification details
    template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
    notification_type VARCHAR(50) NOT NULL,
    
    -- Content
    subject TEXT,
    body TEXT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, SENT, DELIVERED, FAILED
    delivery_attempts INTEGER DEFAULT 0,
    
    -- Channels
    channels JSONB, -- { email: true, sms: false, push: true }
    
    -- Reference
    reference_type VARCHAR(50),
    reference_id VARCHAR(255),
    
    -- Timestamps
    scheduled_for TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_notifications_customer ON notifications(customer_id);
CREATE INDEX idx_notifications_staff ON notifications(staff_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_scheduled ON notifications(scheduled_for);

-- Alert rules
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Rule details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    alert_type VARCHAR(50) NOT NULL, -- INVENTORY_LOW, ORDER_DELAYED, PAYMENT_FAILED, CUSTOMER_COMPLAINT
    
    -- Rule conditions
    condition_config JSONB NOT NULL,
    
    -- Alert actions
    action_config JSONB NOT NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_alert_rules_type ON alert_rules(alert_type);
CREATE INDEX idx_alert_rules_active ON alert_rules(is_active);

-- Alert incidents
CREATE TABLE IF NOT EXISTS alert_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id VARCHAR(100) UNIQUE NOT NULL,
    rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
    
    -- Incident details
    severity VARCHAR(50) DEFAULT 'INFO', -- INFO, WARNING, ERROR, CRITICAL
    message TEXT,
    
    -- Context
    context_data JSONB,
    
    -- Status
    status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, ACKNOWLEDGED, RESOLVED, IGNORED
    
    -- Timestamps
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    acknowledged_by VARCHAR(100),
    resolved_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_alert_incidents_rule ON alert_incidents(rule_id);
CREATE INDEX idx_alert_incidents_status ON alert_incidents(status);
CREATE INDEX idx_alert_incidents_triggered ON alert_incidents(triggered_at);

-- ============================================
-- CUSTOMER SUPPORT INTEGRATION
-- ============================================

-- Support tickets
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Customer
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    
    -- Ticket details
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50), -- ORDER, PAYMENT, DELIVERY, PRODUCT, GENERAL
    priority VARCHAR(50) DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, URGENT
    status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, WAITING, RESOLVED, CLOSED
    
    -- Assignment
    assigned_to VARCHAR(100),
    assigned_at TIMESTAMP WITH TIME ZONE,
    
    -- Reference
    order_id UUID REFERENCES web_orders(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    
    -- SLA
    sla_due_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_by VARCHAR(100),
    metadata JSONB
);

CREATE INDEX idx_support_tickets_customer ON support_tickets(customer_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX idx_support_tickets_sla ON support_tickets(sla_due_at);

-- Ticket messages
CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id VARCHAR(100) UNIQUE NOT NULL,
    ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
    
    -- Message details
    sender_type VARCHAR(50) NOT NULL, -- CUSTOMER, STAFF, SYSTEM
    sender_id VARCHAR(100),
    message TEXT NOT NULL,
    
    -- Attachments
    attachments JSONB,
    
    -- Internal note
    is_internal BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit
    metadata JSONB
);

CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_created ON ticket_messages(created_at);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate loyalty program ID
CREATE OR REPLACE FUNCTION generate_loyalty_program_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'LOY-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate loyalty account ID
CREATE OR REPLACE FUNCTION generate_loyalty_account_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'ACC-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate point transaction ID
CREATE OR REPLACE FUNCTION generate_point_transaction_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'TXN-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate reward ID
CREATE OR REPLACE FUNCTION generate_reward_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'RWD-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate promotion ID
CREATE OR REPLACE FUNCTION generate_promotion_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'PRM-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate coupon ID
CREATE OR REPLACE FUNCTION generate_coupon_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'CPN-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate segment ID
CREATE OR REPLACE FUNCTION generate_segment_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'SEG-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;

-- Function to generate ticket ID
CREATE OR REPLACE FUNCTION generate_ticket_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'TKT-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
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
CREATE TRIGGER update_loyalty_programs_updated_at BEFORE UPDATE ON loyalty_programs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loyalty_rewards_updated_at BEFORE UPDATE ON loyalty_rewards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_promotions_updated_at BEFORE UPDATE ON promotions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coupon_codes_updated_at BEFORE UPDATE ON coupon_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_segments_updated_at BEFORE UPDATE ON customer_segments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_reports_updated_at BEFORE UPDATE ON saved_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
