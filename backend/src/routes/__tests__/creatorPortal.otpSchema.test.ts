import { creatorOtpVerifySchema } from "../creatorPortal.js";

describe("creator portal OTP verification input", () => {
  const phone = "+9779800000000";

  it("accepts exactly six numeric digits", () => {
    expect(creatorOtpVerifySchema.safeParse({ phone, otp_code: "123456" }).success).toBe(true);
    expect(creatorOtpVerifySchema.safeParse({ phone, otp_code: "000000" }).success).toBe(true);
  });

  it.each(["12345", "1234567", "12a456", "\\\\d\\\\d\\\\d\\\\d\\\\d\\\\d"])(
    "rejects malformed codes (%s)",
    (otp_code) => {
      expect(creatorOtpVerifySchema.safeParse({ phone, otp_code }).success).toBe(false);
    },
  );
});
