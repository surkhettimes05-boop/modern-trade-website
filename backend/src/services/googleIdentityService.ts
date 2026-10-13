import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as verifySignature,
} from "node:crypto";
import { query } from "../database/connection.js";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000;
const LINK_ATTEMPT_TTL_MINUTES = 10;
const CLOCK_SKEW_SECONDS = 60;

interface GoogleJwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface GoogleJwtClaims {
  iss?: string;
  aud?: string | string[];
  azp?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  iat?: number;
  exp?: number;
}

interface Jwk {
  kty?: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

interface GoogleJwks {
  keys?: Jwk[];
}

export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  emailVerified: true;
  displayName?: string;
  pictureUrl?: string;
}

export interface GoogleLinkAttempt {
  id: string;
  provider_uid: string;
  email: string | null;
  email_verified: boolean;
  display_name: string | null;
}

let jwksCache:
  | {
      expiresAt: number;
      keys: Map<string, Jwk>;
    }
  | undefined;

function parseJwtPart<T>(part: string): T {
  const decoded = Buffer.from(part, "base64url").toString("utf8");
  return JSON.parse(decoded) as T;
}

function configuredClientIds(): string[] {
  const configured =
    process.env.GOOGLE_OAUTH_CLIENT_IDS || process.env.GOOGLE_WEB_CLIENT_ID || "";
  return configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function maxAgeMs(cacheControl: string | null): number {
  const match = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Number.parseInt(match[1], 10) * 1000 : DEFAULT_JWKS_TTL_MS;
}

async function loadGoogleJwks(): Promise<Map<string, Jwk>> {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys;

  const response = await fetch(GOOGLE_JWKS_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error("Google identity verification is temporarily unavailable");
  }

  const body = (await response.json()) as GoogleJwks;
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error("Google identity verification keys are unavailable");
  }

  const keys = new Map<string, Jwk>();
  for (const key of body.keys) {
    if (typeof key.kid === "string" && key.kid) keys.set(key.kid, key);
  }
  if (keys.size === 0) {
    throw new Error("Google identity verification keys are unavailable");
  }

  jwksCache = {
    keys,
    expiresAt: now + Math.max(60_000, maxAgeMs(response.headers.get("cache-control"))),
  };
  return keys;
}

export async function verifyGoogleIdToken(
  idToken: string,
): Promise<VerifiedGoogleIdentity> {
  const clientIds = configuredClientIds();
  if (clientIds.length === 0) {
    throw new Error("Google sign-in is not configured");
  }

  if (idToken.length > 16_384) throw new Error("Invalid Google identity token");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid Google identity token");

  let header: GoogleJwtHeader;
  let claims: GoogleJwtClaims;
  try {
    header = parseJwtPart<GoogleJwtHeader>(parts[0]);
    claims = parseJwtPart<GoogleJwtClaims>(parts[1]);
  } catch {
    throw new Error("Invalid Google identity token");
  }

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Invalid Google identity token");
  }

  const keys = await loadGoogleJwks();
  let jwk = keys.get(header.kid);
  if (!jwk) {
    jwksCache = undefined;
    jwk = (await loadGoogleJwks()).get(header.kid);
  }
  if (!jwk) throw new Error("Invalid Google identity token");

  let publicKey;
  try {
    publicKey = createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    throw new Error("Invalid Google identity token");
  }

  const signatureValid = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    publicKey,
    Buffer.from(parts[2], "base64url"),
  );
  if (!signatureValid) throw new Error("Invalid Google identity token");

  const now = Math.floor(Date.now() / 1000);
  const issuerValid =
    claims.iss === "https://accounts.google.com" ||
    claims.iss === "accounts.google.com";
  const audiences = Array.isArray(claims.aud)
    ? claims.aud
    : typeof claims.aud === "string"
      ? [claims.aud]
      : [];
  const audienceValid = audiences.some((audience) => clientIds.includes(audience));
  const authorizedPartyValid =
    !claims.azp || clientIds.includes(claims.azp);

  if (
    !issuerValid ||
    !audienceValid ||
    !authorizedPartyValid ||
    !claims.sub ||
    typeof claims.exp !== "number" ||
    claims.exp <= now - CLOCK_SKEW_SECONDS ||
    (typeof claims.iat === "number" && claims.iat > now + CLOCK_SKEW_SECONDS)
  ) {
    throw new Error("Invalid Google identity token");
  }

  const emailVerified =
    claims.email_verified === true || claims.email_verified === "true";
  const email = typeof claims.email === "string" ? claims.email.trim() : "";
  if (!emailVerified || !email) {
    throw new Error("A verified Google email is required");
  }

  return {
    subject: claims.sub,
    email,
    emailVerified: true,
    displayName:
      typeof claims.name === "string" && claims.name.trim()
        ? claims.name.trim()
        : undefined,
    pictureUrl:
      typeof claims.picture === "string" && claims.picture
        ? claims.picture
        : undefined,
  };
}

