import { query } from "../database/connection.js";
import type { VerifiedFirebaseGoogleIdentity } from "./firebaseIdentityService.js";

const PROVIDER = "FIREBASE_GOOGLE";

export interface LinkedFirebaseGoogleCustomer {
  customer_id: string;
}

export async function findCustomerByFirebaseGoogleSubject(
  subject: string,
): Promise<LinkedFirebaseGoogleCustomer | null> {
  const result = await query(
    `SELECT customer_id
       FROM customer_external_identities
      WHERE provider = $1 AND provider_subject = $2
      LIMIT 1`,
    [PROVIDER, subject],
  );
  return result.rows[0] ?? null;
}

export async function linkFirebaseGoogleIdentityToCustomer(
  customerId: string,
  identity: VerifiedFirebaseGoogleIdentity,
): Promise<void> {
  const inserted = await query(
    `INSERT INTO customer_external_identities (
       customer_id, provider, provider_subject, email, email_verified,
       display_name, avatar_url, last_login_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
     ON CONFLICT (provider, provider_subject) DO NOTHING
     RETURNING customer_id`,
    [
      customerId,
      PROVIDER,
      identity.subject,
      identity.email ?? null,
      identity.emailVerified,
      identity.displayName ?? null,
      identity.avatarUrl ?? null,
    ],
  );

  if (inserted.rowCount === 0) {
    const existing = await findCustomerByFirebaseGoogleSubject(identity.subject);
    if (!existing || existing.customer_id !== customerId) {
      throw new Error(
        "Firebase Google identity is already linked to another customer",
      );
    }
    await touchFirebaseGoogleIdentity(identity.subject, identity);
  }
}

export async function touchFirebaseGoogleIdentity(
  subject: string,
  identity: VerifiedFirebaseGoogleIdentity,
): Promise<void> {
  await query(
    `UPDATE customer_external_identities
        SET email = COALESCE($3, email),
            email_verified = $4,
            display_name = COALESCE($5, display_name),
            avatar_url = COALESCE($6, avatar_url),
            updated_at = CURRENT_TIMESTAMP,
            last_login_at = CURRENT_TIMESTAMP
      WHERE provider = $1 AND provider_subject = $2`,
    [
      PROVIDER,
      subject,
      identity.email ?? null,
      identity.emailVerified,
      identity.displayName ?? null,
      identity.avatarUrl ?? null,
    ],
  );
}
