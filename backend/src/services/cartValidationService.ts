import { query } from "../database/connection.js";
import { DeliveryZoneService } from "./deliveryZoneService.js";

const deliveryZones = new DeliveryZoneService();

type QueryExecutor = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

export type RequestedCartItem = {
  product_id: string;
  quantity: number;
  client_unit_price?: number;
};

export class CartValidationService {
  constructor(private readonly zones: DeliveryZoneService = deliveryZones) {}

  async validate(input: {
    customerId: string;
    addressId: string;
    items: RequestedCartItem[];
  }) {
    const addressResult = await query(
      `SELECT id, municipality_id, ward_id
         FROM customer_addresses
        WHERE id = $1 AND customer_id = $2`,
      [input.addressId, input.customerId],
    );
    const address = addressResult.rows[0];
    if (!address) {
      return {
        status: "BLOCKED",
        fulfillment_store_id: null,
        delivery_fee: null,
        subtotal: 0,
        total: 0,
        items: [],
        issues: [{ code: "ADDRESS_NOT_FOUND" }],
      };
    }
    if (!address.municipality_id || !address.ward_id) {
      return {
        status: "BLOCKED",
        fulfillment_store_id: null,
        delivery_fee: null,
        subtotal: 0,
        total: 0,
        items: [],
        issues: [{ code: "ADDRESS_UNSERVICEABLE" }],
      };
    }
    const geography = await query(
      `SELECT 1 FROM nepal_wards WHERE id = $1 AND municipality_id = $2`,
      [address.ward_id, address.municipality_id],
    );
    if (!geography.rows[0]) {
      return {
        status: "BLOCKED",
        fulfillment_store_id: null,
        delivery_fee: null,
        subtotal: 0,
        total: 0,
        items: [],
        issues: [{ code: "ADDRESS_UNSERVICEABLE" }],
      };
    }

    const assignment = await this.zones.resolveFulfillmentStore({
      municipality_id: Number(address.municipality_id),
      ward_id: Number(address.ward_id),
    });
    if (!assignment.serviceable || !assignment.fulfillment_store_id) {
      return {
        status: "BLOCKED",
        fulfillment_store_id: null,
        delivery_fee: null,
        subtotal: 0,
        total: 0,
        items: [],
        issues: [{ code: "ADDRESS_UNSERVICEABLE", message: assignment.reason }],
      };
    }

    const canonicalItems = await loadCanonicalCartItems(
      { query },
      assignment.fulfillment_store_id,
      input.items,
    );
    const itemIssues = canonicalItems.flatMap((item) => item.issues);
    const subtotal = canonicalItems.reduce((sum, item) => sum + item.line_total, 0);
    const quote = await this.zones.getDeliveryQuote({
      municipality_id: Number(address.municipality_id),
      ward_id: Number(address.ward_id),
      store_id: assignment.fulfillment_store_id,
      order_value: subtotal,
    });
    if (!quote.serviceable) {
      return {
        status: "BLOCKED",
        fulfillment_store_id: assignment.fulfillment_store_id,
        delivery_fee: null,
        subtotal,
        total: subtotal,
        items: canonicalItems,
        issues: [
          ...itemIssues,
          {
            code: "ADDRESS_UNSERVICEABLE",
            message: quote.reason,
          },
        ],
      };
    }

    const hasBlockingItem = canonicalItems.some(
      (item) => item.status === "BLOCKED",
    );
    const hasChanges = canonicalItems.some(
      (item) => item.status === "CHANGES_REQUIRED",
    );
    return {
      status: hasBlockingItem ? "BLOCKED" : hasChanges ? "CHANGES_REQUIRED" : "READY",
      fulfillment_store_id: assignment.fulfillment_store_id,
      delivery_fee: Number(quote.delivery_fee || 0),
      subtotal,
      total: subtotal + Number(quote.delivery_fee || 0),
      items: canonicalItems,
      issues: itemIssues,
    };
  }
}

