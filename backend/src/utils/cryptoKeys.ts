import crypto from "node:crypto";

export function masterEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): Buffer {
  const secret = env.ENCRYPTION_KEY;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("ENCRYPTION_KEY must be configured with at least 32 bytes");
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}