export class GoogleIdentityService {
  async findLinkedCustomerId(providerUid: string): Promise<string | null> {
    const result = await query(
      `SELECT customer_id
         FROM customer_auth_identities
        WHERE provider = 'GOOGLE' AND provider_uid = $1`,
      [providerUid],
    );
    return result.rows[0]?.customer_id ?? null;
  }

  async markLogin(providerUid: string): Promise<void> {
    await query(
      `UPDATE customer_auth_identities
          SET last_login_at = CURRENT_TIMESTAMP
        WHERE provider = 'GOOGLE' AND provider_uid = $1`,
      [providerUid],
    );
  }

  async createLinkAttempt(
    identity: VerifiedGoogleIdentity,
    metadata: { ipAddress?: string; userAgent?: string },
  ): Promise<string> {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = this.linkTokenHash(rawToken);
    const expiresAt = new Date(
      Date.now() + LINK_ATTEMPT_TTL_MINUTES * 60 * 1000,
    );

    await query(
      `INSERT INTO customer_auth_link_attempts (
         token_hash, provider, provider_uid, email, email_verified, display_name,
         ip_address, user_agent, expires_at
       ) VALUES ($1, 'GOOGLE', $2, $3, TRUE, $4, $5, $6, $7)`,
      [
        tokenHash,
        identity.subject,
        identity.email,
        identity.displayName ?? null,
        metadata.ipAddress ?? null,
        metadata.userAgent ?? null,
        expiresAt,
      ],
    );
    return rawToken;
  }

  async getLinkAttempt(rawToken: string): Promise<GoogleLinkAttempt | null> {
    const result = await query(
      `SELECT id, provider_uid, email, email_verified, display_name
         FROM customer_auth_link_attempts
        WHERE token_hash = $1
          AND provider = 'GOOGLE'
          AND used_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
        LIMIT 1`,
      [this.linkTokenHash(rawToken)],
    );
    return result.rows[0] ?? null;
  }

  async attachIdentity(
    attempt: GoogleLinkAttempt,
    customerId: string,
  ): Promise<void> {
    const existing = await query(
      `SELECT customer_id
         FROM customer_auth_identities
        WHERE provider = 'GOOGLE' AND provider_uid = $1`,
      [attempt.provider_uid],
    );
    if (
      existing.rows.length > 0 &&
      existing.rows[0].customer_id !== customerId
    ) {
      throw new Error("Google identity is already linked to another customer");
    }

    await query(
      `INSERT INTO customer_auth_identities (
         customer_id, provider, provider_uid, email, email_verified,
         display_name, last_login_at
       ) VALUES ($1, 'GOOGLE', $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (provider, provider_uid)
       DO UPDATE SET
         email = EXCLUDED.email,
         email_verified = EXCLUDED.email_verified,
         display_name = COALESCE(EXCLUDED.display_name, customer_auth_identities.display_name),
         last_login_at = CURRENT_TIMESTAMP`,
      [
        customerId,
        attempt.provider_uid,
        attempt.email,
        attempt.email_verified,
        attempt.display_name,
      ],
    );

    const consumed = await query(
      `UPDATE customer_auth_link_attempts
          SET used_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND used_at IS NULL
        RETURNING id`,
      [attempt.id],
    );
    if (!consumed.rowCount) {
      throw new Error("Google linking attempt has already been used");
    }
  }

  private linkTokenHash(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }
}