/** Shared by advisory validation and the final transactionally locked checkout. */
export async function loadCanonicalCartItems(
  db: QueryExecutor,
  storeId: string,
  requested: RequestedCartItem[],
) {
  if (requested.length === 0) throw new Error("Cart is empty");
  const ids = requested.map((item) => item.product_id);
  const productsResult = await db.query(
    `SELECT requested.product_id,
            p.name_en,
            p.status AS product_status,
            COALESCE(store_price.price, organization_price.price) AS authoritative_price
       FROM unnest($1::uuid[]) AS requested(product_id)
       LEFT JOIN products p ON p.id = requested.product_id
       LEFT JOIN LATERAL (
         SELECT price FROM product_prices
          WHERE product_id = p.id AND store_id = $2 AND active = TRUE
            AND valid_from <= NOW() AND (valid_to IS NULL OR valid_to > NOW())
          ORDER BY valid_from DESC LIMIT 1
       ) store_price ON TRUE
       LEFT JOIN LATERAL (
         SELECT price FROM product_prices
          WHERE product_id = p.id AND store_id IS NULL AND active = TRUE
            AND valid_from <= NOW() AND (valid_to IS NULL OR valid_to > NOW())
          ORDER BY valid_from DESC LIMIT 1
       ) organization_price ON TRUE`,
    [ids, storeId],
  );
  const stocksResult = await db.query(
    `SELECT requested.product_id,
            COALESCE(inventory.stock, 0)::int AS stock,
            COALESCE(reservations.reserved, 0)::int AS reserved
       FROM unnest($1::uuid[]) AS requested(product_id)
       LEFT JOIN LATERAL (
         SELECT SUM(quantity)::int AS stock FROM batch_inventory
          WHERE product_id = requested.product_id AND store_id = $2
       ) inventory ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(quantity)::int AS reserved FROM stock_reservations
          WHERE product_id = requested.product_id AND store_id = $2
            AND status = 'ACTIVE' AND (order_id IS NOT NULL OR expires_at > NOW())
       ) reservations ON TRUE`,
    [ids, storeId],
  );
  const productById = new Map(productsResult.rows.map((row) => [String(row.product_id), row]));
  const stockById = new Map(stocksResult.rows.map((row) => [String(row.product_id), row]));

  return requested.map((requestedItem) => {
    const product = productById.get(requestedItem.product_id);
    const stock = stockById.get(requestedItem.product_id);
    const available = Math.max(0, Number(stock?.stock || 0) - Number(stock?.reserved || 0));
    const quantity = Number(requestedItem.quantity);
    const price = Number(product?.authoritative_price);
    const issues: Array<{ code: string; message?: string }> = [];
    let status: "VALID" | "CHANGES_REQUIRED" | "BLOCKED" = "VALID";
    let validatedQuantity = quantity;
    if (!product || !product.product_status) {
      issues.push({ code: "PRODUCT_UNAVAILABLE" });
      status = "BLOCKED";
      validatedQuantity = 0;
    } else if (product.product_status !== "PUBLISHED") {
      issues.push({ code: "PRODUCT_INACTIVE" });
      status = "BLOCKED";
      validatedQuantity = 0;
    } else if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      issues.push({ code: "INVALID_QUANTITY" });
      status = "BLOCKED";
      validatedQuantity = 0;
    } else if (!Number.isFinite(price) || price <= 0) {
      issues.push({ code: "PRODUCT_UNAVAILABLE", message: "PRICE_UNAVAILABLE" });
      status = "BLOCKED";
      validatedQuantity = 0;
    } else if (available <= 0) {
      issues.push({ code: "OUT_OF_STOCK" });
      status = "BLOCKED";
      validatedQuantity = 0;
    } else if (quantity > available) {
      issues.push({ code: "INSUFFICIENT_STOCK" });
      status = "CHANGES_REQUIRED";
      validatedQuantity = available;
    }
    if (
      Number.isFinite(price) && price > 0 &&
      requestedItem.client_unit_price != null &&
      Math.round(Number(requestedItem.client_unit_price) * 100) !== Math.round(price * 100)
    ) {
      issues.push({ code: "PRICE_CHANGED" });
      if (status === "VALID") status = "CHANGES_REQUIRED";
    }
    return {
      product_id: requestedItem.product_id,
      product_name: product?.name_en ?? null,
      name_en: product?.name_en ?? null,
      quantity: validatedQuantity,
      authoritative_price: Number.isFinite(price) && price > 0 ? price : 0,
      requested_quantity: quantity,
      validated_quantity: validatedQuantity,
      client_unit_price: requestedItem.client_unit_price ?? null,
      current_unit_price: Number.isFinite(price) && price > 0 ? price : null,
      line_total:
        Number.isFinite(price) && price > 0
          ? (Math.round(price * 100) * validatedQuantity) / 100
          : 0,
      available_quantity: available,
      status,
      issues,
    };
  });
}
