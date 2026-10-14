import { z } from "zod";
import { MARKET, NepalPhoneSchema, NepalPostalCodeSchema } from "./platform.js";

const commonCheckoutFields = {
  cart_id: z.string().uuid(),
  store_id: z.string().uuid(),
  idempotency_key: z.string().min(8).max(100),
  shipping_name: z.string().trim().min(1).max(200),
  shipping_phone: NepalPhoneSchema,
  notes: z.string().trim().max(1_000).optional(),
};

const deliveryCheckoutSchema = z
  .object({
    ...commonCheckoutFields,
    delivery_type: z.literal("DELIVERY"),
    address_id: z.string().uuid(),
    shipping_address: z.string().trim().min(1).max(500),
    shipping_municipality_id: z.coerce.number().int().positive(),
    shipping_ward_id: z.coerce.number().int().positive(),
    shipping_postal_code: NepalPostalCodeSchema,
    shipping_country: z.literal(MARKET.countryCode),
  })
  .strict();

const pickupCheckoutSchema = z
  .object({
    ...commonCheckoutFields,
    delivery_type: z.literal("PICKUP"),
  })
  .strict();

export const CodCheckoutBodySchema = z.discriminatedUnion("delivery_type", [
  deliveryCheckoutSchema,
  pickupCheckoutSchema,
]);

export const CartValidationBodySchema = z
  .object({
    address_id: z.string().uuid(),
    items: z
      .array(
        z
          .object({
            product_id: z.string().uuid(),
            quantity: z.coerce.number().int().min(1).max(999),
            client_unit_price: z.coerce.number().nonnegative().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export type CodCheckoutBody = z.infer<typeof CodCheckoutBodySchema>;
