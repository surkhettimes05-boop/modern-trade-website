-- Nepal loyalty MVP: one organization program, immutable account ledger, and lifecycle hooks.

ALTER TABLE loyalty_programs
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS earn_npr_per_point INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS redemption_min_points INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS redemption_max_points INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS rule_version INTEGER NOT NULL DEFAULT 1;

UPDATE loyalty_programs lp
SET organization_id = s.organization_id
FROM stores s
WHERE lp.store_id = s.id AND lp.organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_program_org_active
  ON loyalty_programs(organization_id) WHERE is_active AND organization_id IS NOT NULL;

ALTER TABLE customer_loyalty_accounts
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

UPDATE customer_loyalty_accounts a
SET organization_id = p.organization_id
FROM loyalty_programs p
WHERE a.program_id = p.id AND a.organization_id IS NULL;

ALTER TABLE customer_loyalty_accounts
  DROP CONSTRAINT IF EXISTS customer_loyalty_accounts_current_points_check;
ALTER TABLE customer_loyalty_accounts
  ADD CONSTRAINT customer_loyalty_accounts_current_points_check CHECK (current_points >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_account_customer_org_program
  ON customer_loyalty_accounts(customer_id, organization_id, program_id);

ALTER TABLE loyalty_ledger
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES customer_loyalty_accounts(id),
  ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES loyalty_programs(id),
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS source_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'NPR',
  ADD COLUMN IF NOT EXISTS balance_after INTEGER;

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_account_time
  ON loyalty_ledger(account_id, effective_timestamp DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_earn_source
  ON loyalty_ledger(program_id, source_type, source_id)
  WHERE entry_type = 'EARN' AND entry_status = 'POSTED';
CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_reversal_reference
  ON loyalty_ledger(reversal_of_id, source_type, source_id)
  WHERE entry_type = 'REVERSAL' AND entry_status = 'POSTED';

INSERT INTO capabilities (capability_key, capability_name, description, category)
VALUES
  ('loyalty.read', 'Read loyalty', 'View scoped loyalty accounts and reconciliation', 'LOYALTY'),
  ('loyalty.redeem', 'Redeem loyalty', 'Redeem customer points against a sale', 'LOYALTY'),
  ('loyalty.adjust', 'Adjust loyalty', 'Post audited manual loyalty corrections', 'LOYALTY')
ON CONFLICT (capability_key) DO NOTHING;

UPDATE roles SET capabilities = (
  SELECT jsonb_agg(DISTINCT value)
  FROM jsonb_array_elements(capabilities || '["loyalty.read","loyalty.redeem","loyalty.adjust"]'::jsonb)
) WHERE role_key = 'platform_admin';

CREATE OR REPLACE FUNCTION loyalty_mvp_account(p_customer UUID, p_store UUID)
RETURNS customer_loyalty_accounts LANGUAGE plpgsql AS $$
DECLARE v_org UUID; v_program loyalty_programs; v_account customer_loyalty_accounts;
BEGIN
  SELECT organization_id INTO v_org FROM stores WHERE id = p_store;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Store has no organization'; END IF;
  SELECT * INTO v_program FROM loyalty_programs
    WHERE organization_id = v_org AND is_active
      AND (start_date IS NULL OR start_date <= now())
      AND (end_date IS NULL OR end_date >= now())
    ORDER BY created_at DESC LIMIT 1;
  IF v_program.id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO customer_loyalty_accounts(account_id, customer_id, program_id, organization_id, status, created_by, metadata)
  VALUES ('ACC-' || replace(gen_random_uuid()::text, '-', ''), p_customer, v_program.id, v_org, 'ACTIVE', 'SYSTEM', '{"mvp":true}'::jsonb)
  ON CONFLICT (customer_id, program_id) DO UPDATE SET organization_id = EXCLUDED.organization_id
  RETURNING * INTO v_account;
  RETURN v_account;
END $$;

CREATE OR REPLACE FUNCTION loyalty_mvp_post_earn(
  p_customer UUID, p_store UUID, p_source_type TEXT, p_source_id UUID,
  p_amount NUMERIC, p_currency TEXT, p_actor TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_account customer_loyalty_accounts; v_program loyalty_programs; v_points INTEGER; v_entry UUID;
BEGIN
  IF p_customer IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_currency <> 'NPR' THEN RETURN NULL; END IF;
  v_account := loyalty_mvp_account(p_customer, p_store);
  IF v_account.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_program FROM loyalty_programs WHERE id = v_account.program_id;
  v_points := floor(p_amount / v_program.earn_npr_per_point);
  IF v_points <= 0 THEN RETURN NULL; END IF;
  SELECT id INTO v_entry FROM loyalty_ledger
    WHERE program_id = v_program.id AND source_type = p_source_type AND source_id = p_source_id
      AND entry_type = 'EARN' AND entry_status = 'POSTED';
  IF v_entry IS NOT NULL THEN RETURN v_entry; END IF;
  SELECT * INTO v_account FROM customer_loyalty_accounts WHERE id = v_account.id FOR UPDATE;
  INSERT INTO loyalty_ledger(customer_id, account_id, program_id, organization_id, points_signed,
    entry_type, entry_status, effective_timestamp, source_type, source_id, location_id, rule_version,
    idempotency_key, actor, reason, source_amount, currency, balance_after, calculation_metadata)
  VALUES (p_customer, v_account.id, v_program.id, v_account.organization_id, v_points, 'EARN', 'POSTED', now(),
    p_source_type, p_source_id, p_store, v_program.rule_version,
    'loyalty:' || p_source_type || ':' || p_source_id || ':earn', p_actor, 'Completed confirmed purchase',
    p_amount, 'NPR', v_account.current_points + v_points,
    jsonb_build_object('rule','floor(authoritative_npr / earn_npr_per_point)','earn_npr_per_point',v_program.earn_npr_per_point,'rule_version',v_program.rule_version))
  RETURNING id INTO v_entry;
  UPDATE customer_loyalty_accounts SET current_points = current_points + v_points,
    earned_points = earned_points + v_points, last_activity_at = now() WHERE id = v_account.id;
  RETURN v_entry;
END $$;

CREATE OR REPLACE FUNCTION loyalty_mvp_reverse_earn(
  p_source_type TEXT, p_source_id UUID, p_reversal_type TEXT, p_reversal_id UUID, p_reason TEXT, p_actor TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_earn loyalty_ledger; v_account customer_loyalty_accounts; v_entry UUID; v_points INTEGER;
BEGIN
  SELECT * INTO v_earn FROM loyalty_ledger WHERE source_type = p_source_type AND source_id = p_source_id
    AND entry_type = 'EARN' AND entry_status = 'POSTED' ORDER BY created_at LIMIT 1;
  IF v_earn.id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_entry FROM loyalty_ledger WHERE reversal_of_id = v_earn.id
    AND source_type = p_reversal_type AND source_id = p_reversal_id AND entry_type = 'REVERSAL';
  IF v_entry IS NOT NULL THEN RETURN v_entry; END IF;
  SELECT * INTO v_account FROM customer_loyalty_accounts WHERE id = v_earn.account_id FOR UPDATE;
  v_points := LEAST(v_earn.points_signed, v_account.current_points);
  IF v_points <= 0 THEN RETURN NULL; END IF;
  INSERT INTO loyalty_ledger(customer_id, account_id, program_id, organization_id, points_signed,
    entry_type, entry_status, effective_timestamp, source_type, source_id, location_id, rule_version,
    idempotency_key, actor, reason, reversal_of_id, reversal_reason, source_amount, currency, balance_after, calculation_metadata)
  VALUES (v_earn.customer_id, v_earn.account_id, v_earn.program_id, v_earn.organization_id, -v_points,
    'REVERSAL', 'POSTED', now(), p_reversal_type, p_reversal_id, v_earn.location_id, v_earn.rule_version,
    'loyalty:' || p_reversal_type || ':' || p_reversal_id || ':reverse:' || v_earn.id,
    p_actor, p_reason, v_earn.id, p_reason, v_earn.source_amount, v_earn.currency,
    v_account.current_points - v_points, jsonb_build_object('original_points',v_earn.points_signed,'reversed_points',v_points))
  RETURNING id INTO v_entry;
  UPDATE customer_loyalty_accounts SET current_points = current_points - v_points,
    last_activity_at = now() WHERE id = v_account.id;
  RETURN v_entry;
END $$;

CREATE OR REPLACE FUNCTION loyalty_mvp_sale_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sale_status = 'COMPLETED' AND OLD.sale_status IS DISTINCT FROM 'COMPLETED' THEN
    PERFORM loyalty_mvp_post_earn(NEW.customer_id, NEW.store_id, 'POS_SALE', NEW.id, NEW.total_amount, NEW.currency, COALESCE(NEW.updated_by, NEW.created_by, 'SYSTEM'));
  ELSIF NEW.sale_status IN ('VOIDED','RETURNED') AND OLD.sale_status = 'COMPLETED' THEN
    PERFORM loyalty_mvp_reverse_earn('POS_SALE', NEW.id, NEW.sale_status, NEW.id, 'POS sale ' || lower(NEW.sale_status), COALESCE(NEW.updated_by, NEW.voided_by, 'SYSTEM'));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_loyalty_mvp_sale_event ON sales;
CREATE TRIGGER trg_loyalty_mvp_sale_event AFTER UPDATE OF sale_status ON sales
FOR EACH ROW EXECUTE FUNCTION loyalty_mvp_sale_event();

CREATE OR REPLACE FUNCTION loyalty_mvp_order_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'DELIVERED' AND OLD.status IS DISTINCT FROM 'DELIVERED'
     AND NEW.payment_method = 'COD' THEN
    PERFORM loyalty_mvp_post_earn(NEW.customer_id, NEW.store_id, 'COD_ORDER', NEW.id, NEW.total_amount, NEW.currency, 'ORDER_LIFECYCLE');
  ELSIF NEW.status IN ('CANCELLED','REFUNDED') AND OLD.status = 'DELIVERED' THEN
    PERFORM loyalty_mvp_reverse_earn('COD_ORDER', NEW.id, NEW.status, NEW.id, 'COD order ' || lower(NEW.status), 'ORDER_LIFECYCLE');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_loyalty_mvp_order_event ON web_orders;
CREATE TRIGGER trg_loyalty_mvp_order_event AFTER UPDATE OF status ON web_orders
FOR EACH ROW EXECUTE FUNCTION loyalty_mvp_order_event();

INSERT INTO loyalty_programs(program_id, organization_id, store_id, name, description,
  points_per_currency, currency_value_per_point, is_active, enable_tiers, earn_npr_per_point,
  redemption_min_points, redemption_max_points, rule_version, created_by, metadata)
SELECT 'NEPAL-PILOT-1', o.id, s.id, 'StoreSync Nepal Rewards',
  'Earn 1 point per NPR 100 on completed POS and delivered COD purchases.',
  0.01, 1.00, TRUE, FALSE, 100, 10, 5000, 1, 'MIGRATION_022',
  '{"market":"NP","currency":"NPR","locale":"en-NP","tiers":false,"mvp":true}'::jsonb
FROM organizations o
JOIN LATERAL (SELECT id FROM stores WHERE organization_id = o.id ORDER BY created_at LIMIT 1) s ON TRUE
WHERE o.country_code = 'NP'
ON CONFLICT (program_id) DO UPDATE SET is_active = TRUE, enable_tiers = FALSE,
  organization_id = EXCLUDED.organization_id, earn_npr_per_point = 100,
  redemption_min_points = 10, redemption_max_points = 5000, rule_version = 1;
