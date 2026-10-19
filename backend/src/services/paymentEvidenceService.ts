import { getPool, query } from "../database/connection.js";

export type PaymentEvidenceTrustLevel =
  | "OFFICIAL"
  | "BANK_CONFIRMED"
  | "OBSERVER"
  | "CUSTOMER";

export interface PaymentEvidenceInput {
  paymentIntentId: string;
  provider: string;
  evidenceType: string;
  sourceReference: string;
  amountNpr: number;
  currency?: string;
  observedStatus: string;
  trustLevel: PaymentEvidenceTrustLevel;
  observedAt?: Date;
  rawFingerprint?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}

export class PaymentEvidenceService {
  async listForIntent(paymentIntentId: string) {
    const result = await query(
      `SELECT id, payment_intent_id, provider, evidence_type, source_reference,
              amount_npr, currency, observed_status, trust_level,
              verification_status, observed_at, verified_at, metadata, created_at
         FROM payment_evidence
        WHERE payment_intent_id = $1
        ORDER BY created_at DESC`,
      [paymentIntentId],
    );
    return result.rows;
  }

  async record(input: PaymentEvidenceInput) {
    if (!Number.isFinite(input.amountNpr) || input.amountNpr <= 0) {
      throw new Error("Evidence amount must be greater than 0");
    }

    const intent = await query(
      "SELECT id, provider, amount AS amount_npr, currency, status FROM payment_intents WHERE id = $1",
      [input.paymentIntentId],
    );
    if (!intent.rows[0]) throw new Error("Payment intent not found");

    const expected = intent.rows[0];
    const currency = input.currency || "NPR";
    const amountMatches = Number(expected.amount_npr) === input.amountNpr;
    const currencyMatches = expected.currency === currency;
    const providerMatches =
      expected.provider === input.provider || expected.provider === "MOCK_QR";

    // Evidence may be retained even when it does not match. A mismatch must
    // never be promoted to VERIFIED because the audit trail is more valuable
    // than silently dropping suspicious observations.
    const verificationStatus =
      amountMatches &&
      currencyMatches &&
      providerMatches &&
      ["OFFICIAL", "BANK_CONFIRMED"].includes(input.trustLevel)
        ? "VERIFIED"
        : "PENDING";

    const result = await query(
      `INSERT INTO payment_evidence (
          payment_intent_id, provider, evidence_type, source_reference,
          amount_npr, currency, observed_status, trust_level,
          verification_status, observed_at, verified_at, raw_fingerprint,
          metadata, created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          CASE WHEN $9 = 'VERIFIED' THEN NOW() ELSE NULL END,
          $11,$12,$13
        )
        ON CONFLICT (provider, source_reference) DO NOTHING
        RETURNING *`,
      [
        input.paymentIntentId,
        input.provider,
        input.evidenceType,
        input.sourceReference,
        input.amountNpr,
        currency,
        input.observedStatus,
        input.trustLevel,
        verificationStatus,
        input.observedAt || new Date(),
        input.rawFingerprint || null,
        JSON.stringify(input.metadata || {}),
        input.createdBy || "system",
      ],
    );

    if (result.rows[0]) return result.rows[0];

    const existing = await query(
      "SELECT * FROM payment_evidence WHERE provider = $1 AND source_reference = $2",
      [input.provider, input.sourceReference],
    );
    return existing.rows[0];
  }

  async confirmMockPayment(params: {
    paymentIntentId: string;
    sourceReference: string;
    amountNpr: number;
    createdBy?: string;
  }) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Mock payment confirmation is disabled in production");
    }
    if (process.env.ENABLE_PAYMENT_MOCK !== "true") {
      throw new Error("Mock payment confirmation is disabled");
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const intentResult = await client.query(
        "SELECT * FROM payment_intents WHERE id = $1 FOR UPDATE",
        [params.paymentIntentId],
      );
      const intent = intentResult.rows[0];
      if (!intent) throw new Error("Payment intent not found");
      if (intent.provider !== "MOCK_QR") {
        throw new Error("Only MOCK_QR intents can be mock-confirmed");
      }
      if (Number(intent.amount) !== params.amountNpr) {
        throw new Error("Payment amount does not match payment intent");
      }

      const evidenceResult = await client.query(
        `INSERT INTO payment_evidence (
            payment_intent_id, provider, evidence_type, source_reference,
            amount_npr, currency, observed_status, trust_level,
            verification_status, observed_at, verified_at, metadata, created_by
          ) VALUES ($1,'MOCK_QR','SANDBOX_CONFIRMATION',$2,$3,$4,'SUCCESS',
                    'OFFICIAL','VERIFIED',NOW(),NOW(),$5,$6)
          ON CONFLICT (provider, source_reference) DO NOTHING
          RETURNING *`,
        [
          params.paymentIntentId,
          params.sourceReference,
          params.amountNpr,
          intent.currency,
          JSON.stringify({ sandbox: true }),
          params.createdBy || "system",
        ],
      );

      const existingEvidence =
        evidenceResult.rows[0] ||
        (
          await client.query(
            "SELECT * FROM payment_evidence WHERE provider = 'MOCK_QR' AND source_reference = $1",
            [params.sourceReference],
          )
        ).rows[0];

      if (existingEvidence.payment_intent_id !== params.paymentIntentId) {
        throw new Error("Payment evidence reference belongs to another intent");
      }

      await client.query(
        `UPDATE payment_intents
            SET status = 'COMPLETED',
                provider_intent_id = $2,
                completed_at = COALESCE(completed_at, NOW()),
                updated_at = NOW()
          WHERE id = $1 AND status IN ('CREATED','PENDING','PROCESSING','COMPLETED')`,
        [params.paymentIntentId, params.sourceReference],
      );

      const updated = await client.query(
        `SELECT *, intent_id AS intent_number, amount AS amount_npr,
                provider_intent_id AS provider_transaction_id
           FROM payment_intents WHERE id = $1`,
        [params.paymentIntentId],
      );
      await client.query("COMMIT");
      return { intent: updated.rows[0], evidence: existingEvidence };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
