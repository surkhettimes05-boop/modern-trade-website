ALTER TABLE member_pricing_promotion_channels
  DROP CONSTRAINT IF EXISTS member_pricing_promotion_channels_channel_check;

ALTER TABLE member_pricing_promotion_channels
  ADD CONSTRAINT member_pricing_promotion_channels_channel_check
  CHECK (channel IN ('POS', 'WEB', 'APP', 'COD'));
