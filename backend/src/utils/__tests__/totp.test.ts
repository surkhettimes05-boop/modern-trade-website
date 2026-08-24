import crypto from "node:crypto";
import { decryptMfaSecret, encryptMfaSecret, verifyTotp } from "../totp.js";

function codeFor(secret: string, now: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = crypto
    .createHmac("sha1", Buffer.from(bytes))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value =
    (((digest[offset] & 0x7f) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) %
    1_000_000;
  return value.toString().padStart(6, "0");
}

describe("TOTP", () => {
  const priorKey = process.env.ENCRYPTION_KEY;
  const secret = "JBSWY3DPEHPK3PXP";

  beforeAll(() => {
    process.env.ENCRYPTION_KEY =
      "test-encryption-key-that-is-at-least-32-bytes";
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = priorKey;
  });

  it("encrypts secrets and verifies a current code", () => {
    const now = 1_700_000_000_000;
    const encrypted = encryptMfaSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptMfaSecret(encrypted)).toBe(secret);
    expect(verifyTotp(encrypted, codeFor(secret, now), now)).toBe(true);
    expect(verifyTotp(encrypted, "000000", now)).toBe(false);
  });
});
