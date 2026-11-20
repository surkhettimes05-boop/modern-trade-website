CREATE UNIQUE INDEX member_pricing_quotes_sale_reference_key
  ON member_pricing_quotes(claimed_sale_reference)
  WHERE claimed_sale_reference IS NOT NULL;

DROP INDEX IF EXISTS idx_member_pricing_quotes_sale_reference;
