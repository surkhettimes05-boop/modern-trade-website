import { randomInt } from "crypto";
import { query } from "../database/connection.js";
import { normalizePhone } from "../utils/phoneNormalization.js";

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

async function sendTwilioSms(toLocalNumber: string, otpCode: string): Promise<void> {
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
    throw new Error(`Twilio SMS failed (${response.status}): ${detail.slice(0, 300)}`);
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
    const otpCode = this.generateOTP();
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
        otpCode,
        input.purpose,
        expiresAt,
        input.ip_address || null,
        input.user_agent || null,
      ],
    );

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `OTP for ${phoneNormalized}: ${otpCode} (expires at ${expiresAt})`,
      );
    } else if (process.env.SMS_PROVIDER === "twilio") {
      await sendTwilioSms(phoneNormalized, otpCode);
    } else {
      throw new Error("SMS provider is unavailable; OTP delivery is disabled");
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

    // Increment attempt count
    await query(
      `UPDATE customer_otp SET attempt_count = attempt_count + 1 WHERE id = $1`,
      [otpRecord.id],
    );

    // Verify OTP
    if (otpRecord.otp_code !== input.otp_code) {
      return { valid: false };
    }

    // Mark OTP as used
    await this.markOTPUsed(otpRecord.id);

    return { valid: true, customer_id: otpRecord.customer_id };
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
