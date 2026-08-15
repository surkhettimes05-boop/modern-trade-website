-- WP1: Capability and Store-Scope Database Schema
-- This migration adds capability-based authorization and scope management

-- ============================================
-- ROLES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_key VARCHAR(50) UNIQUE NOT NULL, -- e.g., platform_admin, store_manager, cashier
    role_name VARCHAR(255) NOT NULL,
    description TEXT,
    role_level INTEGER NOT NULL, -- 1=cashier, 2=inventory_controller, 3=store_manager, 4=head_office, 5=platform_admin
    capabilities JSONB NOT NULL DEFAULT '[]', -- Array of capability strings
    is_system_role BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE INDEX idx_roles_key ON roles(role_key);
CREATE INDEX idx_roles_level ON roles(role_level);
CREATE INDEX idx_roles_active ON roles(is_active);

-- ============================================
-- STAFF TABLE UPDATES
-- ============================================

-- Add role_id to staff if it doesn't exist
ALTER TABLE staff
ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

-- Add capability and scope fields
ALTER TABLE staff
ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]', -- Computed from role + overrides
ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) DEFAULT 'STORE', -- GLOBAL, ORGANIZATION, STORE, OWN_REGISTER
ADD COLUMN IF NOT EXISTS scope_store_ids UUID[], -- Array of store IDs this staff can access
ADD COLUMN IF NOT EXISTS scope_organization_id UUID,
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(255), -- Encrypted TOTP secret
ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[], -- Encrypted backup codes
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS password_last_changed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS session_last_rotated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT FALSE;

-- Create indexes for new staff columns
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role_id);
CREATE INDEX IF NOT EXISTS idx_staff_scope_type ON staff(scope_type);
CREATE INDEX IF NOT EXISTS idx_staff_scope_org ON staff(scope_organization_id);

-- ============================================
-- CAPABILITY DEFINITIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capability_key VARCHAR(100) UNIQUE NOT NULL, -- e.g., catalog.read, orders.cancel
    capability_name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- catalog, orders, inventory, customers, staff, reports, settings
    risk_level VARCHAR(20) DEFAULT 'LOW', -- LOW, MEDIUM, HIGH, CRITICAL
    requires_mfa BOOLEAN DEFAULT FALSE, -- Requires MFA for this capability
    requires_step_up_auth BOOLEAN DEFAULT FALSE, -- Requires re-authentication for sensitive actions
    allowed_scopes VARCHAR(20)[], -- Array of allowed scope types
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_capabilities_key ON capabilities(capability_key);
CREATE INDEX idx_capabilities_category ON capabilities(category);
CREATE INDEX idx_capabilities_active ON capabilities(is_active);

-- ============================================
-- STAFF CAPABILITY OVERRIDES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS staff_capability_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id),
    capability_key VARCHAR(100) NOT NULL,
    is_granted BOOLEAN NOT NULL, -- true to grant, false to revoke
    reason TEXT,
    granted_by VARCHAR(100),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(staff_id, capability_key)
);

CREATE INDEX idx_staff_overrides_staff ON staff_capability_overrides(staff_id);
CREATE INDEX idx_staff_overrides_capability ON staff_capability_overrides(capability_key);
CREATE INDEX idx_staff_overrides_active ON staff_capability_overrides(is_active);

-- ============================================
-- AUDIT EVENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT, PERMISSION_CHANGE, etc.
    entity_type VARCHAR(50) NOT NULL, -- staff, product, order, etc.
    entity_id UUID,
    actor_id UUID REFERENCES staff(id),
    actor_role VARCHAR(50),
    actor_capabilities JSONB,
    actor_scope_type VARCHAR(20),
    actor_scope_store_ids UUID[],
    changes JSONB, -- { before: {...}, after: {...} }
    ip_address VARCHAR(45),
    user_agent TEXT,
    correlation_id VARCHAR(100),
    feature_flags JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_events_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_audit_events_actor ON audit_events(actor_id);
