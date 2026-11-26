import { PaymentSecurityService } from "../paymentSecurityService.js";

describe("payment security regression", () => {
  const originalKey = process.env.PAYMENT_ENCRYPTION_KEY;
  const originalEnv = process.env.NODE_ENV;
  beforeEach(() => { process.env.PAYMENT_ENCRYPTION_KEY = "ab".repeat(32); });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.PAYMENT_ENCRYPTION_KEY;
    else process.env.PAYMENT_ENCRYPTION_KEY = originalKey;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });
  it("rejects malformed encryption keys and missing production keys", () => {
    for (const key of ["invalid", "a".repeat(63), "z".repeat(64)]) {
      process.env.PAYMENT_ENCRYPTION_KEY = key;
      expect(() => new PaymentSecurityService()).toThrow("64 hexadecimal");
    }
    delete process.env.PAYMENT_ENCRYPTION_KEY;
    process.env.NODE_ENV = "production";
    expect(() => new PaymentSecurityService()).toThrow("required in production");
  });
  it("round trips Unicode data using distinct randomized ciphertext", () => {
    const service = new PaymentSecurityService();
    const value = "synthetic payment विवरण";
    const a = service.encrypt(value), b = service.encrypt(value);
    expect(a).not.toBe(b);
    expect(a).not.toContain(value);
    expect(service.decrypt(a)).toBe(value);
    expect(service.decrypt(b)).toBe(value);
  });
  it.each([0,1,2])("rejects tampering with encrypted component %i", (index) => {
    const service = new PaymentSecurityService();
    const parts = service.encrypt("synthetic payment").split(":");
    parts[index] = (parts[index][0] === "0" ? "1" : "0") + parts[index].slice(1);
    expect(() => service.decrypt(parts.join(":"))).toThrow();
  });
  it("rejects wrong keys and malformed ciphertext", () => {
    const service = new PaymentSecurityService();
    const encrypted = service.encrypt("synthetic");
    process.env.PAYMENT_ENCRYPTION_KEY = "cd".repeat(32);
    expect(() => new PaymentSecurityService().decrypt(encrypted)).toThrow();
    expect(() => service.decrypt("invalid")).toThrow();
  });
  it("masks all supported sensitive fields without mutating input", () => {
    const service = new PaymentSecurityService();
    const fields = ["card_number","cvv","expiry","pin","password","token","secret","api_key","private_key"];
    const payload = Object.fromEntries(fields.map(field => [field,"synthetic-secret"]));
    const masked = service.redactSensitiveData({...payload, currency:"NPR", cvv:"123"});
    for (const field of fields) expect(masked[field]).toBe(field === "cvv" ? "****" : "sy****et");
    expect(masked.currency).toBe("NPR");
    expect(payload.token).toBe("synthetic-secret");
  });
});
