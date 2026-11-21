import {
  validateEffectivePriceWindow,
  validatePublishedProductPrice,
} from "../catalogPricing.js";

describe("product price effective windows", () => {
  it("accepts an open-ended effective window", () => {
    expect(
      validateEffectivePriceWindow({
        validFrom: new Date("2026-11-21T00:00:00Z"),
      }),
    ).toBeNull();
  });

  it("accepts a finite window when its end is later than its start", () => {
    expect(
      validateEffectivePriceWindow({
        validFrom: new Date("2026-11-21T00:00:00Z"),
        validTo: new Date("2026-11-22T00:00:00Z"),
      }),
    ).toBeNull();
  });

  it("rejects an end date equal to or before the start date", () => {
    const validFrom = new Date("2026-11-21T00:00:00Z");
    expect(
      validateEffectivePriceWindow({ validFrom, validTo: validFrom }),
    ).toBe("Price end date must be later than its start date");
    expect(
      validateEffectivePriceWindow({
        validFrom,
        validTo: new Date("2026-11-20T23:59:59Z"),
      }),
    ).toBe("Price end date must be later than its start date");
  });

  it("rejects invalid timestamps", () => {
    expect(
      validateEffectivePriceWindow({ validFrom: new Date(Number.NaN) }),
    ).toBe("Price start date must be a valid timestamp");
  });

  it("requires a currently effective price before publication", () => {
    const now = new Date("2026-11-21T00:00:00Z");
    expect(
      validatePublishedProductPrice({
        status: "PUBLISHED",
        validFrom: now,
        now,
      }),
    ).toMatch(/currently effective selling price/);
    expect(
      validatePublishedProductPrice({
        status: "PUBLISHED",
        price: 100,
        validFrom: new Date("2026-11-22T00:00:00Z"),
        now,
      }),
    ).toMatch(/currently effective selling price/);
  });

  it("allows a draft to carry a future price and a published product to carry a current price", () => {
    const now = new Date("2026-11-21T00:00:00Z");
    expect(
      validatePublishedProductPrice({
        status: "DRAFT",
        price: 100,
        validFrom: new Date("2026-11-22T00:00:00Z"),
        now,
      }),
    ).toBeNull();
    expect(
      validatePublishedProductPrice({
        status: "PUBLISHED",
        price: 100,
        validFrom: now,
        validTo: new Date("2026-11-23T00:00:00Z"),
        now,
      }),
    ).toBeNull();
  });
});
