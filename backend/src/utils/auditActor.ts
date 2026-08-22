import { FastifyRequest } from "fastify";

const ACTOR_FIELDS = new Set([
  "created_by",
  "updated_by",
  "approved_by",
  "requested_by",
  "received_by",
  "shipped_by",
  "opened_by",
  "closed_by",
  "reconciled_by",
  "resolved_by",
  "assigned_by",
  "rotated_by",
  "reported_by",
  "generated_by",
  "enrolled_by",
  "verified_by",
  "merged_by",
  "corrected_by",
  "processed_by",
  "published_by",
  "retired_by",
  "posted_by",
  "voided_by",
  "registered_by",
  "cancelled_by",
  "failed_by",
]);

/** Prevent clients from forging audit attribution fields accepted by legacy APIs. */
export function bindAuthenticatedAuditActor(request: FastifyRequest): void {
  const body = request.body;
  const actorId = (request.user as { id?: string } | undefined)?.id;
  if (!actorId || !body || typeof body !== "object" || Array.isArray(body)) {
    return;
  }
  const record = body as Record<string, unknown>;
  for (const field of ACTOR_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      record[field] = actorId;
    }
  }
  if (Object.prototype.hasOwnProperty.call(record, "actor")) {
    record.actor = actorId;
  }
  if (Object.prototype.hasOwnProperty.call(record, "user_id")) {
    record.user_id = actorId;
  }
  if (Object.prototype.hasOwnProperty.call(record, "user_type")) {
    record.user_type = "STAFF";
  }
  if (Object.prototype.hasOwnProperty.call(record, "ip_address")) {
    record.ip_address = request.ip;
  }
  if (Object.prototype.hasOwnProperty.call(record, "user_agent")) {
    record.user_agent = request.headers["user-agent"] || null;
  }
  if (Object.prototype.hasOwnProperty.call(record, "request_id")) {
    record.request_id = request.id;
  }
}
