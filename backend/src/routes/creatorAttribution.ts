import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPool } from "../database/connection.js";

const posSaleSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal("POS_SALE_COMPLETED"),
  sourceSystem: z.literal("POS"),
  sourceTransactionId: z.string().uuid(),
  sourceTransactionNumber: z.string().min(1).max(100),
  customerPhoneHash: z.string().regex(/^[a-f0-9]{64}$/),
  currency: z.literal("NPR"),
  eligibleSpendNpr: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
  completedAt: z.string().datetime(),
});

function verifySignature(timestamp: string, signature: string, body: string) {
  const secret = process.env.CREATOR_ATTRIBUTION_HMAC_SECRET;
  if (!secret || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function creatorAttributionRoutes(fastify: FastifyInstance) {
  fastify.post("/creator-attribution/pos-sales", async (request, reply) => {
    const timestamp = String(request.headers["x-pasalho-timestamp"] ?? "");
    const signature = String(request.headers["x-pasalho-signature"] ?? "");
    const eventKey = String(request.headers["x-pasalho-event-key"] ?? "");
    const body = JSON.stringify(request.body ?? {});

    if (!verifySignature(timestamp, signature, body)) {
      return reply.status(401).send({ error: "Invalid or expired event signature" });
    }
    if (!/^pos-sale:[0-9a-f-]{36}$/i.test(eventKey)) {
      return reply.status(400).send({ error: "Invalid event key" });
    }

    const parsed = posSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid POS attribution event", details: parsed.error.issues });
    }
    const event = parsed.data;
    if (eventKey !== `pos-sale:${event.sourceTransactionId}`) {
      return reply.status(409).send({ error: "Event key does not match transaction" });
    }

    const payloadHash = createHash("sha256").update(body).digest("hex");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const received = await client.query(
        `INSERT INTO creator_integration_events (source_system, event_key, payload_hash)
         VALUES ('POS', $1, $2)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING id`,
        [eventKey, payloadHash],
      );

      if (!received.rowCount) {
        const prior = await client.query(
          "SELECT payload_hash, processing_status FROM creator_integration_events WHERE event_key = $1",
          [eventKey],
        );
        if (prior.rows[0]?.payload_hash !== payloadHash) {
          await client.query("ROLLBACK");
          return reply.status(409).send({ error: "Idempotency payload conflict" });
        }
        await client.query("COMMIT");
        return { accepted: true, replay: true, status: prior.rows[0]?.processing_status };
      }

      const customer = await client.query(
        `SELECT id FROM customers
          WHERE phone_hash = $1 AND status = 'ACTIVE'
            AND verification_status = 'VERIFIED' AND deleted_at IS NULL
          LIMIT 1`,
        [event.customerPhoneHash],
      );
      if (!customer.rowCount) {
        await client.query(
          `UPDATE creator_integration_events
              SET processing_status = 'REJECTED', error_code = 'CUSTOMER_UNVERIFIED',
                  processed_at = NOW()
            WHERE event_key = $1`,
          [eventKey],
        );
        await client.query("COMMIT");
        return { accepted: true, attributed: false, reason: "CUSTOMER_UNVERIFIED" };
      }

      const attribution = await client.query(
        `SELECT a.creator_id
           FROM creator_customer_attributions a
           JOIN creators c ON c.id = a.creator_id AND c.status = 'ACTIVE'
          WHERE a.customer_id = $1`,
        [customer.rows[0].id],
      );
      if (!attribution.rowCount) {
        await client.query(
          `UPDATE creator_integration_events
              SET processing_status = 'PROCESSED', processed_at = NOW()
            WHERE event_key = $1`,
          [eventKey],
        );
        await client.query("COMMIT");
        return { accepted: true, attributed: false, reason: "NO_CREATOR_ATTRIBUTION" };
      }

      const settings = await client.query(
        "SELECT default_rate_percent, hold_days FROM creator_reward_settings WHERE id = 1",
      );
      const rate = settings.rows[0]?.default_rate_percent ?? "1.00";
      const holdDays = Number(settings.rows[0]?.hold_days ?? 14);
      const availableAt = new Date(Date.parse(event.completedAt) + holdDays * 86400000);

      const purchase = await client.query(
        `INSERT INTO creator_purchase_events (
           creator_id, customer_id, source_system, source_transaction_id,
           source_transaction_number, currency, eligible_spend_npr,
           reward_rate_percent, reward_amount_npr, event_status, eligible_at,
           available_at, payload_hash
         )
         VALUES (
           $1, $2, 'POS', $3, $4, 'NPR', $5::numeric, $6::numeric,
           ROUND($5::numeric * $6::numeric / 100, 2), 'PENDING',
           $7::timestamptz, $8::timestamptz, $9
         )
         ON CONFLICT (source_system, source_transaction_id) DO NOTHING
         RETURNING id, reward_amount_npr`,
        [
          attribution.rows[0].creator_id,
          customer.rows[0].id,
          event.sourceTransactionId,
          event.sourceTransactionNumber,
          event.eligibleSpendNpr,
          rate,
          event.completedAt,
          availableAt.toISOString(),
          payloadHash,
        ],
      );
      if (!purchase.rowCount) {
        await client.query("ROLLBACK");
        return reply.status(409).send({ error: "Purchase event already exists with another event key" });
      }

      await client.query(
        `INSERT INTO creator_reward_ledger (
           creator_id, purchase_event_id, entry_type, amount_npr,
           idempotency_key, note
         ) VALUES ($1, $2, 'EARN', $3::numeric, $4, 'Pending POS creator reward')`,
        [
          attribution.rows[0].creator_id,
          purchase.rows[0].id,
          purchase.rows[0].reward_amount_npr,
          `creator-earn:POS:${event.sourceTransactionId}`,
        ],
      );
      await client.query(
        `UPDATE creator_integration_events
            SET processing_status = 'PROCESSED', processed_at = NOW()
          WHERE event_key = $1`,
        [eventKey],
      );
      await client.query("COMMIT");
      return {
        accepted: true,
        attributed: true,
        rewardStatus: "PENDING",
        rewardAmountNpr: String(purchase.rows[0].reward_amount_npr),
        availableAt: availableAt.toISOString(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
