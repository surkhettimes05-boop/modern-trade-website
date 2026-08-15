-- ============================================
-- PHASE 4: E-COMMERCE READINESS SCHEMA
-- ============================================

-- ============================================
-- SHOPPING CARTS
-- ============================================

CREATE TABLE IF NOT EXISTS shopping_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    store_id UUID REFERENCES stores(id),
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, CONVERTED, ABANDONED, EXPIRED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_shopping_carts_customer ON shopping_carts(customer_id);
CREATE INDEX idx_shopping_carts_session ON shopping_carts(session_id);
CREATE INDEX idx_shopping_carts_store ON shopping_carts(store_id);
CREATE INDEX idx_shopping_carts_status ON shopping_carts(status);
CREATE INDEX idx_shopping_carts_expires ON shopping_carts(expires_at);

-- ============================================
-- CART ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    line_total DECIMAL(12, 2) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product ON cart_items(product_id);

-- ============================================
-- WEB ORDERS
-- ============================================

CREATE TABLE IF NOT EXISTS web_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(100) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    store_id UUID REFERENCES stores(id),
    order_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED, REFUNDED
    subtotal DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    shipping_amount DECIMAL(12, 2) DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NPR',
    payment_method VARCHAR(50),
    payment_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PAID, FAILED, REFUNDED
    payment_intent_id VARCHAR(255),
    
    -- Shipping information
    shipping_name VARCHAR(255),
    shipping_phone VARCHAR(50),
    shipping_address TEXT,
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(100),
    shipping_postal_code VARCHAR(20),
    shipping_country VARCHAR(100),
    
    -- Delivery information
    delivery_type VARCHAR(50), -- DELIVERY, PICKUP
    delivery_date DATE,
    delivery_time_slot VARCHAR(100),
    
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_web_orders_number ON web_orders(order_number);
CREATE INDEX idx_web_orders_customer ON web_orders(customer_id);
CREATE INDEX idx_web_orders_store ON web_orders(store_id);
CREATE INDEX idx_web_orders_status ON web_orders(status);
CREATE INDEX idx_web_orders_date ON web_orders(order_date);
CREATE INDEX idx_web_orders_payment_status ON web_orders(payment_status);

-- ============================================
-- WEB ORDER ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS web_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES web_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    line_total DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    line_total_with_tax DECIMAL(12, 2) NOT NULL,
    batch_id VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_web_order_items_order ON web_order_items(order_id);
CREATE INDEX idx_web_order_items_product ON web_order_items(product_id);

-- ============================================
-- ORDER FULFILLMENT
-- ============================================

CREATE TABLE IF NOT EXISTS order_fulfillment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES web_orders(id) ON DELETE CASCADE,
    fulfillment_type VARCHAR(50) NOT NULL, -- DELIVERY, PICKUP
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED
    assigned_to VARCHAR(100),
    assigned_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    tracking_number VARCHAR(255),
    carrier VARCHAR(100),
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_order_fulfillment_order ON order_fulfillment(order_id);
CREATE INDEX idx_order_fulfillment_status ON order_fulfillment(status);
CREATE INDEX idx_order_fulfillment_assigned ON order_fulfillment(assigned_to);

-- ============================================
-- PRODUCT IMAGES
-- ============================================

CREATE TABLE IF NOT EXISTS product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url VARCHAR(500) NOT NULL,
    alt_text VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_product_images_product ON product_images(product_id);
CREATE INDEX idx_product_images_primary ON product_images(product_id) WHERE is_primary = TRUE;

-- ============================================
-- PRODUCT REVIEWS
-- ============================================

CREATE TABLE IF NOT EXISTS product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id),
    order_id UUID REFERENCES web_orders(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    review TEXT,
    verified_purchase BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    helpful_count INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_product_reviews_product ON product_reviews(product_id);
CREATE INDEX idx_product_reviews_customer ON product_reviews(customer_id);
CREATE INDEX idx_product_reviews_status ON product_reviews(status);
CREATE INDEX idx_product_reviews_rating ON product_reviews(rating);

-- ============================================
-- WISHLISTS
-- ============================================

CREATE TABLE IF NOT EXISTS wishlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_wishlists_customer ON wishlists(customer_id);

-- ============================================
-- WISHLIST ITEMS
-- ============================================

CREATE TABLE IF NOT EXISTS wishlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,
    UNIQUE(wishlist_id, product_id)
);

CREATE INDEX idx_wishlist_items_wishlist ON wishlist_items(wishlist_id);
CREATE INDEX idx_wishlist_items_product ON wishlist_items(product_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate web order number
CREATE OR REPLACE FUNCTION generate_web_order_number()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'WO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('web_order_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Sequence for web orders
CREATE SEQUENCE IF NOT EXISTS web_order_seq START 1;

-- Function to update updated_at
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

CREATE TRIGGER update_shopping_carts_updated_at BEFORE UPDATE ON shopping_carts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cart_items_updated_at BEFORE UPDATE ON cart_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_web_orders_updated_at BEFORE UPDATE ON web_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_fulfillment_updated_at BEFORE UPDATE ON order_fulfillment
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_reviews_updated_at BEFORE UPDATE ON product_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wishlists_updated_at BEFORE UPDATE ON wishlists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
