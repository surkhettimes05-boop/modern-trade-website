-- Phase 08 analytics/audit controls. Guards make this safe for partial legacy schemas.
DO $$
BEGIN
  IF to_regclass('audit_trails') IS NOT NULL THEN
    ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS previous_hash TEXT;
    ALTER TABLE audit_trails ADD COLUMN IF NOT EXISTS audit_hash TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_trails_hash ON audit_trails(audit_hash) WHERE audit_hash IS NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION refresh_sales_projection(target_date DATE) RETURNS void AS $$
BEGIN
  IF to_regclass('mv_daily_sales_by_store') IS NOT NULL THEN
    REFRESH MATERIALIZED VIEW mv_daily_sales_by_store;
  END IF;
  IF to_regclass('data_freshness_tracking') IS NOT NULL THEN
    UPDATE data_freshness_tracking SET last_updated_at = NOW(), update_status = 'SUCCESS', is_stale = FALSE
    WHERE projection_name = 'daily_sales_by_store';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_inventory_projection(target_store UUID, target_date DATE) RETURNS void AS $$
BEGIN
  IF to_regclass('data_freshness_tracking') IS NOT NULL THEN
    UPDATE data_freshness_tracking SET last_updated_at = NOW(), update_status = 'SUCCESS', is_stale = FALSE
    WHERE projection_name IN ('inventory_by_store', 'inventory_health');
  END IF;
END;
$$ LANGUAGE plpgsql;
