-- Unified Campaign Manager
-- Extends the existing offers table so one campaign can drive website/app creative
-- and optionally link to an existing promotion rule.

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subtitle_en VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subtitle_ne VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cta_text_en VARCHAR(120),
  ADD COLUMN IF NOT EXISTS cta_text_ne VARCHAR(120),
  ADD COLUMN IF NOT EXISTS cta_url TEXT,
  ADD COLUMN IF NOT EXISTS mobile_banner_image_url TEXT,
  ADD COLUMN IF NOT EXISTS channels TEXT[] NOT NULL DEFAULT ARRAY['WEB','APP']::TEXT[],
  ADD COLUMN IF NOT EXISTS placements TEXT[] NOT NULL DEFAULT ARRAY['OFFERS_PAGE']::TEXT[],
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;

UPDATE offers
SET name = COALESCE(NULLIF(name, ''), title_en)
WHERE name IS NULL OR name = '';

UPDATE offers
SET channels = ARRAY['WEB','APP']::TEXT[]
WHERE channels IS NULL OR cardinality(channels) = 0;

UPDATE offers
SET placements = CASE
  WHEN COALESCE(is_featured, FALSE) THEN ARRAY['HOME_HERO','OFFERS_PAGE']::TEXT[]
  ELSE ARRAY['OFFERS_PAGE']::TEXT[]
END
WHERE placements IS NULL OR cardinality(placements) = 0;

ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_channels_allowed;
ALTER TABLE offers ADD CONSTRAINT offers_channels_allowed CHECK (
  channels <@ ARRAY['WEB','APP']::TEXT[]
  AND cardinality(channels) > 0
);

ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_placements_allowed;
ALTER TABLE offers ADD CONSTRAINT offers_placements_allowed CHECK (
  placements <@ ARRAY['HOME_HERO','OFFERS_PAGE','CATEGORY_BANNER','APP_HOME']::TEXT[]
  AND cardinality(placements) > 0
);

CREATE INDEX IF NOT EXISTS idx_offers_channels ON offers USING GIN(channels);
CREATE INDEX IF NOT EXISTS idx_offers_placements ON offers USING GIN(placements);
CREATE INDEX IF NOT EXISTS idx_offers_store ON offers(store_id);
CREATE INDEX IF NOT EXISTS idx_offers_promotion ON offers(promotion_id);
