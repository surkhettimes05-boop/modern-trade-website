-- Phase 4 Database Schema: Operational Modules
-- This schema adds tables for suppliers, purchasing, receiving, and operational workflows

-- ============================================
-- WAREHOUSES
-- ============================================

CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_code VARCHAR(50) UNIQUE NOT NULL,
    warehouse_name VARCHAR(255) NOT NULL,
    store_id UUID REFERENCES stores(id),
    address TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_store ON warehouses(store_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_status ON warehouses(status);

-- ============================================
-- SUPPLIERS
-- ============================================

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_code VARCHAR(50) UNIQUE NOT NULL,
    supplier_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Nepal',
    
    -- Payment terms
    payment_terms VARCHAR(50), -- NET30, NET60, COD, etc.
    credit_limit DECIMAL(12, 2),
    current_balance DECIMAL(12, 2) DEFAULT 0,
    
    -- Performance tracking
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    total_orders INTEGER DEFAULT 0,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    last_order_date DATE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, SUSPENDED
    approval_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
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

CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(supplier_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_approval ON suppliers(approval_status);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(supplier_name);

-- ============================================
-- SUPPLIER PRODUCT CATALOG
-- ============================================

CREATE TABLE IF NOT EXISTS supplier_product_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    product_id UUID NOT NULL REFERENCES products(id),
    supplier_sku VARCHAR(100),
    supplier_product_name VARCHAR(255),
    unit_price DECIMAL(12, 2),
    minimum_order_quantity INTEGER DEFAULT 1,
    lead_time_days INTEGER DEFAULT 7,
    is_preferred BOOLEAN DEFAULT FALSE,
    effective_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(supplier_id, product_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_supplier ON supplier_product_catalog(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_catalog_product ON supplier_product_catalog(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_catalog_effective ON supplier_product_catalog(effective_date);

-- ============================================
-- PURCHASE ORDERS
-- ============================================

CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number VARCHAR(100) UNIQUE NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    store_id UUID REFERENCES stores(id),
    warehouse_id UUID REFERENCES warehouses(id),
    
    -- Order details
    order_date DATE DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    
    -- Financials
    subtotal DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    shipping_amount DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NPR',
    
    -- Status
    status VARCHAR(20) DEFAULT 'DRAFT', -- DRAFT, SENT, ACKNOWLEDGED, PARTIAL_RECEIVED, RECEIVED, CANCELLED
    approval_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Reference
    reference_number VARCHAR(100),
    notes TEXT,
    
    -- Metadata
    idempotency_key VARCHAR(100) UNIQUE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_store ON purchase_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_idempotency ON purchase_orders(idempotency_key);

-- ============================================
-- PURCHASE ORDER LINE ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    supplier_sku VARCHAR(100),
    product_name VARCHAR(255),
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    unit_price DECIMAL(12, 2) NOT NULL,
    line_total DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    line_total_with_tax DECIMAL(12, 2) NOT NULL,
    
    -- Batch info
    batch_id VARCHAR(100),
    expiry_date DATE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, ORDERED, RECEIVED, CANCELLED
    
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product ON purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_po_items_status ON purchase_order_items(status);

-- ============================================
-- RECEIVING
-- ============================================

CREATE TABLE IF NOT EXISTS receiving (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receiving_number VARCHAR(100) UNIQUE NOT NULL,
    po_id UUID REFERENCES purchase_orders(id),
    supplier_id UUID REFERENCES suppliers(id),
    store_id UUID REFERENCES stores(id),
    warehouse_id UUID REFERENCES warehouses(id),
    
    -- Receiving details
    receiving_date DATE DEFAULT CURRENT_DATE,
    received_by VARCHAR(100),
    
    -- Status
    status VARCHAR(20) DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED, CANCELLED
    
    -- Discrepancies
    has_discrepancies BOOLEAN DEFAULT FALSE,
    discrepancy_notes TEXT,
    
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receiving_number ON receiving(receiving_number);
CREATE INDEX IF NOT EXISTS idx_receiving_po ON receiving(po_id);
CREATE INDEX IF NOT EXISTS idx_receiving_supplier ON receiving(supplier_id);
CREATE INDEX IF NOT EXISTS idx_receiving_store ON receiving(store_id);
CREATE INDEX IF NOT EXISTS idx_receiving_date ON receiving(receiving_date);
CREATE INDEX IF NOT EXISTS idx_receiving_status ON receiving(status);

-- ============================================
-- RECEIVING LINE ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS receiving_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receiving_id UUID NOT NULL REFERENCES receiving(id) ON DELETE CASCADE,
    po_item_id UUID REFERENCES purchase_order_items(id),
    product_id UUID REFERENCES products(id),
    
    -- Quantities
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER NOT NULL,
    quantity_accepted INTEGER NOT NULL,
    quantity_rejected INTEGER DEFAULT 0,
    
    -- Quality check
    quality_check_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PASSED, FAILED
    quality_check_notes TEXT,
    quality_checked_by VARCHAR(100),
    quality_checked_at TIMESTAMP WITH TIME ZONE,
    
    -- Batch info
    batch_id VARCHAR(100),
    expiry_date DATE,
    manufacturing_date DATE,
    
    -- Unit price at receiving
    unit_price DECIMAL(12, 2),
    line_total DECIMAL(12, 2),
    
    -- Discrepancy
    discrepancy_type VARCHAR(50), -- SHORTAGE, OVERAGE, DAMAGED, WRONG_ITEM
    discrepancy_quantity INTEGER DEFAULT 0,
    discrepancy_notes TEXT,
    
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, ACCEPTED, REJECTED
    
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receiving_items_receiving ON receiving_items(receiving_id);
CREATE INDEX IF NOT EXISTS idx_receiving_items_product ON receiving_items(product_id);
CREATE INDEX IF NOT EXISTS idx_receiving_items_status ON receiving_items(status);

-- ============================================
-- SHIFTS
-- ============================================

CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_number VARCHAR(100) UNIQUE NOT NULL,
    store_id UUID NOT NULL REFERENCES stores(id),
    device_id VARCHAR(100) REFERENCES devices(device_id),
    
    -- Staff
    opened_by VARCHAR(100) NOT NULL,
    closed_by VARCHAR(100),
    
    -- Timestamps
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    
    -- Cash declaration
    opening_cash DECIMAL(12, 2) DEFAULT 0,
    closing_cash DECIMAL(12, 2),
    expected_cash DECIMAL(12, 2),
    cash_variance DECIMAL(12, 2),
    
    -- Status
    status VARCHAR(20) DEFAULT 'OPEN', -- OPEN, CLOSED, VOIDED
    
    -- Summary
    transaction_count INTEGER DEFAULT 0,
    gross_sales DECIMAL(12, 2) DEFAULT 0,
    net_sales DECIMAL(12, 2) DEFAULT 0,
    total_discounts DECIMAL(12, 2) DEFAULT 0,
    points_earned INTEGER DEFAULT 0,
    points_redeemed INTEGER DEFAULT 0,
    
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Phase 3 introduced a smaller shifts table. Add the operational fields when
-- upgrading an existing Phase 3 database.
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS device_id VARCHAR(100) REFERENCES devices(device_id);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS opening_cash DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closing_cash DECIMAL(12, 2);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS expected_cash DECIMAL(12, 2);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_variance DECIMAL(12, 2);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'OPEN';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS transaction_count INTEGER DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS gross_sales DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS net_sales DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS total_discounts DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS points_redeemed INTEGER DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE shifts ALTER COLUMN shift_date SET DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_shifts_number ON shifts(shift_number);
CREATE INDEX IF NOT EXISTS idx_shifts_store ON shifts(store_id);
CREATE INDEX IF NOT EXISTS idx_shifts_device ON shifts(device_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_opened_at ON shifts(opened_at);

-- ============================================
-- STAFF
-- ============================================

CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_number VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(255) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    
    -- Contact
    phone VARCHAR(20),
    email VARCHAR(255),
    
    -- Employment
    store_id UUID REFERENCES stores(id),
    role VARCHAR(50) NOT NULL, -- MANAGER, ASSISTANT_MANAGER, CASHIER, STOCKeeper, etc.
    position VARCHAR(100),
    department VARCHAR(50),
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, TERMINATED, ON_LEAVE
    hire_date DATE,
    termination_date DATE,
    
    -- Authentication
    username VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    
    -- Permissions
    permissions JSONB,
    
    -- Metadata
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_staff_number ON staff(staff_number);
CREATE INDEX IF NOT EXISTS idx_staff_store ON staff(store_id);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status);
CREATE INDEX IF NOT EXISTS idx_staff_username ON staff(username);

-- ============================================
-- AUDIT REPORTS
-- ============================================

CREATE TABLE IF NOT EXISTS audit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_number VARCHAR(100) UNIQUE NOT NULL,
    report_type VARCHAR(50) NOT NULL, -- SHIFT, DAILY_SALES, INVENTORY, LOYALTY
    store_id UUID REFERENCES stores(id),
    generated_by VARCHAR(100) NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'GENERATED', -- GENERATED, APPROVED, ARCHIVED
    data JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_reports_number ON audit_reports(report_number);
CREATE INDEX IF NOT EXISTS idx_audit_reports_type ON audit_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_audit_reports_store ON audit_reports(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_reports_generated ON audit_reports(generated_at);

-- ============================================
-- TENDER RECONCILIATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS tender_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_number VARCHAR(100) UNIQUE NOT NULL,
    shift_id UUID REFERENCES shifts(id),
    store_id UUID REFERENCES stores(id),
    device_id VARCHAR(100) REFERENCES devices(device_id),
    reconciled_by VARCHAR(100) NOT NULL,
    reconciliation_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'DISCREPANCY', -- MATCHED, DISCREPANCY, RESOLVED
    total_expected DECIMAL(12, 2) NOT NULL,
    total_counted DECIMAL(12, 2) NOT NULL,
    variance DECIMAL(12, 2) NOT NULL,
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tender_reconciliations_number ON tender_reconciliations(reconciliation_number);
CREATE INDEX IF NOT EXISTS idx_tender_reconciliations_shift ON tender_reconciliations(shift_id);
CREATE INDEX IF NOT EXISTS idx_tender_reconciliations_store ON tender_reconciliations(store_id);
CREATE INDEX IF NOT EXISTS idx_tender_reconciliations_date ON tender_reconciliations(reconciliation_date);
CREATE INDEX IF NOT EXISTS idx_tender_reconciliations_status ON tender_reconciliations(status);

-- ============================================
-- TENDER RECONCILIATION ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS tender_reconciliation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES tender_reconciliations(id) ON DELETE CASCADE,
    tender_type VARCHAR(50) NOT NULL,
    expected_amount DECIMAL(12, 2) NOT NULL,
    counted_amount DECIMAL(12, 2) NOT NULL,
    variance DECIMAL(12, 2) NOT NULL,
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tender_reconciliation_items_reconciliation ON tender_reconciliation_items(reconciliation_id);

-- ============================================
-- INVENTORY TRANSFERS
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_number VARCHAR(100) UNIQUE NOT NULL,
    from_store_id UUID REFERENCES stores(id),
    to_store_id UUID REFERENCES stores(id),
    from_warehouse_id UUID REFERENCES warehouses(id),
    to_warehouse_id UUID REFERENCES warehouses(id),
    status VARCHAR(20) DEFAULT 'REQUESTED', -- REQUESTED, APPROVED, IN_TRANSIT, COMPLETED, CANCELLED, REJECTED
    requested_by VARCHAR(100) NOT NULL,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    shipped_by VARCHAR(100),
    shipped_at TIMESTAMP WITH TIME ZONE,
    received_by VARCHAR(100),
    received_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS from_warehouse_id UUID REFERENCES warehouses(id);
ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS to_warehouse_id UUID REFERENCES warehouses(id);
ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'REQUESTED';
ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS requested_by VARCHAR(100);
ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS shipped_by VARCHAR(100);
ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE inventory_transfers ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_inventory_transfers_number ON inventory_transfers(transfer_number);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_from_store ON inventory_transfers(from_store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_to_store ON inventory_transfers(to_store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_status ON inventory_transfers(status);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_created ON inventory_transfers(created_at);

-- ============================================
-- INVENTORY TRANSFER ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    batch_id VARCHAR(100),
    expiry_date DATE,
    quantity_requested INTEGER NOT NULL,
    quantity_shipped INTEGER DEFAULT 0,
    quantity_received INTEGER DEFAULT 0,
    unit_cost DECIMAL(12, 2),
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, SHIPPED, RECEIVED
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE inventory_transfer_items ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE inventory_transfer_items ADD COLUMN IF NOT EXISTS quantity_requested INTEGER;
ALTER TABLE inventory_transfer_items ADD COLUMN IF NOT EXISTS quantity_shipped INTEGER DEFAULT 0;
ALTER TABLE inventory_transfer_items ADD COLUMN IF NOT EXISTS quantity_received INTEGER DEFAULT 0;
ALTER TABLE inventory_transfer_items ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE inventory_transfer_items ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE inventory_transfer_items ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE inventory_transfer_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE inventory_transfer_items ALTER COLUMN quantity DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_transfer ON inventory_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_product ON inventory_transfer_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfer_items_status ON inventory_transfer_items(status);

-- ============================================
-- BATCH INVENTORY
-- ============================================

CREATE TABLE IF NOT EXISTS batch_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    product_id UUID NOT NULL REFERENCES products(id),
    batch_id VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    cost DECIMAL(12, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(store_id, product_id, batch_id)
);

ALTER TABLE batch_inventory ADD COLUMN IF NOT EXISTS cost DECIMAL(12, 2);

CREATE INDEX IF NOT EXISTS idx_batch_inventory_store ON batch_inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_batch_inventory_product ON batch_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_batch_inventory_batch ON batch_inventory(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_inventory_expiry ON batch_inventory(expiry_date);

-- ============================================
-- INVENTORY QUALITY EXCEPTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_quality_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id),
    product_id UUID REFERENCES products(id),
    batch_id VARCHAR(100),
    exception_type VARCHAR(50) NOT NULL, -- DAMAGED, EXPIRED, WRONG_ITEM, QUALITY_ISSUE
    quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN', -- OPEN, RESOLVED
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_exceptions_store ON inventory_quality_exceptions(store_id);
CREATE INDEX IF NOT EXISTS idx_quality_exceptions_product ON inventory_quality_exceptions(product_id);
CREATE INDEX IF NOT EXISTS idx_quality_exceptions_status ON inventory_quality_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_quality_exceptions_type ON inventory_quality_exceptions(exception_type);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate PO number
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'PO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('po_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to generate receiving number
CREATE OR REPLACE FUNCTION generate_receiving_number()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'RCV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('receiving_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to generate shift number
CREATE OR REPLACE FUNCTION generate_shift_number()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'SHFT-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MI') || '-' || LPAD(nextval('shift_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to generate staff number
CREATE OR REPLACE FUNCTION generate_staff_number()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'STF-' || LPAD(nextval('staff_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Create sequences
CREATE SEQUENCE IF NOT EXISTS po_seq START 1;
CREATE SEQUENCE IF NOT EXISTS receiving_seq START 1;
CREATE SEQUENCE IF NOT EXISTS shift_seq START 1;
CREATE SEQUENCE IF NOT EXISTS staff_seq START 1;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to update updated_at
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_supplier_catalog_updated_at BEFORE UPDATE ON supplier_product_catalog
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_po_items_updated_at BEFORE UPDATE ON purchase_order_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_receiving_updated_at BEFORE UPDATE ON receiving
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_receiving_items_updated_at BEFORE UPDATE ON receiving_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tender_reconciliations_updated_at BEFORE UPDATE ON tender_reconciliations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tender_reconciliation_items_updated_at BEFORE UPDATE ON tender_reconciliation_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_transfers_updated_at BEFORE UPDATE ON inventory_transfers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_transfer_items_updated_at BEFORE UPDATE ON inventory_transfer_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batch_inventory_updated_at BEFORE UPDATE ON batch_inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
