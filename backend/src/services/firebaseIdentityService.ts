import {
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";

const FIREBASE_PUBLIC_KEYS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const DEFAULT_KEY_CACHE_MS = 60 * 60 * 1000;
const MAX_KEY_CACHE_MS = 6 * 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

interface FirebaseJwtHeader {
  alg?: string;
  kid?: string;
}

interface FirebaseJwtClaims {
  iss?: string;
  sub?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  auth_time?: number;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  firebase?: {
    sign_in_provider?: string;
  };
}

export interface VerifiedFirebaseGoogleIdentity {
  subject: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
}

export class FirebaseIdentityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseIdentityConfigurationError";
  }
}

export class InvalidFirebaseIdTokenError extends Error {
  constructor(message = "Invalid Firebase ID token") {
    super(message);
    this.name = "InvalidFirebaseIdTokenError";
  }
}

let cachedKeys = new Map<string, KeyObject>();
let keyCacheExpiresAt = 0;

function configuredProjectId(): string {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new FirebaseIdentityConfigurationError(
      "FIREBASE_PROJECT_ID is required for Firebase sign-in",
    );
  }
  return projectId;
}

function decodeJsonPart<T>(value: string): T {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    throw new InvalidFirebaseIdTokenError();
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

async function refreshFirebaseKeys(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(FIREBASE_PUBLIC_KEYS_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new InvalidFirebaseIdTokenError(
      "Firebase identity verification is temporarily unavailable",
    );
  }

  if (!response.ok) {
    throw new InvalidFirebaseIdTokenError(
      "Firebase identity verification is temporarily unavailable",
    );
  }

  let body: Record<string, string>;
  try {
    body = (await response.json()) as Record<string, string>;
  } catch {
    throw new InvalidFirebaseIdTokenError(
      "Firebase identity verification is temporarily unavailable",
    );
  }

  const nextKeys = new Map<string, KeyObject>();
  for (const [kid, certificate] of Object.entries(body)) {
    if (!kid || typeof certificate !== "string") continue;
    try {
      nextKeys.set(kid, createPublicKey(certificate));
    } catch {
      // Ignore malformed/unusable certificates and keep processing the set.
    }
  }

  if (nextKeys.size === 0) {
    throw new InvalidFirebaseIdTokenError(
      "Firebase identity verification is temporarily unavailable",
    );
  }

  cachedKeys = nextKeys;
  keyCacheExpiresAt =
    Date.now() + parseMaxAge(response.headers.get("cache-control"));
}

async function firebaseSigningKey(kid: string): Promise<KeyObject> {
  if (Date.now() >= keyCacheExpiresAt || !cachedKeys.has(kid)) {
    await refreshFirebaseKeys();
  }
  const key = cachedKeys.get(kid);
  if (!key) throw new InvalidFirebaseIdTokenError();
  return key;
}

function verifiedEmail(claims: FirebaseJwtClaims): {
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

export async function verifyFirebaseGoogleIdToken(
  token: string,
): Promise<VerifiedFirebaseGoogleIdentity> {
  const projectId = configuredProjectId();
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new InvalidFirebaseIdTokenError();
  }

  const header = decodeJsonPart<FirebaseJwtHeader>(parts[0]);
  const claims = decodeJsonPart<FirebaseJwtClaims>(parts[1]);
  if (header.alg !== "RS256" || !header.kid) {
    throw new InvalidFirebaseIdTokenError();
  }

  const key = await firebaseSigningKey(header.kid);
  const signedValue = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  const signature = Buffer.from(parts[2], "base64url");
  if (!verifySignature("RSA-SHA256", signedValue, key, signature)) {
    throw new InvalidFirebaseIdTokenError();
  }

  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (
    claims.iss !== expectedIssuer ||
    claims.aud !== projectId ||
    typeof claims.sub !== "string" ||
    claims.sub.length === 0 ||
    claims.sub.length > 128 ||
    typeof claims.exp !== "number" ||
    claims.exp < now - CLOCK_SKEW_SECONDS ||
    typeof claims.iat !== "number" ||
    claims.iat > now + CLOCK_SKEW_SECONDS ||
    typeof claims.auth_time !== "number" ||
    claims.auth_time > now + CLOCK_SKEW_SECONDS ||
    claims.firebase?.sign_in_provider !== "google.com"
  ) {
    throw new InvalidFirebaseIdTokenError();
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

export function resetFirebaseIdentityKeyCacheForTests(): void {
  cachedKeys = new Map();
  keyCacheExpiresAt = 0;
}
