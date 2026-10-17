import {
  CartValidationBodySchema,
  CodCheckoutBodySchema,
} from "../checkout.js";

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
        address_id: "19bb5697-c6bc-4a6e-9e04-f4c08c2d8563",
        shipping_address: "Ward 6, Birendranagar",
        shipping_municipality_id: 1,
        shipping_ward_id: 1,
        shipping_postal_code: "21700",
        shipping_country: "NP",
      }),
    ).toMatchObject({
      delivery_type: "DELIVERY",
      address_id: "19bb5697-c6bc-4a6e-9e04-f4c08c2d8563",
      shipping_country: "NP",
    });
  });
});

describe("cart validation contract", () => {
  const body = {
    address_id: "19bb5697-c6bc-4a6e-9e04-f4c08c2d8563",
    items: [
      {
        product_id: "1f4d234c-2bcc-4e44-91dd-30e4f481451b",
        quantity: 2,
        client_unit_price: 120,
      },
    ],
  };

  it("accepts address and product quantities without a store authority", () => {
    expect(CartValidationBodySchema.parse(body)).toEqual(body);
  });

  it("rejects a client supplied fulfillment store", () => {
    expect(() => CartValidationBodySchema.parse({ ...body, store_id: common.store_id })).toThrow();
  });
});
