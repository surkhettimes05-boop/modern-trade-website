import {
  NepalPhoneSchema,
  NepalPostalCodeSchema,
  PaginationQuerySchema,
  MARKET,
} from "../platform.js";

describe("platform contracts", () => {
  it("defines the Nepal MVP market", () => {
    expect(MARKET).toMatchObject({
      countryCode: "NP",
      currencyCode: "NPR",
      locale: "en-NP",
      timezone: "Asia/Kathmandu",
      taxRegime: "IRD",
    });
  });

  it("normalizes pagination defaults and bounds", () => {
    expect(PaginationQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      order: "asc",
    });
    expect(() => PaginationQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  it("validates Nepal phone and postal formats", () => {
    expect(NepalPhoneSchema.parse("+977 9812345678")).toBe("+977 9812345678");
    expect(() => NepalPhoneSchema.parse("+91 9876543210")).toThrow();
    expect(NepalPostalCodeSchema.parse("44600")).toBe("44600");
    expect(() => NepalPostalCodeSchema.parse("411001")).toThrow();
  });
});
