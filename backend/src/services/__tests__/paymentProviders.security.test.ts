import { describe, expect, it } from "@jest/globals";
import { EsewaProvider } from "../paymentProviders/eSewaProvider.js";
import { KhaltiProvider } from "../paymentProviders/khaltiProvider.js";
import { FonePayProvider } from "../paymentProviders/fonePayProvider.js";

const payload = {
  provider: "test",
  event_type: "PAYMENT_STATUS",
  provider_webhook_id: "provider-webhook-1",
  raw_data: {
    refId: "PAY-1",
    idx: "KHALTI-1",
    status: "SUCCESS",
    amount: "100",
  },
  signature: "attacker-controlled-signature",
};

describe("payment provider safety boundaries", () => {
  it("does not authenticate eSewa callbacks with a placeholder signature check", async () => {
    const result = await new EsewaProvider().verifyWebhook(payload);
    expect(result.valid).toBe(false);
  });

  it("does not authenticate Khalti callbacks without a configured secret", async () => {
    const result = await new KhaltiProvider().verifyWebhook(payload);
    expect(result.valid).toBe(false);
  });

  it("does not accept every Fonepay callback as authentic", async () => {
    const result = await new FonePayProvider().verifyWebhook(payload);
    expect(result.valid).toBe(false);
  });
});
