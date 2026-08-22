import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { query } from "../database/connection.js";
import { normalizePhone } from "../utils/phoneNormalization.js";
import {
  checkTwilioSmsVerification,
  startTwilioSmsVerification,
} from "./twilioVerifyService.js";
import { getDemoOtpCodeForPhone } from "./demoOtpService.js";

interface CreateOTPInput {
  phone: string;
  purpose: string;
  customer_id?: string;
  ip_address?: string;
  user_agent?: string;
}

interface VerifyOTPInput {
  phone: string;
  otp_code: string;
  purpose: string;
  ip_address?: string;
}

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const RESEND_LIMIT_MINUTES = 1;
const MAX_RESENDS_PER_HOUR = 5;

function otpDigest(phone: string, purpose: string, otpCode: string): string {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret) throw new Error("OTP_HASH_SECRET is required");
  return createHmac("sha256", secret)
    .update(`${phone}\u0000${purpose}\u0000${otpCode}`)
    .digest("hex");
}

function digestMatches(expectedHex: string, actualHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function sendTwilioSms(
  toLocalNumber: string,
  otpCode: string,
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio SMS is not configured");
  }

  const form = new URLSearchParams({
    To: `+977${toLocalNumber}`,
    From: fromNumber,
    Body: `Your StoreSync login code is ${otpCode}. It expires in 5 minutes.`,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Twilio SMS failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }
}

export class OTPService {
  /**
   * Generate a secure OTP code
   */
  private generateOTP(): string {
    return randomInt(0, 1000000).toString().padStart(OTP_LENGTH, "0");
  }

  /**
   * Create and store an OTP
   */
  async createOTP(input: CreateOTPInput): Promise<string> {
    const phoneNormalized = normalizePhone(input.phone);
    const otpCode =
      process.env.NODE_ENV === "production" &&
      process.env.SMS_PROVIDER === "demo"
        ? getDemoOtpCodeForPhone(phoneNormalized)
        : this.generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Check resend limits
    await this.checkResendLimits(phoneNormalized, input.purpose);

    // Create OTP record
    await query(
      `INSERT INTO customer_otp (customer_id, phone_normalized, otp_code, purpose, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.customer_id || null,
        phoneNormalized,
        otpDigest(phoneNormalized, input.purpose, otpCode),
        input.purpose,
        expiresAt,
        input.ip_address || null,
        input.user_agent || null,
      ],
    );

    try {
      if (
        process.env.NODE_ENV === "test" ||
        process.env.NODE_ENV === "development"
      ) {
        // Tests and local development receive the returned code from the API.
        // Production still requires an explicitly configured SMS provider.
      } else if (process.env.SMS_PROVIDER === "twilio") {
        await sendTwilioSms(phoneNormalized, otpCode);
      } else if (process.env.SMS_PROVIDER === "twilio_verify") {
        await startTwilioSmsVerification(phoneNormalized);
      } else if (process.env.SMS_PROVIDER === "demo") {
        // The code is stored only as a keyed digest. No SMS is sent and the
        // production API never returns the configured code.
      } else {
        throw new Error(
          "SMS provider is unavailable; OTP delivery is disabled",
        );
      }
    } catch (error) {
      await query(
        `UPDATE customer_otp
         SET used_at = CURRENT_TIMESTAMP
         WHERE phone_normalized = $1 AND otp_code = $2 AND used_at IS NULL`,
        [phoneNormalized, otpDigest(phoneNormalized, input.purpose, otpCode)],
      );
      throw error;
    }

    return otpCode;
  }

  /**
   * Verify an OTP code
   */
  async verifyOTP(
    input: VerifyOTPInput,
  ): Promise<{ valid: boolean; customer_id?: string }> {
    const phoneNormalized = normalizePhone(input.phone);

    // Find the most recent unused OTP for this phone and purpose
    const result = await query(
      `SELECT * FROM customer_otp 
       WHERE phone_normalized = $1 
         AND purpose = $2 
         AND used_at IS NULL 
         AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC 
       LIMIT 1`,
      [phoneNormalized, input.purpose],
    );

    if (result.rows.length === 0) {
      // Enumeration-resistant response
      return { valid: false };
    }

    const otpRecord = result.rows[0];

    // Check attempt limits
    if (otpRecord.attempt_count >= MAX_ATTEMPTS) {
      await this.markOTPUsed(otpRecord.id);
      return { valid: false };
    }

    const verified =
      process.env.NODE_ENV === "production" &&
      process.env.SMS_PROVIDER === "twilio_verify"
        ? await checkTwilioSmsVerification(phoneNormalized, input.otp_code)
        : digestMatches(
            String(otpRecord.otp_code),
            otpDigest(phoneNormalized, input.purpose, input.otp_code),
          );

    if (!verified) {
      await query(
        `UPDATE customer_otp
            SET attempt_count = attempt_count + 1,
                used_at = CASE
                  WHEN attempt_count + 1 >= $2 THEN CURRENT_TIMESTAMP
                  ELSE used_at
                END
          WHERE id = $1 AND used_at IS NULL`,
        [otpRecord.id, MAX_ATTEMPTS],
      );
      return { valid: false };
    }

    // Consume the OTP atomically. Concurrent verification requests cannot both
    // cross the one-time credential boundary.
    const consumed = await query(
      `UPDATE customer_otp
          SET attempt_count = attempt_count + 1,
              used_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND used_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
          AND attempt_count < $2
        RETURNING customer_id`,
      [otpRecord.id, MAX_ATTEMPTS],
    );
    if (!consumed.rowCount) return { valid: false };

    return { valid: true, customer_id: consumed.rows[0].customer_id };
  }

  /**
   * Mark OTP as used
   */
  private async markOTPUsed(otpId: string): Promise<void> {
    await query(
      `UPDATE customer_otp SET used_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [otpId],
    );
  }

  /**
   * Check resend limits to prevent abuse
   */
  private async checkResendLimits(
    phone: string,
    purpose: string,
  ): Promise<void> {
    const phoneNormalized = normalizePhone(phone);

    // Check if resend too soon
    const recentResult = await query(
      `SELECT created_at FROM customer_otp 
       WHERE phone_normalized = $1 AND purpose = $2 
       ORDER BY created_at DESC LIMIT 1`,
      [phoneNormalized, purpose],
    );

    if (recentResult.rows.length > 0) {
      const lastCreated = new Date(recentResult.rows[0].created_at);
      const timeSinceLastSend = Date.now() - lastCreated.getTime();
      const resendLimitMs = RESEND_LIMIT_MINUTES * 60 * 1000;

      if (timeSinceLastSend < resendLimitMs) {
        throw new Error(
          `Please wait ${RESEND_LIMIT_MINUTES} minute before requesting another OTP`,
        );
      }
    }

    // Check hourly resend limit
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyCountResult = await query(
      `SELECT COUNT(*) as count FROM customer_otp 
       WHERE phone_normalized = $1 AND purpose = $2 AND created_at > $3`,
      [phoneNormalized, purpose, hourAgo],
    );

    const hourlyCount = parseInt(hourlyCountResult.rows[0].count);
    if (hourlyCount >= MAX_RESENDS_PER_HOUR) {
      throw new Error("Too many OTP requests. Please try again later.");
    }
  }

  /**
   * Clean up expired OTPs (should be run periodically)
   */
  async cleanupExpiredOTPs(): Promise<number> {
    const result = await query(
      `DELETE FROM customer_otp WHERE expires_at < CURRENT_TIMESTAMP RETURNING id`,
    );
    return result.rowCount || 0;
  }

  /**
   * Get OTP statistics for monitoring
   */
  async getOTPStats(phone?: string): Promise<any> {
    let queryStr = `
      SELECT 
        purpose,
        COUNT(*) as total,
        COUNT(CASE WHEN used_at IS NOT NULL THEN 1 END) as used,
        COUNT(CASE WHEN used_at IS NULL AND expires_at > CURRENT_TIMESTAMP THEN 1 END) as pending,
        COUNT(CASE WHEN used_at IS NULL AND expires_at < CURRENT_TIMESTAMP THEN 1 END) as expired
      FROM customer_otp
    `;
    const params: any[] = [];

    if (phone) {
      queryStr += " WHERE phone_normalized = $1";
      params.push(normalizePhone(phone));
    }

    queryStr += " GROUP BY purpose";

    const result = await query(queryStr, params);
    return result.rows;
  }
}
