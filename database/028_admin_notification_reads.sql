-- Per-staff read state for operational admin alerts. Alert contents remain
-- derived from source-of-truth retail tables; only acknowledgement is stored.
CREATE TABLE IF NOT EXISTS admin_notification_reads (
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  notification_key VARCHAR(255) NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (staff_id, notification_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_notification_reads_staff_read
  ON admin_notification_reads (staff_id, read_at DESC);

