-- Bound the founding campaign and give every organization a transactional
-- membership-number allocator.
COMMENT ON TABLE membership_campaign_state IS
  'Independent membership Founding 1000 campaign; separate from the legacy founding customer campaign.';

ALTER TABLE membership_campaign_state
  ADD CONSTRAINT membership_campaign_capacity_max_1000
    CHECK (capacity <= 1000);

ALTER TABLE membership_campaign_allocations
  ADD CONSTRAINT membership_campaign_number_range
    CHECK (membership_number BETWEEN 1 AND 1000);

ALTER TABLE customer_memberships
  ADD COLUMN founding_number INTEGER;

UPDATE customer_memberships m
   SET founding_number = a.membership_number
  FROM membership_campaign_allocations a
 WHERE a.membership_id = m.id
   AND m.tier_key = 'FOUNDING_1000';

ALTER TABLE customer_memberships
  ADD CONSTRAINT customer_membership_founding_number_range
    CHECK (founding_number IS NULL OR founding_number BETWEEN 1 AND 1000),
  ADD CONSTRAINT customer_membership_founding_tier_consistency
    CHECK (
      (tier_key = 'FOUNDING_1000' AND founding_number IS NOT NULL)
      OR (tier_key = 'REGISTERED_MEMBER' AND founding_number IS NULL)
    );

CREATE UNIQUE INDEX customer_membership_founding_number_unique
  ON customer_memberships(founding_number)
  WHERE founding_number IS NOT NULL;

CREATE TABLE membership_organization_sequences (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
  next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE membership_organization_sequences ENABLE ROW LEVEL SECURITY;

INSERT INTO membership_organization_sequences (organization_id, next_number)
SELECT organization_id, MAX(membership_number) + 1
  FROM customer_memberships
 GROUP BY organization_id
ON CONFLICT (organization_id) DO UPDATE
  SET next_number = GREATEST(
    membership_organization_sequences.next_number,
    EXCLUDED.next_number
  );

ALTER TABLE membership_status_history
  DROP CONSTRAINT IF EXISTS membership_status_history_membership_id_fkey,
  ADD CONSTRAINT membership_status_history_membership_id_fkey
    FOREIGN KEY (membership_id)
    REFERENCES customer_memberships(id)
    ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION enforce_membership_founder_allocation()
RETURNS TRIGGER AS $$
DECLARE
  membership_key UUID;
  membership_tier VARCHAR(40);
  membership_founder_number INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'customer_memberships' THEN
    membership_key := NEW.id;
    membership_tier := NEW.tier_key;
    membership_founder_number := NEW.founding_number;
  ELSE
    IF TG_OP = 'DELETE' THEN
      membership_key := OLD.membership_id;
    ELSE
      membership_key := NEW.membership_id;
    END IF;

    SELECT tier_key, founding_number
      INTO membership_tier, membership_founder_number
      FROM customer_memberships
     WHERE id = membership_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'membership allocation must reference an existing membership';
    END IF;
  END IF;

  IF membership_tier = 'REGISTERED_MEMBER'
     AND membership_founder_number IS NULL THEN
    RETURN NULL;
  END IF;

  IF membership_tier <> 'FOUNDING_1000'
     OR membership_founder_number IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM membership_campaign_allocations a
        WHERE a.membership_id = membership_key
          AND a.membership_number = membership_founder_number
          AND a.campaign_key = 'FOUNDING_1000'
     ) THEN
    RAISE EXCEPTION 'founding membership and allocation must match';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER customer_membership_founder_allocation_required
AFTER INSERT OR UPDATE ON customer_memberships
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_membership_founder_allocation();

CREATE CONSTRAINT TRIGGER membership_allocation_founder_membership_required
AFTER INSERT OR UPDATE ON membership_campaign_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_membership_founder_allocation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    REVOKE DELETE ON customer_memberships,
      membership_status_history,
      membership_campaign_state,
      membership_campaign_allocations
      FROM storesync_app;
    REVOKE UPDATE, DELETE ON membership_status_history,
      membership_campaign_allocations
      FROM storesync_app;

    CREATE POLICY storesync_backend_access
      ON membership_organization_sequences
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);

    GRANT SELECT, INSERT, UPDATE ON membership_organization_sequences
      TO storesync_app;
  END IF;
END
$$;
