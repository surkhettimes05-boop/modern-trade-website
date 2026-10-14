import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { query } from "../../database/connection.js";
import { authRoutes } from "../../routes/auth.js";
import { shoppingCartRoutes } from "../../routes/shoppingCart.js";
import { checkoutRoutes } from "../../routes/checkout.js";
import { addressRoutes } from "../../routes/addresses.js";
import { OTPService } from "../otpService.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { publicRoutes } from "../../routes/public.js";

// Real PostgreSQL, services, routes, transactions and migrations. Only SMS is
// replaced with the existing test transport. Executed by test:ci.
test("customer → address → serviceability → assigned cart → COD recovery", async () => {
  const seed = await readFile("../database/development_seed.sql", "utf8");
  await query(seed);
  const organizationCountBefore = await query(
    "SELECT COUNT(*) AS count FROM organizations WHERE organization_name = 'Pasalho Nepal' AND country_code = 'NP'",
  );
  await query(seed);
  const organizationCountAfter = await query(
    "SELECT COUNT(*) AS count FROM organizations WHERE organization_name = 'Pasalho Nepal' AND country_code = 'NP'",
  );
  expect(organizationCountAfter.rows[0].count).toBe(
    organizationCountBefore.rows[0].count,
  );

  // Add a second, isolated service area to prove an address change resolves to
  // a different backend-owned store in this disposable integration database.
  const alternate = await query(
    `WITH district AS (
       SELECT id FROM nepal_districts WHERE code = 'SUR'
     ), municipality AS (
       INSERT INTO nepal_municipalities (district_id, code, name_en, municipality_type)
       SELECT id, 'QAOT', 'QA Alternate Municipality', 'Municipality' FROM district
       ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en
       RETURNING id
     ), ward AS (
       INSERT INTO nepal_wards (municipality_id, ward_number, name_en)
       SELECT id, 1, 'QA Alternate Ward 1' FROM municipality
       ON CONFLICT (municipality_id, ward_number) DO UPDATE SET name_en = EXCLUDED.name_en
       RETURNING id, municipality_id
     ), store AS (
       INSERT INTO stores (name_en, address_en, phone, email, status, published_at,
                           created_by, organization_id, country_code, currency_code,
                           locale, timezone, tax_regime, payment_providers, feature_flags)
       SELECT 'ZZ Pasalho QA Alternate', 'QA alternate delivery area', '9800000001',
              'qa-alternate@example.invalid', 'PUBLISHED', NOW(), 'integration-test',
              organization_id, 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu', 'IRD',
              '["cash"]'::jsonb, '{}'::jsonb
         FROM stores WHERE name_en = 'Pasalho Birendranagar'
       RETURNING id
     ), zone AS (
       INSERT INTO delivery_zones (zone_name, store_id, included_municipalities,
                                   included_wards, base_fee, minimum_order_value,
                                   is_active, effective_date, created_by)
       SELECT 'QA alternate zone', store.id, ARRAY[ward.municipality_id],
              ARRAY[ward.id], 75, 0, TRUE, CURRENT_DATE, 'integration-test'
         FROM store CROSS JOIN ward
       RETURNING store_id
     )
     SELECT ward.municipality_id, ward.id AS ward_id, store.id AS store_id
       FROM ward CROSS JOIN store`,
  );
  const alternateArea = alternate.rows[0];
  expect(alternateArea).toBeDefined();
  await query(
    `INSERT INTO product_prices (product_id, store_id, price, original_price, currency_code)
     SELECT product_id, $1, price, original_price, 'NPR'
       FROM product_prices
      WHERE store_id = (SELECT id FROM stores WHERE name_en = 'Pasalho Birendranagar')
     ON CONFLICT DO NOTHING`,
    [alternateArea.store_id],
  );
  const riceFixture = await query(
    "SELECT id FROM products WHERE sku = 'RICE-5KG'",
  );
  await query(
    "UPDATE product_prices SET price = price + 5 WHERE product_id = $1 AND store_id = $2 AND active = TRUE",
    [riceFixture.rows[0].id, alternateArea.store_id],
  );
  await query(
    `INSERT INTO batch_inventory (store_id, product_id, batch_id, expiry_date, quantity, cost)
     SELECT $1, product_id, 'QA-ALT-' || batch_id, expiry_date, quantity, cost
       FROM batch_inventory
      WHERE store_id = (SELECT id FROM stores WHERE name_en = 'Pasalho Birendranagar')
     ON CONFLICT DO NOTHING`,
    [alternateArea.store_id],
  );
  await query(
    "UPDATE batch_inventory SET quantity = 0 WHERE product_id = $1 AND store_id = $2",
    [riceFixture.rows[0].id, alternateArea.store_id],
  );

  const migrationState = await query(
    `SELECT current_database() AS database_name,
            host(inet_server_addr()) AS server_address,
            inet_server_port() AS server_port,
            version() AS version,
            (SELECT COUNT(*) FROM schema_migrations WHERE migration_id = '037_checkout_attempt_fingerprint') AS migration_037_count,
            (SELECT COUNT(*) FROM schema_migrations WHERE migration_id LIKE '0%') AS migration_count,
            (SELECT is_nullable FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'web_orders'
                AND column_name = 'idempotency_request_fingerprint') AS fingerprint_nullable,
            (SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
              AND tablename = 'web_orders' AND indexname = 'idx_web_orders_customer_idempotency') AS idempotency_index`,
  );
  expect(migrationState.rows[0]).toMatchObject({
    database_name: "storesync_jest_test",
    migration_037_count: "1",
    fingerprint_nullable: "YES",
  });
  expect(migrationState.rows[0].server_address).toBeTruthy();
  expect(Number(migrationState.rows[0].server_port)).toBeGreaterThan(0);
  expect(Number(migrationState.rows[0].migration_count)).toBe(38); // 019 is intentionally absent from this project's manifest.
  const migrationIds = await query(
    "SELECT migration_id FROM schema_migrations ORDER BY migration_id",
  );
  const requiredMigrations = [
    ...Array.from(
      { length: 18 },
      (_, index) => `${String(index + 1).padStart(3, "0")}_`,
    ),
    ...Array.from(
      { length: 20 },
      (_, index) => `${String(index + 20).padStart(3, "0")}_`,
    ),
  ];
  for (const prefix of requiredMigrations) {
    expect(
      migrationIds.rows.some((row) => row.migration_id.startsWith(prefix)),
    ).toBe(true);
  }
  expect(migrationState.rows[0].idempotency_index).toMatch(
    /CREATE UNIQUE INDEX/,
  );
  expect(migrationState.rows[0].idempotency_index).toMatch(
    /customer_id, idempotency_key/,
  );

  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie);
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(shoppingCartRoutes, { prefix: "/api" });
  await app.register(checkoutRoutes, { prefix: "/api" });
  await app.register(addressRoutes, { prefix: "/api" });
  await app.register(publicRoutes, { prefix: "/api/public" });
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
    const otpRequest = await app.inject({
      method: "POST",
      url: "/api/auth/otp/request",
      payload: { phone, purpose: "LOGIN" },
    });
    expect(otpRequest.statusCode).toBe(200);
    expect(otpRequest.json().otp).toBeUndefined();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/otp/verify",
      payload: { phone, otp_code: code, purpose: "LOGIN" },
    });
    expect(login.statusCode).toBe(200);
    const cookies = login.cookies
      .map((item) => `${item.name}=${item.value}`)
      .join("; ");
    const csrf = login.cookies.find(
      (item) => item.name === "customer_csrf",
    )!.value;
    const headers = { cookie: cookies, "x-csrf-token": csrf };

    const customer = await query(
      "SELECT id FROM customers WHERE phone_normalized = $1",
      [phone],
    );
    const birendranagar = await query(
      `SELECT m.id AS municipality_id, w.id AS ward_id
         FROM nepal_municipalities m JOIN nepal_wards w ON w.municipality_id = m.id
        WHERE m.code = 'BIR' AND w.ward_number = 1`,
    );
    const addressRequest = (
      municipalityId: number,
      wardId: number,
      street: string,
    ) => ({
      method: "POST" as const,
      url: "/api/addresses",
      headers,
      payload: {
        municipality_id: municipalityId,
        ward_id: wardId,
        street,
        tole_locality: "QA Tole",
        phone,
        postal_code: "44000",
        address_type: "HOME",
        is_default: true,
      },
    });
    const addressResponse = await app.inject(
      addressRequest(
        birendranagar.rows[0].municipality_id,
        birendranagar.rows[0].ward_id,
        "1 QA Street",
      ),
    );
    expect(addressResponse.statusCode).toBe(201);
    const address = addressResponse.json();

    const firstServiceability = await app.inject({
      method: "POST",
      url: "/api/checkout/serviceability",
      headers,
      payload: { address_id: address.id },
    });
    expect(firstServiceability.statusCode).toBe(200);
    const firstAssignment = firstServiceability.json();
    expect(firstAssignment.serviceable).toBe(true);
    const zoneEvidence = await query(
      "SELECT zone_name, base_fee, surcharge, included_municipalities, included_wards FROM delivery_zones WHERE store_id = $1",
      [firstAssignment.fulfillment_store_id],
    );
    expect(zoneEvidence.rows).toHaveLength(1);
    const zoneFee =
      Number(zoneEvidence.rows[0].base_fee) +
      Number(zoneEvidence.rows[0].surcharge || 0);
    expect(firstAssignment.delivery_fee).toBe(zoneFee);
    const store = await query(
      "SELECT id FROM stores WHERE name_en = 'Pasalho Birendranagar'",
    );
    expect(firstAssignment.fulfillment_store_id).toBe(store.rows[0].id);

    const scopedQuery = (addressId: string, storeId: string, extra = "") =>
      `/api/public/products?address_id=${addressId}&store_id=${storeId}&limit=200${extra}`;
    const firstCatalog = await app.inject({
      method: "GET",
      url: scopedQuery(address.id, firstAssignment.fulfillment_store_id),
      headers,
    });
    expect(firstCatalog.statusCode).toBe(200);
    const firstRice = firstCatalog
      .json()
      .find((item: any) => item.id === riceFixture.rows[0].id);
    expect(Number(firstRice.price)).toBeGreaterThan(0);
    expect(firstRice.availability_status).toBe("AVAILABLE");
    const scopedSearch = await app.inject({
      method: "GET",
      url: scopedQuery(
        address.id,
        firstAssignment.fulfillment_store_id,
        "&search=rice",
      ),
      headers,
    });
    expect(
      scopedSearch
        .json()
        .find((item: any) => item.id === riceFixture.rows[0].id).price,
    ).toBe(firstRice.price);
    const scopedCategory = await app.inject({
      method: "GET",
      url: scopedQuery(
        address.id,
        firstAssignment.fulfillment_store_id,
        `&category=${firstRice.category_id}`,
      ),
      headers,
    });
    expect(
      scopedCategory
        .json()
        .find((item: any) => item.id === riceFixture.rows[0].id).price,
    ).toBe(firstRice.price);
    const scopedDetail = await app.inject({
      method: "GET",
      url: `/api/public/products/${riceFixture.rows[0].id}?address_id=${address.id}&store_id=${firstAssignment.fulfillment_store_id}`,
      headers,
    });
    expect(scopedDetail.json().price).toBe(firstRice.price);
    expect(scopedDetail.json().availability_status).toBe(
      firstRice.availability_status,
    );
    expect(scopedDetail.json().available_quantity).toBe(
      firstRice.available_quantity,
    );
    const forgedStore = await app.inject({
      method: "GET",
      url: scopedQuery(address.id, alternateArea.store_id),
      headers,
    });
    expect(forgedStore.statusCode).toBe(409);

    const product = await query(
      `SELECT p.id AS product_id, pp.price AS canonical_price
         FROM products p JOIN product_prices pp ON pp.product_id = p.id
        WHERE p.sku = 'RICE-5KG' AND pp.store_id = $1
          AND pp.active = TRUE ORDER BY pp.valid_from DESC LIMIT 1`,
      [firstAssignment.fulfillment_store_id],
    );
    const requestedItems = [
      { product_id: product.rows[0].product_id, quantity: 2 },
    ];
    const forgedPrice = await app.inject({
      method: "POST",
      url: "/api/checkout/cart/validate",
      headers,
      payload: {
        address_id: address.id,
        items: [{ ...requestedItems[0], client_unit_price: 1 }],
      },
    });
    expect(forgedPrice.json().status).toBe("CHANGES_REQUIRED");
    expect(forgedPrice.json().items[0].authoritative_price).toBe(
      Number(product.rows[0].canonical_price),
    );
    expect(forgedPrice.json().items[0].issues).toContainEqual({
      code: "PRICE_CHANGED",
    });

    const validation = await app.inject({
      method: "POST",
      url: "/api/checkout/cart/validate",
      headers,
      payload: {
        address_id: address.id,
        items: [
          {
            ...requestedItems[0],
            client_unit_price: Number(product.rows[0].canonical_price),
          },
        ],
      },
    });
    expect(validation.statusCode).toBe(200);
    const validCart = validation.json();
    expect(validCart.status).toBe("READY");
    expect(validCart.fulfillment_store_id).toBe(
      firstAssignment.fulfillment_store_id,
    );
    expect(validCart.items[0].available_quantity).toBeGreaterThanOrEqual(2);
    expect(validCart.delivery_fee).toBe(zoneFee);
    expect(validCart.subtotal).toBe(
      Number(product.rows[0].canonical_price) * 2,
    );
    expect(validCart.total).toBe(validCart.subtotal + validCart.delivery_fee);

    // A new saved address resolves to a different store; serviceability and
    // validation both use that address-derived assignment.
    const otherAddressResponse = await app.inject(
      addressRequest(
        alternateArea.municipality_id,
        alternateArea.ward_id,
        "2 QA Street",
      ),
    );
    expect(otherAddressResponse.statusCode).toBe(201);
    const otherAddress = otherAddressResponse.json();
    const otherServiceability = await app.inject({
      method: "POST",
      url: "/api/checkout/serviceability",
      headers,
      payload: { address_id: otherAddress.id },
    });
    expect(otherServiceability.json().serviceable).toBe(true);
    expect(otherServiceability.json().fulfillment_store_id).toBe(
      alternateArea.store_id,
    );
    expect(otherServiceability.json().fulfillment_store_id).not.toBe(
      firstAssignment.fulfillment_store_id,
    );
    const otherCatalog = await app.inject({
      method: "GET",
      url: scopedQuery(otherAddress.id, alternateArea.store_id),
      headers,
    });
    const otherRice = otherCatalog
      .json()
      .find((item: any) => item.id === riceFixture.rows[0].id);
    expect(Number(otherRice.price)).toBe(Number(firstRice.price) + 5);
    expect(otherRice.availability_status).toBe("OUT_OF_STOCK");
    const otherValidation = await app.inject({
      method: "POST",
      url: "/api/checkout/cart/validate",
      headers,
      payload: { address_id: otherAddress.id, items: requestedItems },
    });
    expect(otherValidation.json().fulfillment_store_id).toBe(
      alternateArea.store_id,
    );

    const createCart = async () => {
      const result = await app.inject({
        method: "POST",
        url: "/api/shopping-cart",
        headers,
        payload: { store_id: firstAssignment.fulfillment_store_id },
      });
      expect(result.statusCode).toBe(200);
      const cartId = result.json().id as string;
      const sync = {
        method: "PUT" as const,
        url: `/api/shopping-cart/${cartId}/items`,
        headers,
        payload: { items: requestedItems },
      };
      expect(
        (await app.inject({ ...sync, headers: { cookie: cookies } }))
          .statusCode,
      ).toBe(403);
      expect((await app.inject(sync)).statusCode).toBe(200);
      expect((await app.inject(sync)).statusCode).toBe(200);
      const persisted = await query(
        "SELECT SUM(quantity) AS quantity FROM cart_items WHERE cart_id = $1",
        [cartId],
      );
      expect(Number(persisted.rows[0].quantity)).toBe(2);
      return cartId;
    };

    const makeCheckout = (cartId: string, key: string) => ({
      method: "POST" as const,
      url: "/api/checkout/cod",
      headers,
      payload: {
        cart_id: cartId,
        // Deliberately untrusted: delivery assignment must override this.
        store_id: randomUUID(),
        idempotency_key: key,
        delivery_type: "DELIVERY" as const,
        address_id: address.id,
        shipping_name: "QA Customer",
        shipping_phone: phone,
        shipping_address: "1 QA Street, QA Tole",
        shipping_municipality_id: address.municipality_id,
        shipping_ward_id: address.ward_id,
        shipping_postal_code: "44000",
        shipping_country: "NP",
      },
    });

    // Recheck availability under the final transaction after advisory
    // validation. The temporarily reduced stock is restored before submission.
    const cartId = await createCart();
    const batches = await query(
      `SELECT batch_id, quantity FROM batch_inventory
        WHERE store_id = $1 AND product_id = $2 ORDER BY batch_id`,
      [firstAssignment.fulfillment_store_id, product.rows[0].product_id],
    );
    expect(batches.rows.length).toBeGreaterThan(0);
    const originalQuantities = batches.rows.map((row) => Number(row.quantity));
    await query(
      "UPDATE batch_inventory SET quantity = 1 WHERE store_id = $1 AND product_id = $2",
      [firstAssignment.fulfillment_store_id, product.rows[0].product_id],
    );
    const preflightKey = randomUUID();
    const preflight = await app.inject(makeCheckout(cartId, preflightKey));
    expect(preflight.statusCode).toBe(409);
    expect(
      (
        await query("SELECT 1 FROM web_orders WHERE idempotency_key = $1", [
          preflightKey,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await query(
          "SELECT 1 FROM stock_reservations WHERE product_id = $1 AND store_id = $2 AND status = 'ACTIVE'",
          [product.rows[0].product_id, firstAssignment.fulfillment_store_id],
        )
      ).rowCount,
    ).toBe(0);
    for (let index = 0; index < batches.rows.length; index++) {
      await query(
        "UPDATE batch_inventory SET quantity = $1 WHERE store_id = $2 AND product_id = $3 AND batch_id = $4",
        [
          originalQuantities[index],
          firstAssignment.fulfillment_store_id,
          product.rows[0].product_id,
          batches.rows[index].batch_id,
        ],
      );
    }

    // A: first request creates exactly one order. B: exact replay returns it.
    const primaryKey = randomUUID();
    const checkout = makeCheckout(cartId, primaryKey);
    const first = await app.inject(checkout);
    expect(first.statusCode).toBe(201);
    const orderId = first.json().id as string;
    const replay = await app.inject(checkout);
    expect(replay.statusCode).toBe(201);
    expect(replay.json().id).toBe(orderId);
    const order = await query(
      "SELECT store_id, fulfillment_store_id, shipping_amount, subtotal, total_amount FROM web_orders WHERE id = $1",
      [orderId],
    );
    expect(order.rows[0].store_id).toBe(firstAssignment.fulfillment_store_id);
    expect(order.rows[0].fulfillment_store_id).toBe(
      firstAssignment.fulfillment_store_id,
    );
    expect(Number(order.rows[0].shipping_amount)).toBe(validCart.delivery_fee);
    expect(Number(order.rows[0].subtotal)).toBe(validCart.subtotal);
    expect(Number(order.rows[0].total_amount)).toBe(validCart.total);

    // D: the same key cannot alias a changed logical request.
    const changedPayload = await app.inject({
      ...checkout,
      payload: { ...checkout.payload, shipping_name: "Different request" },
    });
    expect(changedPayload.statusCode).toBe(409);
    expect(changedPayload.json().code).toBe("IDEMPOTENCY_CONFLICT");

    // E: commit the order, intentionally discard the response, and recover by
    // key. F: an unknown key remains NOT_FOUND.
    const lostKey = randomUUID();
    const lostResponse = await app.inject(
      makeCheckout(await createCart(), lostKey),
    );
    expect(lostResponse.statusCode).toBe(201);
    const recovered = await app.inject({
      method: "GET",
      url: `/api/checkout/order-attempt/${lostKey}`,
      headers,
    });
    expect(recovered.json()).toMatchObject({
      status: "CONFIRMED",
      order: { id: lostResponse.json().id },
    });
    const unknownAttempt = await app.inject({
      method: "GET",
      url: `/api/checkout/order-attempt/${randomUUID()}`,
      headers,
    });
    expect(unknownAttempt.json()).toEqual({ status: "NOT_FOUND" });

    // C and G: concurrent duplicate submissions commit one order, one item,
    // one reservation and one creation event.
    const concurrentKey = randomUUID();
    const concurrentCheckout = makeCheckout(await createCart(), concurrentKey);
    const concurrent = await Promise.all([
      app.inject(concurrentCheckout),
      app.inject(concurrentCheckout),
    ]);
    expect(concurrent.map((response) => response.statusCode)).toEqual([
      201, 201,
    ]);
    const concurrentOrderId = concurrent[0].json().id as string;
    expect(concurrent[1].json().id).toBe(concurrentOrderId);
    const exactlyOnce = await query(
      `SELECT (SELECT COUNT(*) FROM web_orders WHERE customer_id = $1 AND idempotency_key = $2) AS orders,
              (SELECT COUNT(*) FROM web_order_items WHERE order_id = $3) AS items,
              (SELECT COUNT(*) FROM stock_reservations WHERE order_id = $3) AS reservations,
              (SELECT COUNT(*) FROM order_events WHERE order_id = $3 AND event_type = 'CREATED') AS created_events`,
      [customer.rows[0].id, concurrentKey, concurrentOrderId],
    );
    expect(exactlyOnce.rows[0]).toMatchObject({
      orders: "1",
      items: "1",
      reservations: "1",
      created_events: "1",
    });

    // Check each successful primary order has exactly one of every transactional
    // child record despite its same-key retry.
    const primaryCounts = await query(
      `SELECT (SELECT COUNT(*) FROM web_orders WHERE customer_id = $1 AND idempotency_key = $2) AS orders,
              (SELECT COUNT(*) FROM web_order_items WHERE order_id = $3) AS items,
              (SELECT COUNT(*) FROM stock_reservations WHERE order_id = $3) AS reservations,
              (SELECT COUNT(*) FROM order_events WHERE order_id = $3 AND event_type = 'CREATED') AS created_events`,
      [customer.rows[0].id, primaryKey, orderId],
    );
    expect(primaryCounts.rows[0]).toMatchObject({
      orders: "1",
      items: "1",
      reservations: "1",
      created_events: "1",
    });

    // Task 033 compatibility: simulate a historical row with no fingerprint.
    // It stays readable in details/history and status lookup, while direct
    // replay is refused because equivalence cannot be established.
    await query(
      "UPDATE web_orders SET idempotency_request_fingerprint = NULL WHERE id = $1",
      [orderId],
    );
    const history = await app.inject({
      method: "GET",
      url: "/api/customer/orders",
      headers,
    });
    expect(history.statusCode).toBe(200);
    const detail = await app.inject({
      method: "GET",
      url: `/api/customer/orders/${orderId}`,
      headers,
    });
    expect(detail.statusCode).toBe(200);
    const expectedItemCount = detail
      .json()
      .items.reduce(
        (sum: number, item: { quantity: number }) => sum + item.quantity,
        0,
      );
    expect(
      history
        .json()
        .some(
          (item: { id: string; item_count: number }) =>
            item.id === orderId && item.item_count === expectedItemCount,
        ),
    ).toBe(true);
    expect(detail.json().idempotency_request_fingerprint).toBeNull();
    const legacyStatus = await app.inject({
      method: "GET",
      url: `/api/checkout/order-attempt/${primaryKey}`,
      headers,
    });
    expect(legacyStatus.json()).toMatchObject({
      status: "CONFIRMED",
      order: { id: orderId },
    });
    const legacyReplay = await app.inject(checkout);
    expect(legacyReplay.statusCode).toBe(409);
    expect(legacyReplay.json().code).toBe("IDEMPOTENCY_CONFLICT");
    const unauthenticatedDetail = await app.inject({
      method: "GET",
      url: `/api/customer/orders/${orderId}`,
    });
    expect(unauthenticatedDetail.statusCode).toBe(401);
  } finally {
    capture.mockRestore();
    await app.close();
  }
}, 60_000);
