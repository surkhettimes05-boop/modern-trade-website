import {
  maskPhone,
  normalizePhone,
  validatePhone,
} from "../phoneNormalization.js";

describe("Nepal phone normalization", () => {
  it.each([
    "9812345678",
    "+9779812345678",
    "+977 9812345678",
    "977-9812345678",
  ])("normalizes %s", (phone) => {
    expect(normalizePhone(phone)).toBe("9812345678");
  });

  it("rejects invalid Nepal numbers", () => {
    expect(validatePhone("+9775123456789")).toBe(false);
    expect(validatePhone("5123456789")).toBe(false);
  });

  it("masks normalized numbers", () => {
    expect(maskPhone("+9779812345678")).toBe("98XXXX5678");
  });
});
