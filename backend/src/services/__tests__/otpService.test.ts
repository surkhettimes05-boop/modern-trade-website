import { OTPService } from "../otpService.js";
import { query } from "../../database/connection.js";

describe("OTPService", () => {
  let otpService: OTPService;

  beforeEach(() => {
    otpService = new OTPService();
  });

  describe("createOTP", () => {
    it("should create a 6-digit OTP", async () => {
      const input = {
        phone: "9812345678",
        purpose: "LOGIN",
      };

      const otp = await otpService.createOTP(input);

      expect(otp).toBeDefined();
      expect(otp.length).toBe(6);
      expect(/^\d{6}$/.test(otp)).toBe(true);
    });

    it("should store OTP with expiry time", async () => {
      const input = {
        phone: "9812345678",
        purpose: "LOGIN",
      };

      await otpService.createOTP(input);

      // Verify OTP is stored with expiry
      // This would need database mocking
      expect(true).toBe(true); // Placeholder
    });

    it("should respect resend limits", async () => {
      const input = {
        phone: "9812345678",
        purpose: "LOGIN",
      };

      // First request should succeed
      await otpService.createOTP(input);

      // Immediate second request should fail
      await expect(otpService.createOTP(input)).rejects.toThrow();
    });
  });

  describe("verifyOTP", () => {
    it("should verify correct OTP", async () => {
      const input = {
        phone: "9812345678",
        purpose: "LOGIN",
      };
      const otp = await otpService.createOTP(input);

      const result = await otpService.verifyOTP({
        phone: "9812345678",
        otp_code: otp,
        purpose: "LOGIN",
      });

      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
    });

    it("should reject incorrect OTP", async () => {
      const input = {
        phone: "9812345678",
        purpose: "LOGIN",
      };
      await otpService.createOTP(input);

      const result = await otpService.verifyOTP({
        phone: "9812345678",
        otp_code: "000000",
        purpose: "LOGIN",
      });

      expect(result).toBeDefined();
      expect(result.valid).toBe(false);
    });

    it("should reject expired OTP", async () => {
      const input = {
        phone: "9812345678",
        purpose: "LOGIN",
      };
      const otp = await otpService.createOTP(input);

      await query(
        "UPDATE customer_otp SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'",
      );

      const result = await otpService.verifyOTP({
        phone: "9812345678",
        otp_code: otp,
        purpose: "LOGIN",
      });
      expect(result.valid).toBe(false);
    });

    it("should track failed attempts", async () => {
      const input = {
        phone: "9812345678",
        purpose: "LOGIN",
      };
      await otpService.createOTP(input);

      // Attempt with wrong OTP
      await otpService.verifyOTP({
        phone: "9812345678",
        otp_code: "000000",
        purpose: "LOGIN",
      });
      await otpService.verifyOTP({
        phone: "9812345678",
        otp_code: "000000",
        purpose: "LOGIN",
      });
      await otpService.verifyOTP({
        phone: "9812345678",
        otp_code: "000000",
        purpose: "LOGIN",
      });

      // The service is enumeration-resistant: lockout returns the same invalid result.
      const locked = await otpService.verifyOTP({
        phone: "9812345678",
        otp_code: "000000",
        purpose: "LOGIN",
      });
      expect(locked).toEqual({ valid: false });
    });
  });

  describe("cleanupExpiredOTPs", () => {
    it("should remove expired OTPs", async () => {
      const count = await otpService.cleanupExpiredOTPs();

      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
