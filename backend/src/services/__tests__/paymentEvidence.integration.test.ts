import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { query } from "../../database/connection.js";
import { PaymentService } from "../paymentService.js";
import { PaymentEvidenceService } from "../paymentEvidenceService.js";

test("MOCK_QR payment evidence completes exactly once and rejects mismatches", async () => {
  process.env.ENABLE_PAYMENT_MOCK = "true";
  expect(process.env.NODE_ENV).toBe("test");

  const seed = await readFile("../database/development_seed.sql", "utf8");
  await query(seed);

  const migration = await query(
    "SELECT COUNT(*) AS count FROM schema_migrations WHERE migration_id = '041_payment_evidence_engine'",
  );
  expect(migration.rows[0].count).toBe("1");

  const storeResult = await query(
    "SELECT id FROM stores WHERE name_en = 'Pasalho Birendranagar' LIMIT 1",
  );
  expect(storeResult.rows[0]).toBeDefined();
  const storeId = storeResult.rows[0].id;

  const payments = new PaymentService();
  const evidence = new PaymentEvidenceService();
  const amount = 347.5;
  const idempotencyKey = `payment-e2e-${randomUUID()}`;

  const intent = await payments.createPaymentIntent({
    provider: "MOCK_QR",
    amount_npr: amount,
    currency: "NPR",
    store_id: storeId,
    order_reference: `E2E-${randomUUID()}`,
    idempotency_key: idempotencyKey,
    created_by: "payment-e2e",
  });

  expect(intent.status).toBe("CREATED");
  expect(intent.provider).toBe("MOCK_QR");
  expect(intent.provider_metadata).toMatchObject({ sandbox: true });
  expect(intent.provider_metadata.qr_payload).toBe(
    `pasalho://pay?intent=${encodeURIComponent(intent.intent_number)}&amount=${amount}&currency=NPR`,
  );

  const repeatedIntent = await payments.createPaymentIntent({
    provider: "MOCK_QR",
    amount_npr: amount,
    currency: "NPR",
    store_id: storeId,
    idempotency_key: idempotencyKey,
    created_by: "payment-e2e",
  });
  expect(repeatedIntent.id).toBe(intent.id);

  const sourceReference = `SANDBOX-${randomUUID()}`;
  const completed = await evidence.confirmMockPayment({
    paymentIntentId: intent.id,
    sourceReference,
    amountNpr: amount,
    createdBy: "payment-e2e",
  });

  expect(completed.intent.status).toBe("COMPLETED");
  expect(completed.intent.provider_transaction_id).toBe(sourceReference);
  expect(completed.evidence).toMatchObject({
    payment_intent_id: intent.id,
    provider: "MOCK_QR",
    evidence_type: "SANDBOX_CONFIRMATION",
    source_reference: sourceReference,
    observed_status: "SUCCESS",
    trust_level: "OFFICIAL",
    verification_status: "VERIFIED",
  });

  const listedEvidence = await evidence.listForIntent(intent.id);
  expect(listedEvidence).toHaveLength(1);
  expect(listedEvidence[0].source_reference).toBe(sourceReference);

  const duplicate = await evidence.confirmMockPayment({
    paymentIntentId: intent.id,
    sourceReference,
    amountNpr: amount,
    createdBy: "payment-e2e",
  });
  expect(duplicate.intent.status).toBe("COMPLETED");
  expect(duplicate.intent.provider_transaction_id).toBe(sourceReference);
  const duplicateCount = await query(
    "SELECT COUNT(*) AS count FROM payment_evidence WHERE provider = 'MOCK_QR' AND source_reference = $1",
    [sourceReference],
  );
  expect(duplicateCount.rows[0].count).toBe("1");

  const mismatchIntent = await payments.createPaymentIntent({
    provider: "MOCK_QR",
    amount_npr: 500,
    store_id: storeId,
    idempotency_key: `payment-e2e-mismatch-${randomUUID()}`,
    created_by: "payment-e2e",
  });
  await expect(
    evidence.confirmMockPayment({
      paymentIntentId: mismatchIntent.id,
      sourceReference: `SANDBOX-${randomUUID()}`,
      amountNpr: 499,
      createdBy: "payment-e2e",
    }),
  ).rejects.toThrow("Payment amount does not match payment intent");
  const mismatchState = await query(
    "SELECT status, provider_transaction_id FROM payment_intents WHERE id = $1",
    [mismatchIntent.id],
  );
  expect(mismatchState.rows[0].status).toBe("CREATED");
  expect(mismatchState.rows[0].provider_transaction_id).toBeNull();

  const secondIntent = await payments.createPaymentIntent({
    provider: "MOCK_QR",
    amount_npr: amount,
    store_id: storeId,
    idempotency_key: `payment-e2e-second-${randomUUID()}`,
    created_by: "payment-e2e",
  });
  await expect(
    evidence.confirmMockPayment({
      paymentIntentId: secondIntent.id,
      sourceReference,
      amountNpr: amount,
      createdBy: "payment-e2e",
    }),
  ).rejects.toThrow("Payment evidence reference belongs to another intent");
  const secondState = await query(
    "SELECT status, provider_transaction_id FROM payment_intents WHERE id = $1",
    [secondIntent.id],
  );
  expect(secondState.rows[0].status).toBe("CREATED");
  expect(secondState.rows[0].provider_transaction_id).toBeNull();

  await expect(
    query("UPDATE payment_evidence SET observed_status = 'ALTERED' WHERE id = $1", [
      completed.evidence.id,
    ]),
  ).rejects.toThrow(/append-only/);
  await expect(
    query("DELETE FROM payment_evidence WHERE id = $1", [completed.evidence.id]),
  ).rejects.toThrow(/append-only/);
});
