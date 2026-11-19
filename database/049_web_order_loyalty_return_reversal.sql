CREATE OR REPLACE FUNCTION loyalty_mvp_order_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'DELIVERED'
     AND OLD.status IS DISTINCT FROM 'DELIVERED'
     AND NEW.payment_method = 'COD' THEN
    PERFORM loyalty_mvp_post_earn(
      NEW.customer_id,
      NEW.store_id,
      'COD_ORDER',
      NEW.id,
      NEW.total_amount,
      NEW.currency,
      'ORDER_LIFECYCLE'
    );
  ELSIF NEW.status IN ('CANCELLED', 'REFUNDED')
        AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM loyalty_mvp_reverse_earn(
      'COD_ORDER',
      NEW.id,
      NEW.status,
      NEW.id,
      'COD order ' || lower(NEW.status),
      'ORDER_LIFECYCLE'
    );
  END IF;
  RETURN NEW;
END
$$;
