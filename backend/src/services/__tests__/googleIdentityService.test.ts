import {
  generateKeyPairSync,
  sign as signPayload,
  type KeyObject,
} from "node:crypto";
import { verifyGoogleIdToken } from "../googleIdentityService.js";

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createToken(
  privateKey: KeyObject,
  claims: Record<string, unknown>,
): string {
  const header = encodeJson({ alg: "RS256", typ: "JWT", kid: "test-google-key" });
  const payload = encodeJson(claims);
  const input = `${header}.${payload}`;
  const signature = signPayload("RSA-SHA256", Buffer.from(input), privateKey);
  return `${input}.${signature.toString("base64url")}`;
}

describe("Google ID token verification", () => {
  const originalFetch = global.fetch;
  const originalClientIds = process.env.GOOGLE_OAUTH_CLIENT_IDS;
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: "jwk" });

  beforeAll(() => {
    process.env.GOOGLE_OAUTH_CLIENT_IDS = "web-client.apps.googleusercontent.com";
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          keys: [
            {
              ...publicJwk,
              kid: "test-google-key",
              alg: "RS256",
              use: "sig",
            },
          ],
        }),
        {
          status: 200,
          headers: { "cache-control": "public, max-age=3600" },
        },
      ),
    ) as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalClientIds === undefined) {
      delete process.env.GOOGLE_OAUTH_CLIENT_IDS;
    } else {
      process.env.GOOGLE_OAUTH_CLIENT_IDS = originalClientIds;
    }
  });

  it("accepts a signed token for the configured Google audience", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createToken(privateKey, {
      iss: "https://accounts.google.com",
      aud: "web-client.apps.googleusercontent.com",
      sub: "google-user-123",
      email: "customer@example.com",
      email_verified: true,
      name: "Customer Name",
      iat: now,
      exp: now + 600,
    });

    await expect(verifyGoogleIdToken(token)).resolves.toMatchObject({
      subject: "google-user-123",
      email: "customer@example.com",
      emailVerified: true,
      displayName: "Customer Name",
    });
  });

  it("rejects a token minted for another OAuth client", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createToken(privateKey, {
      iss: "https://accounts.google.com",
      aud: "attacker.apps.googleusercontent.com",
      sub: "google-user-123",
      email: "customer@example.com",
      email_verified: true,
      iat: now,
      exp: now + 600,
    });

    await expect(verifyGoogleIdToken(token)).rejects.toThrow(
      "Invalid Google identity token",
    );
  });

  it("requires a verified Google email", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createToken(privateKey, {
      iss: "accounts.google.com",
      aud: "web-client.apps.googleusercontent.com",
      sub: "google-user-456",
      email: "customer@example.com",
      email_verified: false,
      iat: now,
      exp: now + 600,
    });

    await expect(verifyGoogleIdToken(token)).rejects.toThrow(
      "A verified Google email is required",
    );
  });
});
