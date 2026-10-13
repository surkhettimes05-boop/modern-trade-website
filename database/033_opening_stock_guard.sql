-- Opening stock is append-only inventory evidence.
-- reference_id is the client-generated operation UUID and is unique for this
-- transaction type, making retries safe without adding a mutable stock field.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_transactions_opening_stock_reference
ON inventory_transactions(reference_id)
WHERE reference_type = 'OPENING_STOCK' AND reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_cod_inventory_rewrite() RETURNS trigger AS $$
BEGIN
  IF OLD.reference_type IN ('COD_ORDER', 'CASH_POS', 'OPENING_STOCK') THEN
    RAISE EXCEPTION 'Inventory evidence is immutable; append a compensating entry';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
