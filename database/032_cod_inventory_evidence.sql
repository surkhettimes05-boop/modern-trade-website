-- Preserve COD inventory evidence; corrections must be compensating entries.
CREATE OR REPLACE FUNCTION reject_cod_inventory_rewrite() RETURNS trigger AS $$
BEGIN
  IF OLD.reference_type IN ('COD_ORDER', 'CASH_POS') THEN
    RAISE EXCEPTION 'COD inventory evidence is immutable; append a compensating entry';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER cod_inventory_evidence_immutable
BEFORE UPDATE OR DELETE ON inventory_transactions
FOR EACH ROW EXECUTE FUNCTION reject_cod_inventory_rewrite();
