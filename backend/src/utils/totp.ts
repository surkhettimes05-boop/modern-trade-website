import crypto from "node:crypto";
import { masterEncryptionKey } from "./cryptoKeys.js";

const PREFIX = "mfa:v1:";

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid MFA secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  if (!bytes.length) throw new Error("Invalid MFA secret");
  return Buffer.from(bytes);
}

export function encryptMfaSecret(secret: string): string {
  decodeBase32(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    masterEncryptionKey(),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(secret.trim().toUpperCase(), "utf8"),
    cipher.final(),
  ]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher
    .getAuthTag()
    .toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptMfaSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const [ivValue, tagValue, encryptedValue] = stored
    .slice(PREFIX.length)
    .split(":");
  if (!ivValue || !tagValue || !encryptedValue)
    throw new Error("Invalid encrypted MFA secret");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    masterEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function verifyTotp(
  storedSecret: string,
  code: string,
  now = Date.now(),
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = decodeBase32(decryptMfaSecret(storedSecret));
  const counter = Math.floor(now / 30_000);
  for (let window = -1; window <= 1; window += 1) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter + window));
    const digest = crypto.createHmac("sha1", secret).update(buffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const value =
      (((digest[offset] & 0x7f) << 24) |
        (digest[offset + 1] << 16) |
        (digest[offset + 2] << 8) |
        digest[offset + 3]) %
      1_000_000;
    const expected = value.toString().padStart(6, "0");
    if (crypto.timingSafeEqual(Buffer.from(code), Buffer.from(expected)))
      return true;
  }
  return false;
}
