import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPool } from "../database/connection.js";
import {
  authenticateCustomer,
  customerId,
} from "../middleware/customerAuthentication.js";

const CAMPAIGN_KEY = "FOUNDING_1000";

const joinSchema = z.object({
  display_name: z.string().trim().min(2).max(120),
  ward: z.string().trim().min(1).max(80),
  source: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,64}$/)
    .default("direct"),
});

function dto(row: Record<string, unknown>) {
  return {
    founder_number: Number(row.founder_number),
    display_name: String(row.display_name),
    ward: String(row.ward),
    acquisition_source: String(row.acquisition_source),
    joined_at: row.joined_at,
  };
}

export async function publicFoundingRoutes(fastify: FastifyInstance) {
  fastify.get("/founders/status", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=15, stale-while-revalidate=30");
    const result = await getPool().query(
      `SELECT capacity, allocated_count, active
         FROM founding_campaign_state
        WHERE campaign_key = $1`,
      [CAMPAIGN_KEY],
    );
    if (!result.rowCount) {
      return reply.status(503).send({ error: "Founding campaign unavailable" });
    }
    const row = result.rows[0];
    return {
      capacity: Number(row.capacity),
      joined: Number(row.allocated_count),
      remaining: Math.max(0, Number(row.capacity) - Number(row.allocated_count)),
      active: Boolean(row.active),
    };
  });
}

export async function foundingRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/founders/me",
    { onRequest: authenticateCustomer },
    async (request, reply) => {
      const result = await getPool().query(
        `SELECT founder_number, display_name, ward, acquisition_source, joined_at
           FROM founding_members
          WHERE campaign_key = $1 AND customer_id = $2`,
        [CAMPAIGN_KEY, customerId(request)],
      );
      if (!result.rowCount) {
        return reply.status(404).send({ error: "Not a Founding Customer" });
      }
      return { member: dto(result.rows[0]) };
    },
  );

  fastify.post(
    "/founders/join",
    {
      onRequest: authenticateCustomer,
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const input = joinSchema.parse(request.body);
      const authenticatedCustomerId = customerId(request);
      const client = await getPool().connect();

      try {
        await client.query("BEGIN");

        const existing = await client.query(
          `SELECT founder_number, display_name, ward, acquisition_source, joined_at
             FROM founding_members
            WHERE campaign_key = $1 AND customer_id = $2`,
          [CAMPAIGN_KEY, authenticatedCustomerId],
        );
        if (existing.rowCount) {
          await client.query("COMMIT");
          return { member: dto(existing.rows[0]), existing: true };
        }

        const state = await client.query(
          `SELECT capacity, allocated_count, active
             FROM founding_campaign_state
            WHERE campaign_key = $1
            FOR UPDATE`,
          [CAMPAIGN_KEY],
        );
        if (!state.rowCount || !state.rows[0].active) {
          await client.query("ROLLBACK");
          return reply.status(409).send({ error: "Founding campaign is closed" });
        }

        const capacity = Number(state.rows[0].capacity);
        const allocated = Number(state.rows[0].allocated_count);
        if (allocated >= capacity) {
          await client.query("ROLLBACK");
          return reply.status(409).send({ error: "All Founding Customer spots are filled" });
        }

        const founderNumber = allocated + 1;
        const created = await client.query(
          `INSERT INTO founding_members (
             campaign_key, customer_id, founder_number, display_name, ward, acquisition_source
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING founder_number, display_name, ward, acquisition_source, joined_at`,
          [
            CAMPAIGN_KEY,
            authenticatedCustomerId,
            founderNumber,
            input.display_name,
            input.ward,
            input.source,
          ],
        );

        await client.query(
          `UPDATE founding_campaign_state
              SET allocated_count = $2, updated_at = NOW()
            WHERE campaign_key = $1`,
          [CAMPAIGN_KEY, founderNumber],
        );
        await client.query("COMMIT");
        return reply.status(201).send({
          member: dto(created.rows[0]),
          existing: false,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  );
}
