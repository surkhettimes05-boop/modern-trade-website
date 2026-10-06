import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { query } from "../../database/connection.js";
import { authRoutes } from "../../routes/auth.js";
import { shoppingCartRoutes } from "../../routes/shoppingCart.js";
import { checkoutRoutes } from "../../routes/checkout.js";
import { OTPService } from "../otpService.js";
import { errorHandler } from "../../middleware/errorHandler.js";

// Real PostgreSQL and services; only SMS delivery is the existing test transport.
// Executed by test:ci, not the database-free unit config.
test("OTP session → owned cart → parallel COD retry → tracking → cancellation", async () => {
  const seed = await readFile("../database/development_seed.sql", "utf8");
  await query(seed);
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie);
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(shoppingCartRoutes, { prefix: "/api" });
  await app.register(checkoutRoutes, { prefix: "/api" });
  const original = OTPService.prototype.createOTP;
  let code = "";
  const capture = jest
    .spyOn(OTPService.prototype, "createOTP")
    .mockImplementation(async function (this: OTPService, input) {
      code = await original.call(this, input);
      return code;
    });
  try {
    const phone = "9812345678";
    await query("DELETE FROM customer_otp WHERE phone_normalized = $1", [
      phone,
    ]);
    const request = await app.inject({
      method: "POST",
      url: "/api/auth/otp/request",
      payload: { phone, purpose: "LOGIN" },
    });
    expect(request.statusCode).toBe(200);
    expect(request.json().otp).toBeUndefined();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/otp/verify",
      payload: { phone, otp_code: code, purpose: "LOGIN" },
    });
    expect(login.statusCode).toBe(200);
    const cookies = login.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const csrf = login.cookies.find((c) => c.name === "customer_csrf")!.value;
    const headers = { cookie: cookies, "x-csrf-token": csrf };
    const store = (
      await query(
        "SELECT id FROM stores WHERE name_en = 'Pasalho Birendranagar' LIMIT 1",
      )
    ).rows[0];
    const product = (
      await query(
        "SELECT product_id FROM batch_inventory WHERE store_id = $1 AND quantity >= 2 LIMIT 1",
        [store.id],
      )
    ).rows[0];
    const cart = await app.inject({
      method: "POST",
      url: "/api/shopping-cart",
      headers,
      payload: { store_id: store.id },
    });
    expect(cart.statusCode).toBe(200);
    const cartId = cart.json().id;
    const sync = {
      method: "PUT" as const,
      url: `/api/shopping-cart/${cartId}/items`,
      headers,
      payload: { items: [{ product_id: product.product_id, quantity: 2 }] },
    };
    expect(
      (await app.inject({ ...sync, headers: { cookie: cookies } })).statusCode,
    ).toBe(403);
    expect((await app.inject(sync)).statusCode).toBe(200);
    expect((await app.inject(sync)).statusCode).toBe(200);
    expect(
      Number(
        (
          await query(
            "SELECT SUM(quantity) AS quantity FROM cart_items WHERE cart_id = $1",
            [cartId],
          )
        ).rows[0].quantity,
      ),
    ).toBe(2);
    const checkout = {
      method: "POST" as const,
      url: "/api/checkout/cod",
      headers,
      payload: {
        cart_id: cartId,
        store_id: store.id,
        idempotency_key: randomUUID(),
        delivery_type: "PICKUP",
        shipping_name: "QA Customer",
        shipping_phone: phone,
      },
    };
    const results = await Promise.all([
      app.inject(checkout),
      app.inject(checkout),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([201, 201]);
    const id = results[0].json().id;
    expect(results[1].json().id).toBe(id);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/customer/orders/${id}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: `/api/customer/orders/${id}` }))
        .statusCode,
    ).toBe(401);
    const cancel = await app.inject({
      method: "POST",
      url: `/api/customer/orders/${id}/cancel`,
      headers,
      payload: { reason: "QA cancellation" },
    });
    expect(cancel.statusCode).toBe(200);
    const reservations = await query(
      "SELECT COUNT(*) AS count FROM stock_reservations WHERE order_id = $1 AND status = 'ACTIVE'",
      [id],
    );
    expect(Number(reservations.rows[0].count)).toBe(0);
  } finally {
    capture.mockRestore();
    await app.close();
  }
}, 30000);
