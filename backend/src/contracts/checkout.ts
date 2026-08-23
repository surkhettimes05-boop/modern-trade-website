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
    shipping_address: z.string().trim().min(1).max(500),
    shipping_city: z.string().trim().min(1).max(100),
    shipping_state: z.string().trim().min(1).max(100),
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

export type CodCheckoutBody = z.infer<typeof CodCheckoutBodySchema>;
