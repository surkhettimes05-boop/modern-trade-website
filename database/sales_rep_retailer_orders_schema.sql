-- Sales Representative Retailer Order Workflow
-- This migration adds tables and capabilities for sales representatives to create retailer orders
-- without modifying existing POS or web ordering systems

-- ============================================
-- RETAILERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS retailers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retailer_code VARCHAR(50) UNIQUE NOT NULL,
    retailer_name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255),
    contact_person VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    district VARCHAR(100),
    province VARCHAR(100),
    
    -- Assignment
    assigned_sales_rep_id UUID REFERENCES staff(id),
    territory_id UUID,
    
    -- Credit terms (for future payment integration)
    credit_limit DECIMAL(12, 2) DEFAULT 0,
    current_balance DECIMAL(12, 2) DEFAULT 0,
    payment_terms VARCHAR(50), -- NET30, NET60, COD, etc.
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, SUSPENDED
    approval_status VARCHAR(20) DEFAULT 'APPROVED', -- PENDING, APPROVED, REJECTED
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    tax_id VARCHAR(50),
    pan_number VARCHAR(50),
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_retailers_code ON retailers(retailer_code);
CREATE INDEX IF NOT EXISTS idx_retailers_sales_rep ON retailers(assigned_sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_retailers_status ON retailers(status);
CREATE INDEX IF NOT EXISTS idx_retailers_territory ON retailers(territory_id);

-- ============================================
-- RETAILER ORDERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS retailer_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- Relationships
    retailer_id UUID NOT NULL REFERENCES retailers(id),
    sales_rep_id UUID NOT NULL REFERENCES staff(id),
    store_id UUID REFERENCES stores(id),
    warehouse_id UUID REFERENCES warehouses(id),
    
    -- Order details
    order_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT, SUBMITTED, CONFIRMED, PROCESSING, READY_FOR_PICKUP, SHIPPED, DELIVERED, CANCELLED
    subtotal DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NPR',
    
    -- Delivery/fulfillment information
    delivery_type VARCHAR(50), -- PICKUP, DELIVERY
    requested_delivery_date DATE,
    requested_delivery_time_slot VARCHAR(100),
    delivery_address TEXT,
    delivery_contact_name VARCHAR(255),
    delivery_contact_phone VARCHAR(20),
    
    -- Internal notes
    internal_notes TEXT,
    customer_notes TEXT,
    
    -- Idempotency
    idempotency_key VARCHAR(255) UNIQUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_retailer_orders_number ON retailer_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_retailer_orders_retailer ON retailer_orders(retailer_id);
CREATE INDEX IF NOT EXISTS idx_retailer_orders_sales_rep ON retailer_orders(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_retailer_orders_store ON retailer_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_retailer_orders_warehouse ON retailer_orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_retailer_orders_status ON retailer_orders(status);
CREATE INDEX IF NOT EXISTS idx_retailer_orders_date ON retailer_orders(order_date);

-- ============================================
-- RETAILER ORDER ITEMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS retailer_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES retailer_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    sku VARCHAR(100),
    product_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    line_total DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    line_total_with_tax DECIMAL(12, 2) NOT NULL,
    batch_id VARCHAR(100),
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retailer_order_items_order ON retailer_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_retailer_order_items_product ON retailer_order_items(product_id);

-- ============================================
-- FUNCTION TO GENERATE RETAILER ORDER NUMBER
-- ============================================

CREATE OR REPLACE FUNCTION generate_retailer_order_number()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'RO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('retailer_order_seq')::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Create sequence if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS retailer_order_seq START 1;

-- ============================================
-- TRIGGER FOR updated_at
-- ============================================

CREATE TRIGGER update_retailers_updated_at BEFORE UPDATE ON retailers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_retailer_orders_updated_at BEFORE UPDATE ON retailer_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ADD SALES REPRESENTATIVE ROLE
-- ============================================

INSERT INTO roles (role_key, role_name, description, role_level, capabilities, is_system_role) VALUES
('sales_representative', 'Sales Representative', 'Field sales representative for retailer orders', 2,
'["catalog.read", "retailers.read", "retailers.manage", "retailer_orders.create", "retailer_orders.read", "retailer_orders.modify", "retailer_orders.cancel", "dashboard.read"]'::JSONB, true)
ON CONFLICT (role_key) DO NOTHING;

-- ============================================
-- ADD SALES REPRESENTATIVE CAPABILITIES
-- ============================================

INSERT INTO capabilities (capability_key, capability_name, description, category, risk_level, allowed_scopes) VALUES
-- Retailer capabilities
('retailers.read', 'Read Retailers', 'View retailer information', 'retailers', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('retailers.manage', 'Manage Retailers', 'Create and edit retailer accounts', 'retailers', 'MEDIUM', ARRAY['GLOBAL', 'ORGANIZATION']),

-- Retailer order capabilities
('retailer_orders.create', 'Create Retailer Orders', 'Create retailer orders', 'retailers', 'MEDIUM', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('retailer_orders.read', 'Read Retailer Orders', 'View retailer orders', 'retailers', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('retailer_orders.modify', 'Modify Retailer Orders', 'Modify retailer order details', 'retailers', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('retailer_orders.cancel', 'Cancel Retailer Orders', 'Cancel retailer orders', 'retailers', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('retailer_orders.fulfil', 'Fulfil Retailer Orders', 'Process retailer order fulfillment', 'retailers', 'MEDIUM', ARRAY['ORGANIZATION', 'STORE'])
ON CONFLICT (capability_key) DO NOTHING;

-- ============================================
-- UPDATE EXISTING ROLES WITH NEW CAPABILITIES
-- ============================================

-- Add retailer capabilities to platform_admin
UPDATE roles 
SET capabilities = capabilities || '["retailers.read", "retailers.manage", "retailer_orders.create", "retailer_orders.read", "retailer_orders.modify", "retailer_orders.cancel", "retailer_orders.fulfil"]'::JSONB
WHERE role_key = 'platform_admin';

-- Add retailer capabilities to head_office_admin
UPDATE roles 
SET capabilities = capabilities || '["retailers.read", "retailers.manage", "retailer_orders.create", "retailer_orders.read", "retailer_orders.modify", "retailer_orders.cancel", "retailer_orders.fulfil"]'::JSONB
WHERE role_key = 'head_office_admin';

-- Add retailer capabilities to regional_manager
UPDATE roles 
SET capabilities = capabilities || '["retailers.read", "retailers.manage", "retailer_orders.create", "retailer_orders.read", "retailer_orders.modify", "retailer_orders.cancel", "retailer_orders.fulfil"]'::JSONB
WHERE role_key = 'regional_manager';

-- Add retailer capabilities to store_manager
UPDATE roles 
SET capabilities = capabilities || '["retailers.read", "retailer_orders.read", "retailer_orders.fulfil"]'::JSONB
WHERE role_key = 'store_manager';
