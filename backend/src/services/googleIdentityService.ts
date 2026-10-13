import {
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);
const DEFAULT_KEY_CACHE_MS = 60 * 60 * 1000;
const MAX_KEY_CACHE_MS = 6 * 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

interface GoogleJwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface GoogleJwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  azp?: string;
  exp?: number;
  iat?: number;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
}

interface GoogleJwksResponse {
  keys?: Array<Record<string, unknown> & { kid?: string; alg?: string; use?: string }>;
}

export interface VerifiedGoogleIdentity {
  subject: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
}

export class GoogleIdentityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleIdentityConfigurationError";
  }
}

export class InvalidGoogleIdTokenError extends Error {
  constructor(message = "Invalid Google ID token") {
    super(message);
    this.name = "InvalidGoogleIdTokenError";
  }
}

let cachedKeys = new Map<string, KeyObject>();
let keyCacheExpiresAt = 0;

function configuredClientId(): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new GoogleIdentityConfigurationError(
      "GOOGLE_OAUTH_CLIENT_ID is required for Google sign-in",
    );
  }
  return clientId;
}

function decodeJsonPart<T>(value: string): T {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    throw new InvalidGoogleIdTokenError();
  }
}

function parseMaxAge(cacheControl: string | null): number {
  if (!cacheControl) return DEFAULT_KEY_CACHE_MS;
  const match = /(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/i.exec(cacheControl);
  if (!match) return DEFAULT_KEY_CACHE_MS;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_KEY_CACHE_MS;
  return Math.min(seconds * 1000, MAX_KEY_CACHE_MS);
}

async function refreshGoogleKeys(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_JWKS_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new InvalidGoogleIdTokenError(
      "Google identity verification is temporarily unavailable",
    );
  }

  if (!response.ok) {
    throw new InvalidGoogleIdTokenError(
      "Google identity verification is temporarily unavailable",
    );
  }

  let body: GoogleJwksResponse;
  try {
    body = (await response.json()) as GoogleJwksResponse;
  } catch {
    throw new InvalidGoogleIdTokenError(
      "Google identity verification is temporarily unavailable",
    );
  }

  const nextKeys = new Map<string, KeyObject>();
  for (const jwk of body.keys || []) {
    if (!jwk.kid || (jwk.alg && jwk.alg !== "RS256")) continue;
    try {
      nextKeys.set(
        jwk.kid,
        createPublicKey(
          { key: jwk, format: "jwk" } as Parameters<typeof createPublicKey>[0],
        ),
      );
    } catch {
      // Ignore malformed/unusable keys and keep processing Google's key set.
    }
  }

  if (nextKeys.size === 0) {
    throw new InvalidGoogleIdTokenError(
      "Google identity verification is temporarily unavailable",
    );
  }

  cachedKeys = nextKeys;
  keyCacheExpiresAt =
    Date.now() + parseMaxAge(response.headers.get("cache-control"));
}

async function googleSigningKey(kid: string): Promise<KeyObject> {
  if (Date.now() >= keyCacheExpiresAt || !cachedKeys.has(kid)) {
    await refreshGoogleKeys();
  }

  const key = cachedKeys.get(kid);
  if (!key) throw new InvalidGoogleIdTokenError();
  return key;
}

function audienceMatches(
  audience: string | string[] | undefined,
  clientId: string,
): boolean {
  if (typeof audience === "string") return audience === clientId;
  return Array.isArray(audience) && audience.includes(clientId);
}

function verifiedEmail(claims: GoogleJwtClaims): {
  email?: string;
  verified: boolean;
} {
  const verified =
    claims.email_verified === true || claims.email_verified === "true";
  const email =
    verified && typeof claims.email === "string" && claims.email.trim()
      ? claims.email.trim().toLowerCase()
      : undefined;
  return { email, verified };
}

export async function verifyGoogleIdToken(
  token: string,
): Promise<VerifiedGoogleIdentity> {
  const clientId = configuredClientId();
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new InvalidGoogleIdTokenError();
  }

  const header = decodeJsonPart<GoogleJwtHeader>(parts[0]);
  const claims = decodeJsonPart<GoogleJwtClaims>(parts[1]);
  if (header.alg !== "RS256" || !header.kid) {
    throw new InvalidGoogleIdTokenError();
  }

  const key = await googleSigningKey(header.kid);
  const signedValue = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  const signature = Buffer.from(parts[2], "base64url");
  if (!verifySignature("RSA-SHA256", signedValue, key, signature)) {
    throw new InvalidGoogleIdTokenError();
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    !claims.iss ||
    !GOOGLE_ISSUERS.has(claims.iss) ||
    !claims.sub ||
    !audienceMatches(claims.aud, clientId) ||
    typeof claims.exp !== "number" ||
    claims.exp < now - CLOCK_SKEW_SECONDS ||
    (typeof claims.iat === "number" &&
      claims.iat > now + CLOCK_SKEW_SECONDS)
  ) {
    throw new InvalidGoogleIdTokenError();
  }

  if (
    Array.isArray(claims.aud) &&
    claims.aud.length > 1 &&
    claims.azp !== clientId
  ) {
    throw new InvalidGoogleIdTokenError();
  }

  const email = verifiedEmail(claims);
  return {
    subject: claims.sub,
    email: email.email,
    emailVerified: email.verified,
    displayName:
      typeof claims.name === "string" && claims.name.trim()
        ? claims.name.trim()
        : undefined,
    avatarUrl:
      typeof claims.picture === "string" && claims.picture.startsWith("https://")
        ? claims.picture
        : undefined,
  };
}

export function resetGoogleIdentityKeyCacheForTests(): void {
  cachedKeys = new Map();
  keyCacheExpiresAt = 0;
}
