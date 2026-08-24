import { FastifyRequest } from "fastify";
import { query } from "../database/connection.js";
import type { AuthenticatedUser } from "../plugins/authorization.js";
import { logger, redactForLogs } from "../utils/logger.js";

type SecurityEventInput = {
  eventType: string;
  entityType: string;
  entityId?: string;
  actorId?: string;
  details?: Record<string, unknown>;
};

function boundedDetails(details: Record<string, unknown> = {}) {
  const redacted = redactForLogs(details) as Record<string, unknown>;
  const serialized = JSON.stringify(redacted);
  if (Buffer.byteLength(serialized, "utf8") <= 4096) return serialized;
  return JSON.stringify({ truncated: true });
}

export async function recordSecurityEvent(
  request: FastifyRequest,
  input: SecurityEventInput,
): Promise<void> {
  const actor = request.user as Partial<AuthenticatedUser> | undefined;
  try {
    await query(
      `INSERT INTO audit_events (
         event_type, entity_type, entity_id, actor_id, actor_role,
         actor_capabilities, actor_scope_type, actor_scope_store_ids,
         changes, ip_address, user_agent, correlation_id
       ) VALUES (
         $1, $2, $3::uuid, $4::uuid, $5, $6::jsonb, $7, $8::uuid[],
         $9::jsonb, $10, $11, $12
       )`,
      [
        input.eventType.slice(0, 50),
        input.entityType.slice(0, 50),
        input.entityId || null,
        input.actorId || actor?.id || null,
        actor?.roleKey || null,
        JSON.stringify(actor?.capabilities || []),
        actor?.scopeType || null,
        actor?.scopeStoreIds || [],
        boundedDetails(input.details),
        request.ip?.slice(0, 45) || null,
        request.headers["user-agent"]?.slice(0, 512) || null,
        request.id,
      ],
    );
  } catch (error) {
    logger.error("Security audit event write failed", {
      eventType: input.eventType,
      errorCode:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "AUDIT_WRITE_FAILED",
    });
  }
}
