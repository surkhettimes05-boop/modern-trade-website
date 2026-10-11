import { createHash } from "node:crypto";
import { getPool, query } from "../database/connection.js";

const ALLOWED_STATUSES = new Set([
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "SCHEDULED",
  "UNPUBLISHED",
  "EXPIRED",
]);

export type ProductImportSourceRow = Record<string, unknown>;

export type ProductImportPreparedRow = {
  rowNumber: number;
  sku: string;
  persistedSku: string;
  name: string;
  description: string | null;
  category: string | null;
  categoryId: string | null;
  packSize: string | null;
  unit: string | null;
  sellingPrice: number | null;
  status: string;
  imageUrl: string | null;
  action: "CREATE" | "UPDATE" | "ERROR";
  errors: string[];
  existingId: string | null;
  openingQuantity: number | null;
  unitCost: number | null;
  batchCode: string | null;
  stockDate: string | null;
  expiryDate: string | null;
  openingReason: string | null;
};

export type ProductImportPreview = {
  summary: {
    total: number;
    create: number;
    update: number;
    error: number;
    openingStock: number;
  };
  rows: ProductImportPreparedRow[];
};

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function optionalText(value: unknown, max: number, label: string, errors: string[]): string | null {
  const valueText = textValue(value);
  if (!valueText) return null;
  if (valueText.length > max) {
    errors.push(`${label} must be at most ${max} characters`);
    return null;
  }
  return valueText;
}

function parsePrice(value: unknown, errors: string[]): number | null {
  const valueText = textValue(value);
  if (!valueText) return null;
  const parsed = Number(valueText);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 99_999_999.99) {
    errors.push("selling_price must be a positive number");
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

function parseOptionalNumber(value: unknown, label: string, errors: string[], allowZero = true): number | null {
  const valueText = textValue(value);
  if (!valueText) return null;
  const parsed = Number(valueText);
  if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed === 0) || parsed > 99_999_999.99) {
    errors.push(`${label} must be a valid non-negative number`);
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

function parseDate(value: unknown, label: string, errors: string[]): string | null {
  const valueText = textValue(value);
  if (!valueText) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valueText) || Number.isNaN(Date.parse(`${valueText}T00:00:00Z`))) {
    errors.push(`${label} must use YYYY-MM-DD`);
    return null;
  }
  return valueText;
}

