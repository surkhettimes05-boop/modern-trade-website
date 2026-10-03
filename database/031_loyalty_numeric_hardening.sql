-- Prevent malformed numeric commerce data from blocking fulfillment.
-- Invalid price rows are disabled, and loyalty earning fails closed to zero
-- points instead of aborting the order lifecycle.

UPDATE product_prices
   SET active = FALSE
 WHERE price <= 0
    OR price::text IN ('NaN', 'Infinity', '-Infinity');

CREATE OR REPLACE FUNCTION loyalty_mvp_post_earn(
  p_customer UUID, p_store UUID, p_source_type TEXT, p_source_id UUID,
  p_amount NUMERIC, p_currency TEXT, p_actor TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_account customer_loyalty_accounts;
  v_program loyalty_programs;
  v_points_numeric NUMERIC;
  v_points INTEGER;
  v_entry UUID;
BEGIN
  IF p_customer IS NULL
     OR p_amount IS NULL
     OR p_currency <> 'NPR'
     OR p_amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_amount <= 0 THEN
    RETURN NULL;
  END IF;

  v_account := loyalty_mvp_account(p_customer, p_store);
  IF v_account.id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_program
    FROM loyalty_programs
   WHERE id = v_account.program_id;

  IF v_program.earn_npr_per_point IS NULL
     OR v_program.earn_npr_per_point <= 0 THEN
    RETURN NULL;
  END IF;

  v_points_numeric := floor(p_amount / v_program.earn_npr_per_point);
  IF v_points_numeric IS NULL
     OR v_points_numeric <= 0
     OR v_points_numeric > 2147483647 THEN
    RETURN NULL;
  END IF;
  v_points := v_points_numeric::INTEGER;

  SELECT id INTO v_entry
    FROM loyalty_ledger
   WHERE program_id = v_program.id
     AND source_type = p_source_type
     AND source_id = p_source_id
     AND entry_type = 'EARN'
     AND entry_status = 'POSTED';
  IF v_entry IS NOT NULL THEN RETURN v_entry; END IF;

  SELECT * INTO v_account
    FROM customer_loyalty_accounts
   WHERE id = v_account.id
   FOR UPDATE;

  INSERT INTO loyalty_ledger(
    customer_id, account_id, program_id, organization_id, points_signed,
    entry_type, entry_status, effective_timestamp, source_type, source_id,
    location_id, rule_version, idempotency_key, actor, reason, source_amount,
    currency, balance_after, calculation_metadata
  )
  VALUES (
    p_customer, v_account.id, v_program.id, v_account.organization_id, v_points,
    'EARN', 'POSTED', now(), p_source_type, p_source_id, p_store,
    v_program.rule_version,
    'loyalty:' || p_source_type || ':' || p_source_id || ':earn',
    p_actor, 'Completed confirmed purchase', p_amount, 'NPR',
    v_account.current_points + v_points,
    jsonb_build_object(
      'rule', 'floor(authoritative_npr / earn_npr_per_point)',
      'earn_npr_per_point', v_program.earn_npr_per_point,
      'rule_version', v_program.rule_version
    )
  )
  RETURNING id INTO v_entry;

  UPDATE customer_loyalty_accounts
     SET current_points = current_points + v_points,
         earned_points = earned_points + v_points,
         last_activity_at = now()
   WHERE id = v_account.id;

  RETURN v_entry;
END $$;
