import { normalizePhone } from "../utils/phoneNormalization.js";

const MAX_DEMO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface DemoOtpConfig {
  phone: string;
  code: string;
  expiresAt: Date;
}

export function getDemoOtpConfig(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): DemoOtpConfig {
  const configuredPhone = env.OTP_DEMO_PHONE?.trim();
  const code = env.OTP_DEMO_CODE?.trim();
  const rawExpiry = env.OTP_DEMO_EXPIRES_AT?.trim();

  if (!configuredPhone || !code || !rawExpiry) {
    throw new Error("Demo OTP is not completely configured");
  }
  if (!/^\d{6}$/.test(code)) {
    throw new Error("OTP_DEMO_CODE must contain exactly 6 digits");
  }

  const expiresAt = new Date(rawExpiry);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error("OTP_DEMO_EXPIRES_AT must be a valid ISO timestamp");
  }
  if (expiresAt.getTime() <= now.getTime()) {
    throw new Error("Demo OTP access has expired");
  }
  if (expiresAt.getTime() - now.getTime() > MAX_DEMO_WINDOW_MS) {
    throw new Error("Demo OTP access cannot be enabled for more than 7 days");
  }

  return {
    phone: normalizePhone(configuredPhone),
    code,
    expiresAt,
  };
}

export function getDemoOtpCodeForPhone(
  phone: string,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): string {
  const config = getDemoOtpConfig(env, now);
  if (normalizePhone(phone) !== config.phone) {
    throw new Error("Demo OTP is unavailable for this phone number");
  }
  return config.code;
}
