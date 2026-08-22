import { describe, expect, it } from "@jest/globals";
import { getDemoOtpCodeForPhone } from "../demoOtpService.js";

describe("restricted demo OTP", () => {
  const now = new Date("2026-08-22T06:00:00.000Z");
  const env = {
    OTP_DEMO_PHONE: "9812345678",
    OTP_DEMO_CODE: "482731",
    OTP_DEMO_EXPIRES_AT: "2026-08-24T06:00:00.000Z",
  };

  it("returns the configured code only for the allowlisted phone", () => {
    expect(getDemoOtpCodeForPhone("+9779812345678", env, now)).toBe("482731");
    expect(() => getDemoOtpCodeForPhone("9800000000", env, now)).toThrow(
      "unavailable for this phone number",
    );
  });

  it("rejects expired and excessively long demo windows", () => {
    expect(() =>
      getDemoOtpCodeForPhone(
        "9812345678",
        { ...env, OTP_DEMO_EXPIRES_AT: "2026-08-22T05:59:59.000Z" },
        now,
      ),
    ).toThrow("has expired");
    expect(() =>
      getDemoOtpCodeForPhone(
        "9812345678",
        { ...env, OTP_DEMO_EXPIRES_AT: "2026-09-22T06:00:00.000Z" },
        now,
      ),
    ).toThrow("more than 7 days");
  });
});
