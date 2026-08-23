import { CodCheckoutBodySchema } from "../checkout.js";

const common = {
  cart_id: "1f4d234c-2bcc-4e44-91dd-30e4f481451b",
  store_id: "2e4c6879-d846-4b34-9894-7412850db715",
  idempotency_key: "checkout-12345678",
  shipping_name: "Aakriti Shahi",
  shipping_phone: "+9779812345678",
};

describe("COD checkout contract", () => {
  it("accepts pickup without a customer delivery address", () => {
    expect(
      CodCheckoutBodySchema.parse({ ...common, delivery_type: "PICKUP" }),
    ).toEqual({ ...common, delivery_type: "PICKUP" });
  });

  it("rejects customer delivery fields for pickup", () => {
    expect(() =>
      CodCheckoutBodySchema.parse({
        ...common,
        delivery_type: "PICKUP",
        shipping_address: "An invented delivery address",
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