CREATE INDEX idx_audit_events_created ON audit_events(created_at);
CREATE INDEX idx_audit_events_correlation ON audit_events(correlation_id);

-- ============================================
-- SESSIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE,
    device_id VARCHAR(100),
    device_type VARCHAR(50), -- desktop, tablet, mobile
    device_fingerprint TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    location_country VARCHAR(2),
    location_city VARCHAR(100),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason VARCHAR(100)
);

CREATE INDEX idx_sessions_staff ON sessions(staff_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_refresh ON sessions(refresh_token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_sessions_active ON sessions(is_revoked, expires_at);

-- ============================================
-- PERMISSION DENIED LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS permission_denied_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES staff(id),
    required_capability VARCHAR(100) NOT NULL,
    attempted_route VARCHAR(255) NOT NULL,
    attempted_method VARCHAR(10) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    denied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    scope_type VARCHAR(20),
    scope_store_ids UUID[],
    actor_capabilities JSONB
);

CREATE INDEX idx_permission_denied_staff ON permission_denied_logs(staff_id);
CREATE INDEX idx_permission_denied_capability ON permission_denied_logs(required_capability);
CREATE INDEX idx_permission_denied_route ON permission_denied_logs(attempted_route);
CREATE INDEX idx_permission_denied_created ON permission_denied_logs(denied_at);

-- ============================================
-- TRIGGER FOR updated_at
-- ============================================

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_capabilities_updated_at BEFORE UPDATE ON capabilities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTION TO COMPUTE STAFF CAPABILITIES
-- ============================================

CREATE OR REPLACE FUNCTION compute_staff_capabilities(staff_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    role_capabilities JSONB;
    overrides JSONB;
    final_capabilities JSONB;
BEGIN
    -- Get role capabilities
    SELECT COALESCE(r.capabilities, '[]'::JSONB)
    INTO role_capabilities
    FROM staff s
    LEFT JOIN roles r ON s.role_id = r.id
    WHERE s.id = staff_uuid;

    -- Get active overrides
    SELECT COALESCE(jsonb_agg(
        CASE 
            WHEN is_granted THEN capability_key 
            ELSE '-' || capability_key 
        END
    ), '[]'::JSONB)
    INTO overrides
    FROM staff_capability_overrides
    WHERE staff_id = staff_uuid 
    AND is_active = TRUE 
    AND (expires_at IS NULL OR expires_at > NOW());

    -- Start with role capabilities
    final_capabilities := role_capabilities;

    -- Apply overrides (grants add, revokes remove)
    IF overrides != '[]'::JSONB THEN
        FOR i IN 0..jsonb_array_length(overrides)-1 LOOP
            DECLARE
                override_key TEXT;
                is_revoke BOOLEAN;
            BEGIN
                override_key := overrides->i;
                is_revoke := override_key LIKE '-%';
                
                IF is_revoke THEN
                    final_capabilities := final_capabilities - substring(override_key FROM 2);
                ELSE
                    IF NOT (final_capabilities ? override_key) THEN
                        final_capabilities := final_capabilities || to_jsonb(override_key);
                    END IF;
                END IF;
            END;
        END LOOP;
    END IF;

    RETURN final_capabilities;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER TO UPDATE STAFF CAPABILITIES
-- ============================================

CREATE OR REPLACE FUNCTION update_staff_capabilities_trigger()
RETURNS TRIGGER AS $$
DECLARE
    computed_capabilities JSONB;
    override RECORD;
BEGIN
    SELECT COALESCE(capabilities, '[]'::JSONB)
    INTO computed_capabilities
    FROM roles
    WHERE id = NEW.role_id;

    computed_capabilities := COALESCE(computed_capabilities, '[]'::JSONB);

    FOR override IN
        SELECT capability_key, is_granted
        FROM staff_capability_overrides
        WHERE staff_id = NEW.id
          AND is_active = TRUE
          AND (expires_at IS NULL OR expires_at > NOW())
    LOOP
        IF override.is_granted THEN
            IF NOT (computed_capabilities ? override.capability_key) THEN
                computed_capabilities := computed_capabilities || to_jsonb(override.capability_key);
            END IF;
        ELSE
            computed_capabilities := computed_capabilities - override.capability_key;
        END IF;
    END LOOP;

    NEW.capabilities := computed_capabilities;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER staff_capabilities_update
    BEFORE INSERT OR UPDATE ON staff
    FOR EACH ROW
    EXECUTE FUNCTION update_staff_capabilities_trigger();

-- ============================================
-- INITIAL DATA - CAPABILITIES
-- ============================================

INSERT INTO capabilities (capability_key, capability_name, description, category, risk_level, allowed_scopes) VALUES
-- Catalog capabilities
('catalog.read', 'Read Catalog', 'View products, categories, brands', 'catalog', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('catalog.write', 'Write Catalog', 'Create and edit products, categories, brands', 'catalog', 'MEDIUM', ARRAY['GLOBAL', 'ORGANIZATION']),
('catalog.publish', 'Publish Catalog', 'Publish products to storefront', 'catalog', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION']),
('catalog.import', 'Import Catalog', 'Bulk import products via CSV', 'catalog', 'MEDIUM', ARRAY['GLOBAL', 'ORGANIZATION']),
('catalog.delete', 'Delete Catalog', 'Delete products from catalog', 'catalog', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION']),

-- Pricing capabilities
('pricing.read', 'Read Pricing', 'View product prices', 'pricing', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('pricing.write', 'Write Pricing', 'Edit product prices', 'pricing', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION']),
('pricing.approve', 'Approve Pricing', 'Approve price changes', 'pricing', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION']),

-- Order capabilities
('orders.read', 'Read Orders', 'View orders', 'orders', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('orders.fulfil', 'Fulfil Orders', 'Process order fulfilment', 'orders', 'MEDIUM', ARRAY['ORGANIZATION', 'STORE']),
('orders.cancel', 'Cancel Orders', 'Cancel orders', 'orders', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('orders.modify', 'Modify Orders', 'Modify order details', 'orders', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),

-- Refund capabilities
('refunds.request', 'Request Refunds', 'Initiate refund requests', 'orders', 'MEDIUM', ARRAY['ORGANIZATION', 'STORE']),
('refunds.approve', 'Approve Refunds', 'Approve refund requests', 'orders', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION']),

-- Inventory capabilities
('inventory.read', 'Read Inventory', 'View inventory levels', 'inventory', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('inventory.adjust', 'Adjust Inventory', 'Make inventory adjustments', 'inventory', 'MEDIUM', ARRAY['ORGANIZATION', 'STORE']),
('transfers.request', 'Request Transfers', 'Request inventory transfers', 'inventory', 'MEDIUM', ARRAY['ORGANIZATION', 'STORE']),
('transfers.approve', 'Approve Transfers', 'Approve inventory transfers', 'inventory', 'HIGH', ARRAY['ORGANIZATION', 'STORE']),

-- Customer capabilities
('customers.read', 'Read Customers', 'View customer data', 'customers', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('customers.pii', 'Access Customer PII', 'Access sensitive customer data', 'customers', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION']),
('customers.manage', 'Manage Customers', 'Edit customer accounts', 'customers', 'MEDIUM', ARRAY['GLOBAL', 'ORGANIZATION']),
('segments.manage', 'Manage Segments', 'Manage customer segments', 'customers', 'MEDIUM', ARRAY['GLOBAL', 'ORGANIZATION']),
('loyalty.manage', 'Manage Loyalty', 'Adjust loyalty points', 'customers', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),

-- Staff capabilities
('staff.read', 'Read Staff', 'View staff information', 'staff', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('staff.manage', 'Manage Staff', 'Create and edit staff accounts', 'staff', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION']),
('roles.manage', 'Manage Roles', 'Manage role definitions', 'staff', 'CRITICAL', ARRAY['GLOBAL']),

-- Store capabilities
('stores.read', 'Read Stores', 'View store information', 'stores', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('stores.manage', 'Manage Stores', 'Create and edit stores', 'stores', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION']),

-- Report capabilities
('reports.financial', 'View Financial Reports', 'Access financial reports', 'reports', 'MEDIUM', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('reports.sales', 'View Sales Reports', 'Access sales reports', 'reports', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('reports.inventory', 'View Inventory Reports', 'Access inventory reports', 'reports', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),
('reports.export', 'Export Reports', 'Export report data', 'reports', 'MEDIUM', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),

-- Audit capabilities
('audit.read', 'Read Audit Logs', 'View audit trail', 'audit', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION']),

-- Settings capabilities
('settings.manage', 'Manage Settings', 'Manage system settings', 'settings', 'CRITICAL', ARRAY['GLOBAL', 'ORGANIZATION']),

-- Dashboard capabilities
('dashboard.read', 'Read Dashboard', 'View dashboard metrics', 'dashboard', 'LOW', ARRAY['GLOBAL', 'ORGANIZATION', 'STORE']),

-- POS capabilities
('pos.execute', 'Execute POS', 'Process POS transactions', 'pos', 'MEDIUM', ARRAY['STORE', 'OWN_REGISTER']),

-- Shift capabilities
('shifts.manage', 'Manage Shifts', 'Manage shift operations', 'operations', 'MEDIUM', ARRAY['STORE']),

-- Reconciliation capabilities
('reconciliation.manage', 'Manage Reconciliation', 'Manage tender reconciliation', 'operations', 'HIGH', ARRAY['STORE']),

-- Device capabilities
('devices.manage', 'Manage Devices', 'Manage POS devices', 'operations', 'MEDIUM', ARRAY['STORE']),

-- Incident capabilities
('incidents.manage', 'Manage Incidents', 'Manage security incidents', 'security', 'HIGH', ARRAY['GLOBAL', 'ORGANIZATION']),

-- System capabilities
('system.manage', 'Manage System', 'System administration', 'system', 'CRITICAL', ARRAY['GLOBAL'])
ON CONFLICT (capability_key) DO NOTHING;

-- ============================================
-- INITIAL DATA - ROLES
-- ============================================

INSERT INTO roles (role_key, role_name, description, role_level, capabilities, is_system_role) VALUES
('platform_admin', 'Platform Administrator', 'Full system access', 5, 
'["catalog.read", "catalog.write", "catalog.publish", "catalog.import", "catalog.delete", "pricing.read", "pricing.write", "pricing.approve", "orders.read", "orders.fulfil", "orders.cancel", "orders.modify", "refunds.request", "refunds.approve", "inventory.read", "inventory.adjust", "transfers.request", "transfers.approve", "customers.read", "customers.pii", "customers.manage", "segments.manage", "loyalty.manage", "staff.read", "staff.manage", "roles.manage", "stores.read", "stores.manage", "reports.financial", "reports.sales", "reports.inventory", "reports.export", "audit.read", "settings.manage", "dashboard.read", "incidents.manage", "system.manage"]'::JSONB, true),

('head_office_admin', 'Head Office Administrator', 'Organization-wide management', 4,
'["catalog.read", "catalog.write", "catalog.publish", "catalog.import", "pricing.read", "pricing.write", "pricing.approve", "orders.read", "orders.fulfil", "orders.cancel", "refunds.request", "refunds.approve", "inventory.read", "transfers.request", "transfers.approve", "customers.read", "customers.pii", "customers.manage", "segments.manage", "loyalty.manage", "staff.read", "staff.manage", "stores.read", "stores.manage", "reports.financial", "reports.sales", "reports.inventory", "reports.export", "audit.read", "dashboard.read", "incidents.manage"]'::JSONB, true),

('ecommerce_manager', 'E-commerce Manager', 'Online store management', 4,
'["catalog.read", "catalog.write", "catalog.publish", "catalog.import", "pricing.read", "pricing.write", "pricing.approve", "orders.read", "orders.fulfil", "orders.cancel", "refunds.request", "customers.read", "customers.pii", "segments.manage", "loyalty.manage", "stores.read", "reports.financial", "reports.sales", "reports.export", "dashboard.read"]'::JSONB, true),

('catalog_manager', 'Catalog Manager', 'Product catalog management', 3,
'["catalog.read", "catalog.write", "catalog.publish", "catalog.import", "pricing.read", "pricing.write", "dashboard.read"]'::JSONB, true),

('merchandiser', 'Merchandiser', 'Promotions and merchandising', 3,
'["catalog.read", "pricing.read", "pricing.write", "pricing.approve", "customers.read", "segments.manage", "dashboard.read"]'::JSONB, true),

('customer_support', 'Customer Support Agent', 'Customer service', 2,
'["orders.read", "orders.fulfil", "customers.read", "loyalty.manage", "stores.read", "dashboard.read"]'::JSONB, true),

('finance_user', 'Finance/Reconciliation User', 'Financial operations', 3,
'["orders.read", "refunds.request", "refunds.approve", "reconciliation.manage", "reports.financial", "reports.sales", "reports.export", "dashboard.read"]'::JSONB, true),

('compliance_auditor', 'Compliance Auditor', 'Audit and compliance', 3,
'["catalog.read", "orders.read", "inventory.read", "customers.read", "staff.read", "stores.read", "reports.financial", "reports.sales", "reports.inventory", "reports.export", "audit.read", "dashboard.read"]'::JSONB, true),

('regional_manager', 'Regional Manager', 'Multi-store management', 3,
'["catalog.read", "orders.read", "orders.fulfil", "orders.cancel", "inventory.read", "inventory.adjust", "transfers.request", "transfers.approve", "customers.read", "staff.read", "staff.manage", "stores.read", "reports.financial", "reports.sales", "reports.inventory", "dashboard.read", "shifts.manage", "reconciliation.manage", "devices.manage"]'::JSONB, true),

('store_manager', 'Store Manager', 'Single store management', 2,
'["catalog.read", "orders.read", "orders.fulfil", "orders.cancel", "inventory.read", "inventory.adjust", "transfers.request", "customers.read", "loyalty.manage", "staff.read", "staff.manage", "stores.read", "reports.financial", "reports.sales", "reports.inventory", "reports.export", "dashboard.read", "shifts.manage", "reconciliation.manage", "devices.manage"]'::JSONB, true),

('inventory_controller', 'Inventory Controller', 'Inventory management', 2,
'["catalog.read", "inventory.read", "inventory.adjust", "transfers.request", "reports.inventory", "dashboard.read"]'::JSONB, true),

('receiving_clerk', 'Receiving Clerk', 'Purchase order receiving', 1,
'["catalog.read", "inventory.read", "dashboard.read"]'::JSONB, true),

('cashier', 'Cashier', 'POS operations', 1,
'["pos.execute", "dashboard.read"]'::JSONB, true)
ON CONFLICT (role_key) DO NOTHING;

-- ============================================
-- MIGRATION: UPDATE EXISTING STAFF
-- ============================================

-- Map existing staff roles to new role system
-- This assumes staff table exists with a role field
UPDATE staff
SET role_id = (SELECT id FROM roles WHERE role_key = LOWER(staff.role) LIMIT 1)
WHERE role_id IS NULL AND role IS NOT NULL;

-- Set default scope for staff without scope
UPDATE staff
SET 
    scope_type = 'STORE',
    scope_store_ids = ARRAY[store_id],
    capabilities = compute_staff_capabilities(id)
WHERE scope_type IS NULL OR scope_store_ids IS NULL;
