-- 044_creator_purchase_cost_evidence
ALTER TABLE creator_purchase_events
  ADD COLUMN IF NOT EXISTS cogs_npr NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cost_status VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE creator_purchase_events
  DROP CONSTRAINT IF EXISTS creator_purchase_events_cost_status_check;
ALTER TABLE creator_purchase_events
  ADD CONSTRAINT creator_purchase_events_cost_status_check
  CHECK (cost_status IN ('VERIFIED','UNKNOWN'));

ALTER TABLE creator_purchase_events
  DROP CONSTRAINT IF EXISTS creator_purchase_events_verified_cost_required;
ALTER TABLE creator_purchase_events
  ADD CONSTRAINT creator_purchase_events_verified_cost_required
  CHECK (cost_status <> 'VERIFIED' OR cogs_npr IS NOT NULL);
