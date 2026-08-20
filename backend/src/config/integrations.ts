export type IntegrationStatus = "ENABLED" | "DISABLED" | "MISCONFIGURED";

export interface IntegrationSnapshot {
  payments: {
    mode: "COD_ONLY";
    status: IntegrationStatus;
    providers: string[];
    deferredProviders: Record<"esewa" | "khalti" | "fonepay", IntegrationStatus>;
  };
  notifications: {
    mode: "OUTBOX_ONLY";
    status: IntegrationStatus;
    email: boolean;
    sms: boolean;
  };
  maps: { status: IntegrationStatus; provider: string | null };
}

const present = (env: NodeJS.ProcessEnv, key: string) =>
  Boolean(env[key]?.trim());

export function getIntegrationSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): IntegrationSnapshot {
  const emailConfigured =
    present(env, "EMAIL_PROVIDER") || present(env, "EMAIL_PROVIDER_API_KEY");
  const email =
    present(env, "EMAIL_PROVIDER") && present(env, "EMAIL_PROVIDER_API_KEY");
  const smsConfigured = present(env, "SMS_PROVIDER") ||
    present(env, "TWILIO_ACCOUNT_SID") ||
    present(env, "TWILIO_AUTH_TOKEN") ||
    present(env, "TWILIO_FROM_NUMBER");
  const sms =
    env.SMS_PROVIDER === "twilio" &&
    present(env, "TWILIO_ACCOUNT_SID") &&
    present(env, "TWILIO_AUTH_TOKEN") &&
    present(env, "TWILIO_FROM_NUMBER");
  const mapProvider = env.DEFAULT_MAP_PROVIDER?.trim() || null;
  const mapKey =
    mapProvider === "Baato"
      ? present(env, "BAATO_API_KEY")
      : mapProvider === "Galli"
        ? present(env, "GALLI_API_KEY")
        : false;
  const providerStatus = (keys: string[]): IntegrationStatus => {
    const count = keys.filter((key) => present(env, key)).length;
    return count === 0
      ? "DISABLED"
      : count === keys.length && env.ENABLE_ELECTRONIC_PAYMENTS === "true"
        ? "ENABLED"
        : "MISCONFIGURED";
  };
  return {
    payments: {
      mode: "COD_ONLY",
      status: "ENABLED",
      providers: ["COD", "CASH"],
      deferredProviders: {
        esewa: providerStatus(["ESEWA_MERCHANT_CODE", "ESEWA_SECRET_KEY"]),
        khalti: providerStatus(["KHALTI_SECRET_KEY", "KHALTI_PUBLIC_KEY"]),
        fonepay: providerStatus(["FONEPAY_MERCHANT_ID", "FONEPAY_SECRET_KEY"]),
      },
    },
    notifications: {
      mode: "OUTBOX_ONLY",
      status:
        !emailConfigured && !smsConfigured
          ? "DISABLED"
          : emailConfigured && !email
            ? "MISCONFIGURED"
            : smsConfigured && !sms
              ? "MISCONFIGURED"
              : "ENABLED",
      email,
      sms,
    },
    maps: {
      status: mapProvider
        ? mapKey
          ? "ENABLED"
          : "MISCONFIGURED"
        : "DISABLED",
      provider: mapProvider,
    },
  };
}

export function validateProductionIntegrations(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== "production") return;
  if (env.ENABLE_ELECTRONIC_PAYMENTS === "true") {
    throw new Error(
      "Electronic payments are disabled until a certified provider adapter is installed",
    );
  }
  if (
    env.DEFAULT_MAP_PROVIDER &&
    !["Baato", "Galli"].includes(env.DEFAULT_MAP_PROVIDER)
  ) {
    throw new Error("DEFAULT_MAP_PROVIDER must be Baato or Galli");
  }
  if (env.DEFAULT_MAP_PROVIDER === "Baato" && !present(env, "BAATO_API_KEY")) {
    throw new Error(
      "BAATO_API_KEY is required when DEFAULT_MAP_PROVIDER=Baato",
    );
  }
  if (env.DEFAULT_MAP_PROVIDER === "Galli" && !present(env, "GALLI_API_KEY")) {
    throw new Error(
      "GALLI_API_KEY is required when DEFAULT_MAP_PROVIDER=Galli",
    );
  }
  if (
    present(env, "EMAIL_PROVIDER_API_KEY") !== present(env, "EMAIL_PROVIDER")
  ) {
    throw new Error(
      "EMAIL_PROVIDER and EMAIL_PROVIDER_API_KEY must be configured together",
    );
  }
  if (env.SMS_PROVIDER) {
    if (env.SMS_PROVIDER !== "twilio") {
      throw new Error("SMS_PROVIDER must be twilio");
    }
    for (const key of [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_FROM_NUMBER",
    ]) {
      if (!present(env, key)) {
        throw new Error(`${key} is required when SMS_PROVIDER=twilio`);
      }
    }
  }
}
