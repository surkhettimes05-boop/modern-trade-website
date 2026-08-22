import { normalizePhone } from "../utils/phoneNormalization.js";

const TWILIO_VERIFY_TIMEOUT_MS = 15_000;

interface TwilioVerifyResponse {
  status?: string;
}

export class TwilioVerifyUnavailableError extends Error {
  constructor(message = "Twilio Verify is temporarily unavailable") {
    super(message);
    this.name = "TwilioVerifyUnavailableError";
  }
}

function getTwilioVerifyConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();

  if (!accountSid || !authToken || !serviceSid) {
    throw new TwilioVerifyUnavailableError("Twilio Verify is not configured");
  }

  return { accountSid, authToken, serviceSid };
}

function verificationUrl(serviceSid: string, path: string): string {
  return `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${path}`;
}

function authorizationHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function postToTwilioVerify(
  path: "Verifications" | "VerificationCheck",
  body: URLSearchParams,
): Promise<{ response: Response; data: TwilioVerifyResponse }> {
  const { accountSid, authToken, serviceSid } = getTwilioVerifyConfig();
  let response: Response;
  try {
    response = await fetch(verificationUrl(serviceSid, path), {
      method: "POST",
      headers: {
        Authorization: authorizationHeader(accountSid, authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(TWILIO_VERIFY_TIMEOUT_MS),
    });
  } catch {
    throw new TwilioVerifyUnavailableError();
  }

  let data: TwilioVerifyResponse = {};
  try {
    data = (await response.json()) as TwilioVerifyResponse;
  } catch {
    // A malformed provider response is handled as an unavailable integration.
  }

  return { response, data };
}

export async function startTwilioSmsVerification(
  localPhoneNumber: string,
): Promise<void> {
  const to = `+977${normalizePhone(localPhoneNumber)}`;
  const { response, data } = await postToTwilioVerify(
    "Verifications",
    new URLSearchParams({ To: to, Channel: "sms" }),
  );

  if (!response.ok || data.status !== "pending") {
    throw new TwilioVerifyUnavailableError(
      `Twilio Verify start failed (${response.status})`,
    );
  }
}

export async function checkTwilioSmsVerification(
  localPhoneNumber: string,
  code: string,
): Promise<boolean> {
  const to = `+977${normalizePhone(localPhoneNumber)}`;
  const { response, data } = await postToTwilioVerify(
    "VerificationCheck",
    new URLSearchParams({ To: to, Code: code }),
  );

  // Twilio returns 404 after expiry, approval, or maximum attempts. Treat that
  // as an invalid code without exposing provider details to the customer.
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new TwilioVerifyUnavailableError(
      `Twilio Verify check failed (${response.status})`,
    );
  }

  return data.status === "approved";
}
