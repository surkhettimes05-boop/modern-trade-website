CREATE TABLE IF NOT EXISTS stock_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id VARCHAR(100) UNIQUE NOT NULL,
    cart_id UUID REFERENCES shopping_carts(id) ON DELETE CASCADE,
    order_id UUID REFERENCES web_orders(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    store_id UUID NOT NULL REFERENCES stores(id),
    batch_id VARCHAR(100),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    reserved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_stock_reservations_cart
    ON stock_reservations(cart_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_order
    ON stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product
    ON stock_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_store
    ON stock_reservations(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_expires
    ON stock_reservations(expires_at)
    WHERE status = 'ACTIVE';

CREATE OR REPLACE FUNCTION generate_reservation_id()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'RES-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' ||
        SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
END;
$$ LANGUAGE plpgsql;
