import { describe, expect, it } from "@jest/globals";
import {
  getIntegrationSnapshot,
  validateProductionIntegrations,
} from "../integrations.js";

describe("integration health snapshot", () => {
  it("reports configured notifications as enabled", () => {
    const snapshot = getIntegrationSnapshot({
      EMAIL_PROVIDER: "smtp",
      EMAIL_PROVIDER_API_KEY: "email-secret",
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "sid",
      TWILIO_AUTH_TOKEN: "token",
      TWILIO_FROM_NUMBER: "+15550000000",
    });

    expect(snapshot.notifications).toEqual({
      mode: "OUTBOX_ONLY",
      status: "ENABLED",
      email: true,
      sms: true,
    });
  });

  it("distinguishes disabled and incomplete notification configuration", () => {
    expect(getIntegrationSnapshot().notifications.status).toBe("DISABLED");
    expect(
      getIntegrationSnapshot({ EMAIL_PROVIDER: "smtp" }).notifications.status,
    ).toBe("MISCONFIGURED");
  });

  it("reports Twilio Verify as enabled without a sender phone number", () => {
    const snapshot = getIntegrationSnapshot({
      SMS_PROVIDER: "twilio_verify",
      TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
      TWILIO_AUTH_TOKEN: "token",
      TWILIO_VERIFY_SERVICE_SID: "VA00000000000000000000000000000000",
    });

    expect(snapshot.notifications).toMatchObject({
      status: "ENABLED",
      sms: true,
    });
  });

  it("fails closed when the Twilio Verify service SID is missing", () => {
    expect(() =>
      validateProductionIntegrations({
        NODE_ENV: "production",
        SMS_PROVIDER: "twilio_verify",
        TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
        TWILIO_AUTH_TOKEN: "token",
      }),
    ).toThrow("TWILIO_VERIFY_SERVICE_SID is required");
  });

  it("rejects static demo OTP configuration in production", () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const env = {
      NODE_ENV: "production",
      SMS_PROVIDER: "demo",
      OTP_DEMO_PHONE: "9812345678",
      OTP_DEMO_CODE: "482731",
      OTP_DEMO_EXPIRES_AT: expiresAt,
    };

    expect(() => validateProductionIntegrations(env)).toThrow(
      "SMS_PROVIDER=demo is forbidden in production",
    );
  });

  it("reports a configured map provider as enabled", () => {
    const snapshot = getIntegrationSnapshot({
      DEFAULT_MAP_PROVIDER: "Baato",
      BAATO_API_KEY: "map-secret",
    });

    expect(snapshot.maps).toEqual({
      status: "ENABLED",
      provider: "Baato",
    });
  });
});
