import { randomUUID } from "crypto";
import { query } from "../database/connection.js";
import { hashSessionToken } from "../utils/sessionToken.js";

interface Session {
  id: string;
  customer_id: string;
  session_token: string;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
  expires_at: Date;
  last_activity_at: Date;
  revoked_at?: Date;
  revoked_reason?: string;
}

interface CreateSessionInput {
  customer_id: string;
  ip_address?: string;
  user_agent?: string;
  expiry_hours?: number;
}

const DEFAULT_SESSION_HOURS = 24;

export class SessionService {
  /**
   * Create a new customer session
   */
  async createSession(input: CreateSessionInput): Promise<Session> {
    const sessionToken = randomUUID();
    const expiresAt = new Date(
      Date.now() +
        (input.expiry_hours || DEFAULT_SESSION_HOURS) * 60 * 60 * 1000,
    );

    const result = await query(
      `INSERT INTO customer_sessions (customer_id, session_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.customer_id,
        hashSessionToken(sessionToken),
        input.ip_address || null,
        input.user_agent || null,
        expiresAt,
      ],
    );

    return { ...result.rows[0], session_token: sessionToken };
  }

  /**
   * Validate a session token
   */
  async validateSession(sessionToken: string): Promise<Session | null> {
    const result = await query(
      `SELECT * FROM customer_sessions 
       WHERE session_token = $1 
         AND revoked_at IS NULL 
         AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC 
       LIMIT 1`,
      [hashSessionToken(sessionToken)],
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Avoid a database write on every authenticated request while keeping the
    // activity timestamp fresh enough for session-management displays.
    await query(
      `UPDATE customer_sessions
       SET last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND last_activity_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'`,
      [result.rows[0].id],
    );

    return result.rows[0];
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionToken: string, reason?: string): Promise<void> {
    await query(
      `UPDATE customer_sessions 
       SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $1 
       WHERE session_token = $2`,
      [reason || "User logout", hashSessionToken(sessionToken)],
    );
  }

  /**
   * Revoke all sessions for a customer
   */
  async revokeAllCustomerSessions(
    customerId: string,
    reason?: string,
  ): Promise<number> {
    const result = await query(
      `UPDATE customer_sessions 
       SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $1 
       WHERE customer_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [reason || "All sessions revoked", customerId],
    );
    return result.rowCount || 0;
  }

  /**
   * Get active sessions for a customer
   */
  async getCustomerSessions(customerId: string): Promise<Session[]> {
    const result = await query(
      `SELECT * FROM customer_sessions 
       WHERE customer_id = $1 
         AND revoked_at IS NULL 
         AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_activity_at DESC`,
      [customerId],
    );
    return result.rows;
  }

  /**
   * Clean up expired and revoked sessions (should be run periodically)
   */
  async cleanupOldSessions(): Promise<number> {
    const result = await query(
      `DELETE FROM customer_sessions 
       WHERE (revoked_at IS NOT NULL AND revoked_at < CURRENT_TIMESTAMP - INTERVAL '7 days')
          OR (expires_at < CURRENT_TIMESTAMP - INTERVAL '30 days')
       RETURNING id`,
    );
    return result.rowCount || 0;
  }

  /**
   * Get session statistics for monitoring
   */
  async getSessionStats(): Promise<any> {
    const result = await query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP THEN 1 END) as active,
        COUNT(CASE WHEN revoked_at IS NOT NULL THEN 1 END) as revoked,
        COUNT(CASE WHEN expires_at < CURRENT_TIMESTAMP THEN 1 END) as expired
      FROM customer_sessions`,
    );
    return result.rows[0];
  }
}
