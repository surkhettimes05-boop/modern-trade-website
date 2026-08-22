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
    await expect(new EsewaProvider().verifyWebhook(payload)).rejects.toThrow(
      "provider contract is not certified",
    );
  });

  it("does not authenticate Khalti callbacks without a configured secret", async () => {
    await expect(new KhaltiProvider().verifyWebhook(payload)).rejects.toThrow(
      "provider contract is not certified",
    );
  });

  it("does not accept every Fonepay callback as authentic", async () => {
    await expect(new FonePayProvider().verifyWebhook(payload)).rejects.toThrow(
      "provider contract is not certified",
    );
  });
});
