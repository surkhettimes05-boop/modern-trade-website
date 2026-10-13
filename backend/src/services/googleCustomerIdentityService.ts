import { query } from "../database/connection.js";
import type { VerifiedGoogleIdentity } from "./googleIdentityService.js";

export interface LinkedGoogleCustomer {
  customer_id: string;
}

export async function findCustomerByGoogleSubject(
  subject: string,
): Promise<LinkedGoogleCustomer | null> {
  const result = await query(
    `SELECT customer_id
       FROM customer_external_identities
      WHERE provider = 'GOOGLE' AND provider_subject = $1
      LIMIT 1`,
    [subject],
  );
  return result.rows[0] ?? null;
}

export async function linkGoogleIdentityToCustomer(
  customerId: string,
  identity: VerifiedGoogleIdentity,
): Promise<void> {
  const inserted = await query(
    `INSERT INTO customer_external_identities (
       customer_id, provider, provider_subject, email, email_verified,
       display_name, avatar_url, last_login_at
     ) VALUES ($1, 'GOOGLE', $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (provider, provider_subject) DO NOTHING
     RETURNING customer_id`,
    [
      customerId,
      identity.subject,
      identity.email ?? null,
      identity.emailVerified,
      identity.displayName ?? null,
      identity.avatarUrl ?? null,
    ],
  );

  if (inserted.rowCount === 0) {
    const existing = await findCustomerByGoogleSubject(identity.subject);
    if (!existing || existing.customer_id !== customerId) {
      throw new Error("Google identity is already linked to another customer");
    }
    await touchGoogleIdentity(identity.subject, identity);
  }
}

export async function touchGoogleIdentity(
  subject: string,
  identity: VerifiedGoogleIdentity,
): Promise<void> {
  await query(
    `UPDATE customer_external_identities
        SET email = COALESCE($2, email),
            email_verified = $3,
            display_name = COALESCE($4, display_name),
            avatar_url = COALESCE($5, avatar_url),
            updated_at = CURRENT_TIMESTAMP,
            last_login_at = CURRENT_TIMESTAMP
      WHERE provider = 'GOOGLE' AND provider_subject = $1`,
    [
      subject,
      identity.email ?? null,
      identity.emailVerified,
      identity.displayName ?? null,
      identity.avatarUrl ?? null,
    ],
  );
}
