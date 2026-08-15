import { EsewaProvider } from "../paymentProviders/eSewaProvider.js";

describe("EsewaProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("includes the payment parameters in the generated URL", async () => {
    process.env.ESEWA_MERCHANT_CODE = "merchant-code";
    const provider = new EsewaProvider();

    const result = await provider.createPaymentIntent({
      amount: 1250,
      payment_method: "eSewa",
      order_id: "ORDER-42",
      return_url: "https://example.com/success",
      cancel_url: "https://example.com/cancel",
    });

    const url = new URL(result.payment_url!);
    expect(url.searchParams.get("tAmt")).toBe("1250");
    expect(url.searchParams.get("txNm")).toBe("ORDER-42");
    expect(url.searchParams.get("scd")).toBe("merchant-code");
  });

  it("rejects a webhook with no signature", async () => {
    process.env.ESEWA_SECRET_KEY = "secret";
    const provider = new EsewaProvider();

    const result = await provider.verifyWebhook({
      provider: "eSewa",
      event_type: "PAYMENT",
      provider_webhook_id: "webhook-1",
      raw_data: { refId: "payment-1", status: "Complete", amount: "100" },
    });

    expect(result).toEqual({ valid: false, error: "Invalid signature" });
  });

  it("does not expose placeholder verification as production behavior", async () => {
    process.env.NODE_ENV = "production";
    process.env.ESEWA_SECRET_KEY = "secret";
    const provider = new EsewaProvider();
    await expect(
      provider.verifyWebhook({
        provider: "eSewa",
        event_type: "PAYMENT",
        provider_webhook_id: "webhook-2",
        signature: "unverifiable",
        raw_data: { status: "Complete" },
      }),
    ).rejects.toThrow("not production-ready");
  });
});
