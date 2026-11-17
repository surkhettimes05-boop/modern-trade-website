-- 043_creator_profitability_cogs
-- Preserve the actual inventory cost consumed by each completed online order
-- and attach POS-provided cost snapshots to creator purchase events.
-- Missing cost evidence remains NULL; never estimate COGS from retail price.

ALTER TABLE web_order_items
  ADD COLUMN IF NOT EXISTS cost_total_snapshot NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cost_evidence_status VARCHAR(20) NOT NULL DEFAULT 'MISSING_COST';

DO $$
BEGIN
  ALTER TABLE web_order_items
    ADD CONSTRAINT web_order_items_cost_snapshot_nonnegative
    CHECK (cost_total_snapshot IS NULL OR cost_total_snapshot >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE web_order_items
    ADD CONSTRAINT web_order_items_cost_evidence_consistent
    CHECK (
      (cost_evidence_status = 'AVAILABLE' AND cost_total_snapshot IS NOT NULL)
      OR
      (cost_evidence_status = 'MISSING_COST' AND cost_total_snapshot IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE web_order_items
    ADD CONSTRAINT web_order_items_cost_evidence_status_valid
    CHECK (cost_evidence_status IN ('AVAILABLE', 'MISSING_COST'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE creator_purchase_events
  ADD COLUMN IF NOT EXISTS cost_of_goods_npr NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cost_evidence_status VARCHAR(20) NOT NULL DEFAULT 'MISSING_COST';

DO $$
BEGIN
  ALTER TABLE creator_purchase_events
    ADD CONSTRAINT creator_purchase_events_cogs_nonnegative
    CHECK (cost_of_goods_npr IS NULL OR cost_of_goods_npr >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE creator_purchase_events
    ADD CONSTRAINT creator_purchase_events_cost_evidence_consistent
    CHECK (
      (cost_evidence_status = 'AVAILABLE' AND cost_of_goods_npr IS NOT NULL)
      OR
      (cost_evidence_status = 'MISSING_COST' AND cost_of_goods_npr IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE creator_purchase_events
    ADD CONSTRAINT creator_purchase_events_cost_evidence_status_valid
    CHECK (cost_evidence_status IN ('AVAILABLE', 'MISSING_COST'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_creator_purchase_events_cost_coverage
  ON creator_purchase_events(created_at DESC, cost_evidence_status);
