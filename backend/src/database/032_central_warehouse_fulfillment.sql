-- Customer web orders are fulfilled from PASALO's central warehouse. Commerce
-- keeps store tables for staff POS and legacy data, but new web orders and
-- web stock reservations do not belong to an individual store.
ALTER TABLE web_orders ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE stock_reservations ALTER COLUMN store_id DROP NOT NULL;
