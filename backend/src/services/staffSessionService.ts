import crypto from "node:crypto";
import { query } from "../database/connection.js";

export const STAFF_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const STAFF_SESSION_TTL_SECONDS = 8 * 60 * 60;

export function newCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createStaffSession(input: {
  staffId: string;
  sessionToken: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `INSERT INTO sessions (staff_id, session_token, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.staffId,
      input.sessionToken,
      input.ipAddress || null,
      input.userAgent || null,
      input.expiresAt,
    ],
  );
}

export async function validateStaffSession(
  staffId: string,
  sessionToken: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE sessions
        SET last_activity_at = NOW()
      WHERE staff_id = $1 AND session_token = $2 AND is_revoked = FALSE
        AND expires_at > NOW()
        AND last_activity_at > NOW() - ($3 * INTERVAL '1 millisecond')
      RETURNING id`,
    [staffId, sessionToken, STAFF_IDLE_TIMEOUT_MS],
  );
  return result.rowCount === 1;
}

export async function revokeStaffSession(
  sessionToken: string,
  reason: string,
): Promise<void> {
  await query(
    `UPDATE sessions SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = $2
     WHERE session_token = $1 AND is_revoked = FALSE`,
    [sessionToken, reason],
  );
}
