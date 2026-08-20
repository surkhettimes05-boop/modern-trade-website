import { describe, expect, it } from "@jest/globals";
import { getIntegrationSnapshot } from "../integrations.js";

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
