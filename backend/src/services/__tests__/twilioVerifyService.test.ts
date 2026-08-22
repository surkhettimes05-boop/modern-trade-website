import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  checkTwilioSmsVerification,
  startTwilioSmsVerification,
} from "../twilioVerifyService.js";

describe("Twilio Verify transport", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = "AC00000000000000000000000000000000";
    process.env.TWILIO_AUTH_TOKEN = "secret-token";
    process.env.TWILIO_VERIFY_SERVICE_SID =
      "VA00000000000000000000000000000000";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it("starts an SMS verification using a Nepal E.164 destination", async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "pending" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock;

    await startTwilioSmsVerification("9812345678");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/Verifications");
    expect(String(options?.body)).toContain("To=%2B9779812345678");
    expect(String(options?.body)).toContain("Channel=sms");
  });

  it("accepts only an approved verification check", async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "approved" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      checkTwilioSmsVerification("9812345678", "123456"),
    ).resolves.toBe(true);
  });

  it("treats an expired or consumed verification as invalid", async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 20404 }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      checkTwilioSmsVerification("9812345678", "123456"),
    ).resolves.toBe(false);
  });
});
