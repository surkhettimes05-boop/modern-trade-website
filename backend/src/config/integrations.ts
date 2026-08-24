export type IntegrationStatus = "ENABLED" | "DISABLED" | "MISCONFIGURED";

export interface IntegrationSnapshot {
  payments: {
    mode: "COD_ONLY";
    status: IntegrationStatus;
    providers: string[];
    deferredProviders: Record<
      "esewa" | "khalti" | "fonepay",
      IntegrationStatus
    >;
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
  const smsConfigured =
    present(env, "SMS_PROVIDER") ||
    present(env, "TWILIO_ACCOUNT_SID") ||
    present(env, "TWILIO_AUTH_TOKEN") ||
    present(env, "TWILIO_FROM_NUMBER") ||
    present(env, "TWILIO_VERIFY_SERVICE_SID") ||
    present(env, "OTP_DEMO_PHONE") ||
    present(env, "OTP_DEMO_CODE") ||
    present(env, "OTP_DEMO_EXPIRES_AT");
  const twilioCredentials =
    present(env, "TWILIO_ACCOUNT_SID") && present(env, "TWILIO_AUTH_TOKEN");
  const demoConfigured =
    present(env, "OTP_DEMO_PHONE") &&
    present(env, "OTP_DEMO_CODE") &&
    present(env, "OTP_DEMO_EXPIRES_AT");
  const sms =
    env.SMS_PROVIDER === "twilio"
      ? twilioCredentials && present(env, "TWILIO_FROM_NUMBER")
      : env.SMS_PROVIDER === "twilio_verify"
        ? twilioCredentials && present(env, "TWILIO_VERIFY_SERVICE_SID")
        : env.SMS_PROVIDER === "demo"
          ? demoConfigured
          : false;
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
      status: mapProvider ? (mapKey ? "ENABLED" : "MISCONFIGURED") : "DISABLED",
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
    if (!["twilio", "twilio_verify", "demo"].includes(env.SMS_PROVIDER)) {
      throw new Error("SMS_PROVIDER must be twilio, twilio_verify, or demo");
    }
    if (env.SMS_PROVIDER === "demo") {
      throw new Error(
        "SMS_PROVIDER=demo is forbidden in production; configure a real OTP provider",
      );
    }
    const requiredKeys =
      env.SMS_PROVIDER === "demo"
        ? ["OTP_DEMO_PHONE", "OTP_DEMO_CODE", "OTP_DEMO_EXPIRES_AT"]
        : [
            "TWILIO_ACCOUNT_SID",
            "TWILIO_AUTH_TOKEN",
            env.SMS_PROVIDER === "twilio"
              ? "TWILIO_FROM_NUMBER"
              : "TWILIO_VERIFY_SERVICE_SID",
          ];
    for (const key of requiredKeys) {
      if (!present(env, key)) {
        throw new Error(
          `${key} is required when SMS_PROVIDER=${env.SMS_PROVIDER}`,
        );
      }
    }
  }
}
