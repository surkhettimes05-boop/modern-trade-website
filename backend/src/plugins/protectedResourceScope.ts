import { FastifyRequest } from "fastify";
import { query } from "../database/connection.js";
import { AuthenticatedUser, requireStoreAccess } from "./authorization.js";

export class ProtectedResourceScopeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

const NON_RESOURCE_PARAMS = new Set(["storeId", "productId", "days"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function opaqueResourceParam(
  paramsValue: unknown,
): { key: string; value: string } | undefined {
  for (const [key, value] of Object.entries(record(paramsValue))) {
    if (NON_RESOURCE_PARAMS.has(key)) continue;
    if (!/(?:id|number)$/i.test(key)) continue;
    const parsed = stringValue(value);
    if (parsed) return { key, value: parsed };
  }
  return undefined;
}

function suppliedStoreIds(request: FastifyRequest): string[] {
  const values = [
    ...Object.entries(record(request.body)),
    ...Object.entries(record(request.query)),
    ...Object.entries(record(request.params)),
  ];
  return [
    ...new Set(
      values
        .filter(([key]) =>
          ["store_id", "storeId", "from_store_id", "to_store_id"].includes(key),
        )
        .map(([, value]) => stringValue(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

type ResourceLookup = {
  path: RegExp;
  values: (request: FastifyRequest) => unknown[] | undefined;
  sql: string;
  storeColumns?: string[];
};

function field(
  request: FastifyRequest,
  source: "body" | "params" | "query",
  key: string,
): string | undefined {
  return stringValue(record(request[source])[key]);
}

const RESOURCE_LOOKUPS: ResourceLookup[] = [
  {
    path: /^\/pos\/sale\/number\//,
    values: (request) => [field(request, "params", "sale_number")],
    sql: "SELECT store_id FROM sales WHERE sale_number = $1 LIMIT 1",
  },
  {
    path: /^\/pos\/sale\//,
    values: (request) => [field(request, "params", "id")],
    sql: "SELECT store_id FROM sales WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/pos\/return$/,
    values: (request) => [field(request, "body", "sale_id")],
    sql: "SELECT store_id FROM sales WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/purchase-orders\/items\//,
    values: (request) => [field(request, "params", "itemId")],
    sql: `SELECT po.store_id
            FROM purchase_order_items item
            JOIN purchase_orders po ON po.id = item.po_id
           WHERE item.id = $1
           LIMIT 1`,
  },
  {
    path: /^\/purchase-orders\/number\//,
    values: (request) => [field(request, "params", "poNumber")],
    sql: "SELECT store_id FROM purchase_orders WHERE po_number = $1 LIMIT 1",
  },
  {
    path: /^\/purchase-orders\//,
    values: (request) => [field(request, "params", "poId")],
    sql: "SELECT store_id FROM purchase_orders WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/receiving\/number\//,
    values: (request) => [field(request, "params", "receivingNumber")],
    sql: "SELECT store_id FROM receiving WHERE receiving_number = $1 LIMIT 1",
  },
  {
    path: /^\/receiving\/items\//,
    values: (request) => [field(request, "params", "itemId")],
    sql: `SELECT r.store_id
            FROM receiving_items ri
            JOIN receiving r ON r.id = ri.receiving_id
           WHERE ri.id = $1
           LIMIT 1`,
  },
  {
    path: /^\/receiving\//,
    values: (request) => [field(request, "params", "receivingId")],
    sql: "SELECT store_id FROM receiving WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/receiving$/,
    values: (request) => [field(request, "body", "po_id")],
    sql: "SELECT store_id FROM purchase_orders WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/batches\/quality-exceptions\//,
    values: (request) => [field(request, "params", "exceptionId")],
    sql: `SELECT store_id
            FROM inventory_quality_exceptions
           WHERE id = $1
           LIMIT 1`,
  },
  {
    path: /^\/batches\/(?!merge(?:\/|$))[^/]+/,
    values: (request) => [field(request, "params", "batchId")],
    sql: "SELECT store_id FROM batch_inventory WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/batches\/merge$/,
    values: (request) => {
      const body = record(request.body);
      const target = stringValue(body.target_batch_id);
      const sources = Array.isArray(body.source_batch_ids)
        ? body.source_batch_ids.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      return target ? [[target, ...sources]] : undefined;
    },
    sql: "SELECT DISTINCT store_id FROM batch_inventory WHERE id = ANY($1::uuid[])",
  },
  {
    path: /^\/transfers\/number\//,
    values: (request) => [field(request, "params", "transferNumber")],
    sql: `SELECT from_store_id, to_store_id
            FROM inventory_transfers
           WHERE transfer_number = $1
           LIMIT 1`,
    storeColumns: ["from_store_id", "to_store_id"],
  },
  {
    path: /^\/transfers\/items\//,
    values: (request) => [field(request, "params", "itemId")],
    sql: `SELECT t.from_store_id, t.to_store_id
            FROM inventory_transfer_items i
            JOIN inventory_transfers t ON t.id = i.transfer_id
           WHERE i.id = $1
           LIMIT 1`,
    storeColumns: ["from_store_id", "to_store_id"],
  },
  {
    path: /^\/transfers\//,
    values: (request) => [field(request, "params", "transferId")],
    sql: `SELECT from_store_id, to_store_id
            FROM inventory_transfers
           WHERE id = $1
           LIMIT 1`,
    storeColumns: ["from_store_id", "to_store_id"],
  },
  {
    path: /^\/shifts\/number\//,
    values: (request) => [field(request, "params", "shiftNumber")],
    sql: "SELECT store_id FROM shifts WHERE shift_number = $1 LIMIT 1",
  },
  {
    path: /^\/shifts\//,
    values: (request) => [field(request, "params", "shiftId")],
    sql: "SELECT store_id FROM shifts WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/tender-reconciliations\/number\//,
    values: (request) => [field(request, "params", "reconciliationNumber")],
    sql: `SELECT store_id FROM tender_reconciliations
           WHERE reconciliation_number = $1 LIMIT 1`,
  },
  {
    path: /^\/tender-reconciliations\/shift\//,
    values: (request) => [field(request, "params", "shiftId")],
    sql: "SELECT store_id FROM shifts WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/tender-reconciliations\//,
    values: (request) => [field(request, "params", "reconciliationId")],
    sql: "SELECT store_id FROM tender_reconciliations WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/tender-reconciliations$/,
    values: (request) => [field(request, "body", "shift_id")],
    sql: "SELECT store_id FROM shifts WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/audit-reports\/shift\//,
    values: (request) => [field(request, "params", "shiftId")],
    sql: "SELECT store_id FROM shifts WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/audit-reports\//,
    values: (request) => [field(request, "params", "reportId")],
    sql: "SELECT store_id FROM audit_reports WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/offline-sync\/conflicts\/[^/]+\/resolve$/,
    values: (request) => [field(request, "params", "transactionId")],
    sql: "SELECT store_id FROM offline_transaction_queue WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/offline-sync\/batches\/[^/]+\/process$/,
    values: (request) => [field(request, "params", "batchId")],
    sql: "SELECT store_id FROM sync_batch_log WHERE batch_id = $1 LIMIT 1",
  },
  {
    path: /^\/offline-sync\/(?:devices|status|retry|conflicts)\//,
    values: (request) => [field(request, "params", "deviceId")],
    sql: "SELECT store_id FROM devices WHERE device_id = $1 LIMIT 1",
  },
  {
    path: /^\/offline-sync\/transactions$/,
    values: (request) => [field(request, "body", "device_id")],
    sql: "SELECT store_id FROM devices WHERE device_id = $1 LIMIT 1",
  },
  {
    path: /^\/offline-sync\/batches$/,
    values: (request) => [field(request, "body", "device_id")],
    sql: "SELECT store_id FROM devices WHERE device_id = $1 LIMIT 1",
  },
  {
    path: /^\/sync-status\/devices\//,
    values: (request) => [field(request, "params", "deviceId")],
    sql: "SELECT store_id FROM devices WHERE device_id = $1 LIMIT 1",
  },
  {
    path: /^\/alerts\//,
    values: (request) => [field(request, "params", "id")],
    sql: "SELECT store_id FROM alerts WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/payments\/intents\//,
    values: (request) => [field(request, "params", "intentId")],
    sql: "SELECT store_id FROM payment_intents WHERE id = $1 LIMIT 1",
  },
  {
    path: /^\/pos-devices\/(?!store\/|offline(?:\/|$)|mark-offline(?:\/|$))/,
    values: (request) => [field(request, "params", "deviceId")],
    sql: "SELECT store_id FROM pos_devices WHERE device_id = $1 LIMIT 1",
  },
];

async function resolvedResourceStoreIds(
  request: FastifyRequest,
): Promise<string[] | undefined> {
  const path = request.url.split("?", 1)[0].replace(/^\/api/, "");
  const lookup = RESOURCE_LOOKUPS.find((candidate) =>
    candidate.path.test(path),
  );
  if (!lookup) return undefined;

  const values = lookup.values(request);
  if (!values || values.some((value) => value === undefined)) return undefined;
  const result = await query(lookup.sql, values);
  if (!result.rows.length) {
    throw new ProtectedResourceScopeError(
      "Protected resource not found",
      "RESOURCE_NOT_FOUND",
    );
  }

  const columns = lookup.storeColumns || ["store_id"];
  const storeIds = [
    ...new Set(
      result.rows.flatMap((row) =>
        columns
          .map((column) =>
            stringValue((row as Record<string, unknown>)[column]),
          )
          .filter((value): value is string => Boolean(value)),
      ),
    ),
  ];
  if (!storeIds.length) {
    throw new ProtectedResourceScopeError(
      "Protected resource has no authoritative store assignment",
      "RESOURCE_SCOPE_UNASSIGNED",
    );
  }
  return storeIds;
}

async function resolveStaffTarget(request: FastifyRequest) {
  const params = record(request.params);
  const staffId = stringValue(params.staffId);
  const staffNumber = stringValue(params.staffNumber);
  if (!staffId && !staffNumber) return null;

  const result = await query(
    `SELECT s.id, s.store_id, s.capabilities, r.role_key
       FROM staff s
       LEFT JOIN roles r ON r.id = s.role_id
      WHERE ${staffId ? "s.id = $1" : "s.staff_number = $1"}
      LIMIT 1`,
    [staffId || staffNumber],
  );
  if (!result.rows[0]) {
    throw new ProtectedResourceScopeError(
      "Staff member not found",
      "RESOURCE_NOT_FOUND",
    );
  }
  return result.rows[0] as {
    id: string;
    store_id?: string | null;
    capabilities?: string[] | null;
    role_key?: string | null;
  };
}

async function assertStaffTargetSecurity(
  request: FastifyRequest,
  actor: AuthenticatedUser,
): Promise<string | undefined> {
  const path = request.url.split("?", 1)[0].replace(/^\/api/, "");
  if (!path.startsWith("/staff/")) return undefined;
  const target = await resolveStaffTarget(request);
  if (!target) return undefined;

  const actorIsSystem =
    actor.roleKey === "platform_admin" ||
    actor.capabilities?.includes("system.manage");
  const targetIsSystem =
    target.role_key === "platform_admin" ||
    target.capabilities?.includes("system.manage");
  const isSelf = target.id === actor.id;

  if (path.endsWith("/verify-password") && !isSelf) {
    throw new ProtectedResourceScopeError(
      "Password verification is restricted to the authenticated staff member",
      "STAFF_TARGET_DENIED",
    );
  }
  if (path.endsWith("/mfa/enable") && !isSelf) {
    throw new ProtectedResourceScopeError(
      "MFA enrollment is restricted to the authenticated staff member",
      "STAFF_TARGET_DENIED",
    );
  }
  if (path.endsWith("/mfa/disable")) {
    if (!isSelf) {
      throw new ProtectedResourceScopeError(
        "MFA removal is restricted to the authenticated staff member",
        "STAFF_TARGET_DENIED",
      );
    }
    if (!actor.mfaEnabled || !actor.mfaVerified) {
      throw new ProtectedResourceScopeError(
        "Verified MFA is required before disabling MFA",
        "MFA_REQUIRED",
      );
    }
  }
  const mutatingAnotherAccount =
    !isSelf && !["GET", "HEAD"].includes(request.method);
  if (targetIsSystem && mutatingAnotherAccount && !actorIsSystem) {
    throw new ProtectedResourceScopeError(
      "System administrators can only be changed by a verified system administrator",
      "STAFF_TARGET_DENIED",
    );
  }
  if (
    mutatingAnotherAccount &&
    (targetIsSystem || path.endsWith("/password")) &&
    (!actorIsSystem || !actor.mfaEnabled || !actor.mfaVerified)
  ) {
    throw new ProtectedResourceScopeError(
      "Verified system administration is required for this staff credential change",
      "MFA_REQUIRED",
    );
  }
  return target.store_id || undefined;
}

/**
 * Enforce store scope using the authoritative target where one is available.
 * Opaque resource routes without an ownership resolver fail closed: accepting a
 * decoy store_id would otherwise allow cross-store object access.
 */
export async function assertProtectedResourceScope(
  request: FastifyRequest,
): Promise<void> {
  const actor = request.user as AuthenticatedUser;
  const authoritativeStaffStore = await assertStaffTargetSecurity(
    request,
    actor,
  );

  if (actor.scopeType === "GLOBAL") return;
  if (authoritativeStaffStore) {
    await requireStoreAccess(request, authoritativeStaffStore);
    return;
  }

  const authoritativeResourceStores = await resolvedResourceStoreIds(request);
  const opaque = opaqueResourceParam(request.params);
  if (opaque && !authoritativeResourceStores) {
    throw new ProtectedResourceScopeError(
      `Store ownership for ${opaque.key} must be resolved server-side`,
      "RESOURCE_SCOPE_UNVERIFIED",
    );
  }

  const storeIds = [
    ...new Set([
      ...(authoritativeResourceStores || []),
      ...suppliedStoreIds(request),
    ]),
  ];
  if (!storeIds.length) {
    throw new ProtectedResourceScopeError(
      "Store ID is required for store-scoped operations",
      "STORE_ID_REQUIRED",
    );
  }
  for (const storeId of storeIds) await requireStoreAccess(request, storeId);
}
