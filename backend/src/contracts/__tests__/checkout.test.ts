import { CodCheckoutBodySchema } from "../checkout.js";

const common = {
  cart_id: "1f4d234c-2bcc-4e44-91dd-30e4f481451b",
  idempotency_key: "checkout-12345678",
  shipping_name: "Aakriti Shahi",
  shipping_phone: "+9779812345678",
};

describe("COD checkout contract", () => {
  it("rejects store pickup because customer orders use central warehouse delivery", () => {
    expect(() =>
      CodCheckoutBodySchema.parse({
        ...common,
        delivery_type: "PICKUP",
      }),
    ).toThrow();
  });

  it("requires a complete Nepal delivery address for delivery", () => {
    expect(() =>
      CodCheckoutBodySchema.parse({ ...common, delivery_type: "DELIVERY" }),
    ).toThrow();

    expect(
      CodCheckoutBodySchema.parse({
        ...common,
        delivery_type: "DELIVERY",
        shipping_address: "Ward 26, Thamel",
        shipping_city: "Kathmandu",
        shipping_state: "Bagmati",
        shipping_postal_code: "44600",
        shipping_country: "NP",
      }),
    ).toMatchObject({ delivery_type: "DELIVERY", shipping_country: "NP" });
  });
});
