-- 041_payment_evidence_engine
-- Adds an append-only evidence trail for electronic payment reconciliation.
-- Provider credentials are not required for this schema. Production payment
-- activation remains controlled by the existing electronic-payment gate.

CREATE TABLE IF NOT EXISTS payment_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
    provider VARCHAR(32) NOT NULL,
    evidence_type VARCHAR(32) NOT NULL,
    source_reference VARCHAR(160) NOT NULL,
    amount_npr DECIMAL(12, 2) NOT NULL CHECK (amount_npr > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'NPR',
    observed_status VARCHAR(32) NOT NULL,
    trust_level VARCHAR(24) NOT NULL CHECK (
        trust_level IN ('OFFICIAL', 'BANK_CONFIRMED', 'OBSERVER', 'CUSTOMER')
    ),
    verification_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (
        verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')
    ),
    observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    raw_fingerprint VARCHAR(128),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by VARCHAR(100) NOT NULL DEFAULT 'system',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(provider, source_reference)
);

CREATE INDEX IF NOT EXISTS idx_payment_evidence_intent
    ON payment_evidence(payment_intent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_evidence_verification
    ON payment_evidence(verification_status, trust_level, created_at DESC);

-- Evidence is append-only. Corrections must be represented by a new evidence
-- record so the audit trail cannot be silently rewritten.
CREATE OR REPLACE FUNCTION prevent_payment_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'payment_evidence is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_evidence_no_update ON payment_evidence;
CREATE TRIGGER payment_evidence_no_update
    BEFORE UPDATE OR DELETE ON payment_evidence
    FOR EACH ROW EXECUTE FUNCTION prevent_payment_evidence_mutation();
