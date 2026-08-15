-- Phase 07: prevent the same provider webhook from being processed twice.
-- Existing duplicate rows must be reviewed before applying this constraint.
DO $$
BEGIN
  IF to_regclass('payment_webhook_logs') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_webhooks_provider_id
      ON payment_webhook_logs (provider, webhook_id)
      WHERE webhook_id IS NOT NULL;
  END IF;
  IF to_regclass('notifications') IS NOT NULL THEN
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS failure_reason TEXT;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS consent_required BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;