function deterministicOperationId(importId: string, sku: string): string {
  const hex = createHash("sha256").update(`${importId}:${normalizeKey(sku)}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function parseHttpsUrl(value: unknown, errors: string[]): string | null {
  const valueText = textValue(value);
  if (!valueText) return null;
  try {
    const parsed = new URL(valueText);
    if (parsed.protocol !== "https:") throw new Error("https required");
    return parsed.toString();
  } catch {
    errors.push("image_url must be a valid HTTPS URL");
    return null;
  }
}

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function businessDateInNepal(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

export async function previewProductImport(
  rawRows: ProductImportSourceRow[],
  storeId?: string,
): Promise<ProductImportPreview> {
  const baseRows = rawRows.map((raw, index) => {
    const errors: string[] = [];
    const sku = textValue(raw.sku);
    const name = textValue(raw.name);
    if (!sku) errors.push("sku is required");
    else if (sku.length > 100) errors.push("sku must be at most 100 characters");
    if (!name) errors.push("name is required");
    else if (name.length > 255) errors.push("name must be at most 255 characters");

    const description = optionalText(raw.description, 10_000, "description", errors);
    const category = optionalText(raw.category, 255, "category", errors);
    const packSize = optionalText(raw.pack_size, 100, "pack_size", errors);
    const unit = optionalText(raw.unit, 50, "unit", errors);
    const sellingPrice = parsePrice(raw.selling_price, errors);
    const imageUrl = parseHttpsUrl(raw.image_url, errors);
    const openingQuantity = parseOptionalNumber(raw.opening_quantity, "opening_quantity", errors);
    const unitCost = parseOptionalNumber(raw.unit_cost, "unit_cost", errors);
    const batchCode = optionalText(raw.batch_code, 100, "batch_code", errors);
    const stockDate = parseDate(raw.stock_date, "stock_date", errors);
    const expiryDate = parseDate(raw.expiry_date, "expiry_date", errors);
    const openingReason = optionalText(raw.opening_reason, 500, "opening_reason", errors);
    if (openingQuantity != null && openingQuantity > 0) {
      if (!storeId) errors.push("choose a store before importing opening stock");
      if (unitCost == null) errors.push("unit_cost is required when opening_quantity is greater than 0");
      if (!batchCode) errors.push("batch_code is required when opening_quantity is greater than 0");
      if (!stockDate) errors.push("stock_date is required when opening_quantity is greater than 0");
      const today = businessDateInNepal();
      if (stockDate && stockDate > today) errors.push("stock_date cannot be in the future");
      if (expiryDate && stockDate && expiryDate < stockDate) errors.push("expiry_date cannot be before stock_date");
    }
    const rawStatus = textValue(raw.status).toUpperCase();
    if (rawStatus && !ALLOWED_STATUSES.has(rawStatus)) {
      errors.push("status is invalid");
    }

    return {
      rowNumber: index + 2,
      sku,
      name,
      description,
      category,
      packSize,
      unit,
      sellingPrice,
      requestedStatus: rawStatus || null,
      imageUrl,
      openingQuantity,
      unitCost,
      batchCode,
      stockDate,
      expiryDate,
      openingReason,
      errors,
    };
  });

  const duplicateCounts = new Map<string, number>();
  for (const row of baseRows) {
    if (!row.sku) continue;
    const key = normalizeKey(row.sku);
    duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
  }
  for (const row of baseRows) {
    if (row.sku && (duplicateCounts.get(normalizeKey(row.sku)) || 0) > 1) {
      row.errors.push("duplicate sku in this CSV");
    }
  }

  const skuKeys = Array.from(
    new Set(baseRows.filter((row) => row.sku).map((row) => normalizeKey(row.sku))),
  );
  const existingResult = skuKeys.length
    ? await query(
        `SELECT id::text, sku, status::text
         FROM products
         WHERE lower(sku) = ANY($1::text[])`,
        [skuKeys],
      )
    : { rows: [] as Array<Record<string, unknown>> };

  const existingBySku = new Map<
    string,
    { id: string; sku: string; status: string }
  >();
  for (const row of existingResult.rows) {
    existingBySku.set(normalizeKey(String(row.sku)), {
      id: String(row.id),
      sku: String(row.sku),
      status: String(row.status),
    });
  }

  const categoriesResult = await query(
    "SELECT id::text, name_en, slug FROM categories ORDER BY name_en",
  );
  const categoryByKey = new Map<string, { id: string; name: string }>();
  for (const row of categoriesResult.rows) {
    const entry = { id: String(row.id), name: String(row.name_en) };
    categoryByKey.set(normalizeKey(String(row.name_en)), entry);
    categoryByKey.set(normalizeKey(String(row.slug)), entry);
  }

  const existingIds = Array.from(existingBySku.values()).map((row) => row.id);
  const pricedIds = new Set<string>();
  if (existingIds.length) {
    const activePrices = await query(
      `SELECT DISTINCT product_id::text
       FROM product_prices
       WHERE product_id = ANY($1::uuid[])
         AND active = TRUE
         AND valid_from <= NOW()
         AND (valid_to IS NULL OR valid_to > NOW())
         AND (
           ($2::uuid IS NULL AND store_id IS NULL)
           OR ($2::uuid IS NOT NULL AND (store_id = $2 OR store_id IS NULL))
         )`,
      [existingIds, storeId || null],
    );
    for (const row of activePrices.rows) pricedIds.add(String(row.product_id));
  }

  const openingRows = baseRows.filter((row) => row.openingQuantity != null && row.openingQuantity > 0 && row.batchCode);
  if (storeId && openingRows.length) {
    const productSkus = openingRows.map((row) => normalizeKey(row.sku)).filter(Boolean);
    const duplicateBatches = await query(
      `SELECT lower(p.sku) AS sku_key, bi.batch_id
       FROM batch_inventory bi
       JOIN products p ON p.id = bi.product_id
       WHERE bi.store_id = $1
         AND lower(p.sku) = ANY($2::text[])
         AND bi.batch_id = ANY($3::text[])`,
      [storeId, productSkus, openingRows.map((row) => row.batchCode)],
    );
    const existingBatchKeys = new Set(duplicateBatches.rows.map((row) => `${row.sku_key}::${row.batch_id}`));
    for (const row of openingRows) {
      if (existingBatchKeys.has(`${normalizeKey(row.sku)}::${row.batchCode}`)) {
        row.errors.push("batch_code already exists for this product/store");
      }
    }
  }

  const rows: ProductImportPreparedRow[] = baseRows.map((row) => {
    const existing = row.sku ? existingBySku.get(normalizeKey(row.sku)) : undefined;
    let categoryId: string | null = null;
    if (row.category) {
      const category = categoryByKey.get(normalizeKey(row.category));
      if (!category) row.errors.push(`unknown category: ${row.category}`);
      else categoryId = category.id;
    }
    const status = row.requestedStatus || existing?.status || "DRAFT";
    if (
      status === "PUBLISHED" &&
      row.sellingPrice == null &&
      (!existing || !pricedIds.has(existing.id))
    ) {
      row.errors.push("published products require an active selling price");
    }

    return {
      rowNumber: row.rowNumber,
      sku: row.sku,
      persistedSku: existing?.sku || row.sku,
      name: row.name,
      description: row.description,
      category: row.category,
      categoryId,
      packSize: row.packSize,
      unit: row.unit,
      sellingPrice: row.sellingPrice,
      status,
      imageUrl: row.imageUrl,
      action: row.errors.length ? "ERROR" : existing ? "UPDATE" : "CREATE",
      errors: row.errors,
      existingId: existing?.id || null,
      openingQuantity: row.openingQuantity,
      unitCost: row.unitCost,
      batchCode: row.batchCode,
      stockDate: row.stockDate,
      expiryDate: row.expiryDate,
      openingReason: row.openingReason,
    };
  });

  return {
    summary: {
      total: rows.length,
      create: rows.filter((row) => row.action === "CREATE").length,
      update: rows.filter((row) => row.action === "UPDATE").length,
      error: rows.filter((row) => row.action === "ERROR").length,
      openingStock: rows.filter((row) => (row.openingQuantity || 0) > 0).length,
    },
    rows,
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export async function commitProductImport(
  rawRows: ProductImportSourceRow[],
  actorId: string,
  storeId?: string,
  importId?: string,
): Promise<ProductImportPreview & { priced: number; openingPosted: number }> {
  const preview = await previewProductImport(rawRows, storeId);
  if (preview.summary.error > 0) {
    const error = new Error("Product import contains validation errors") as Error & {
      preview?: ProductImportPreview;
    };
    error.preview = preview;
    throw error;
  }

  const client = await getPool().connect();
  const idBySku = new Map<string, string>();
  try {
    await client.query("BEGIN");

    for (const batch of chunks(preview.rows, 250)) {
      const params: unknown[] = [];
      const valueSql = batch.map((row, index) => {
        const offset = index * 11;
        params.push(
          row.persistedSku,
          row.name,
          row.description,
          row.categoryId,
          row.packSize,
          row.unit,
          row.imageUrl,
          row.status,
          row.status === "PUBLISHED" ? new Date() : null,
          actorId,
          actorId,
        );
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11})`;
      });

      const result = await client.query(
        `INSERT INTO products
          (sku, name_en, description_en, category_id, pack_size_en, unit_en, image_url, status, published_at, created_by, updated_by)
         VALUES ${valueSql.join(",")}
         ON CONFLICT (sku) DO UPDATE SET
           name_en = EXCLUDED.name_en,
           description_en = COALESCE(EXCLUDED.description_en, products.description_en),
           category_id = COALESCE(EXCLUDED.category_id, products.category_id),
           pack_size_en = COALESCE(EXCLUDED.pack_size_en, products.pack_size_en),
           unit_en = COALESCE(EXCLUDED.unit_en, products.unit_en),
           image_url = COALESCE(EXCLUDED.image_url, products.image_url),
           status = EXCLUDED.status,
           published_at = CASE
             WHEN EXCLUDED.status = 'PUBLISHED'
               THEN COALESCE(products.published_at, EXCLUDED.published_at, NOW())
             ELSE products.published_at
           END,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING id::text, sku`,
        params,
      );
      for (const row of result.rows) {
        idBySku.set(normalizeKey(String(row.sku)), String(row.id));
      }
    }

    const pricedRows = preview.rows.filter((row) => row.sellingPrice != null);
    const pricedProductIds = pricedRows
      .map((row) => idBySku.get(normalizeKey(row.persistedSku)))
      .filter((id): id is string => Boolean(id));

    if (pricedProductIds.length) {
      await client.query(
        `UPDATE product_prices
         SET active = FALSE, valid_to = NOW()
         WHERE product_id = ANY($1::uuid[])
           AND active = TRUE
           AND (
             ($2::uuid IS NULL AND store_id IS NULL)
             OR ($2::uuid IS NOT NULL AND store_id = $2)
           )`,
        [pricedProductIds, storeId || null],
      );

      for (const batch of chunks(pricedRows, 500)) {
        const params: unknown[] = [];
        const valueSql = batch.map((row, index) => {
          const productId = idBySku.get(normalizeKey(row.persistedSku));
          if (!productId) throw new Error(`Unable to resolve imported SKU ${row.persistedSku}`);
          const offset = index * 4;
          params.push(productId, storeId || null, row.sellingPrice, "NPR");
          return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},TRUE,NOW())`;
        });
        await client.query(
          `INSERT INTO product_prices
            (product_id, store_id, price, currency_code, active, valid_from)
           VALUES ${valueSql.join(",")}`,
          params,
        );
      }
    }

    const openingRows = preview.rows.filter((row) => (row.openingQuantity || 0) > 0);
    if (openingRows.length && (!storeId || !importId)) {
      throw new Error("Store and import ID are required for opening stock");
    }
    for (const row of openingRows) {
      const productId = idBySku.get(normalizeKey(row.persistedSku));
      if (!productId || !storeId || !importId || !row.batchCode || row.unitCost == null || !row.stockDate) {
        throw new Error(`Opening stock could not be resolved for SKU ${row.persistedSku}`);
      }
      const referenceId = deterministicOperationId(importId, row.persistedSku);
      const prior = await client.query(
        `SELECT id FROM inventory_transactions WHERE reference_type='OPENING_STOCK' AND reference_id=$1 LIMIT 1`,
        [referenceId],
      );
      if (prior.rowCount) continue;
      const totalCost = Math.round((row.openingQuantity || 0) * row.unitCost * 100) / 100;
      await client.query(
        `INSERT INTO batch_inventory
          (store_id, product_id, batch_id, batch_number, expiry_date, quantity, cost, unit_cost, total_cost, received_date)
         VALUES ($1,$2,$3,$3,$4,$5,$6,$6,$7,$8)`,
        [storeId, productId, row.batchCode, row.expiryDate, row.openingQuantity, row.unitCost, totalCost, row.stockDate],
      );
      await client.query(
        `INSERT INTO inventory_transactions
          (transaction_type, store_id, product_id, batch_id, quantity, unit_cost, total_cost,
           reference_id, reference_type, reason, performed_by)
         VALUES ('ADJUSTMENT',$1,$2,$3,$4,$5,$6,$7,'OPENING_STOCK',$8,$9)`,
        [storeId, productId, row.batchCode, row.openingQuantity, row.unitCost, totalCost, referenceId,
         row.openingReason || `Opening inventory import ${importId}`, actorId],
      );
      await client.query(
        `INSERT INTO store_product_availability (store_id, product_id, availability_status, last_updated)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (store_id, product_id) DO UPDATE SET availability_status=EXCLUDED.availability_status,last_updated=NOW()`,
        [storeId, productId, (row.openingQuantity || 0) <= 5 ? "LOW_STOCK" : "AVAILABLE"],
      );
    }

    await client.query("COMMIT");
    return { ...preview, priced: pricedRows.length, openingPosted: openingRows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
