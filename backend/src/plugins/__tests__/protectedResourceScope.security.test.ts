import { query } from "../../database/connection.js";
import { requireStoreAccess } from "../authorization.js";
import {
  assertProtectedResourceScope,
  ProtectedResourceScopeError,
} from "../protectedResourceScope.js";

jest.mock("../../database/connection.js", () => ({ query: jest.fn() }));
jest.mock("../authorization.js", () => ({
  requireStoreAccess: jest.fn(),
}));

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedRequireStoreAccess = requireStoreAccess as jest.MockedFunction<
  typeof requireStoreAccess
>;

function request(overrides: Record<string, unknown> = {}) {
  return {
    method: "GET",
    url: "/api/purchase-orders/po-b?store_id=store-a",
    params: { poId: "po-b" },
    query: { store_id: "store-a" },
    body: undefined,
    user: {
      id: "staff-a",
      username: "manager-a",
      roleId: "role-manager",
      roleKey: "store_manager",
      capabilities: ["staff.read", "staff.manage"],
      scopeType: "STORE",
      scopeStoreIds: ["store-a"],
      storeId: "store-a",
      mfaEnabled: false,
      mfaVerified: false,
    },
    ...overrides,
  } as any;
}

describe("protected resource scope", () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    mockedRequireStoreAccess.mockReset();
    mockedRequireStoreAccess.mockResolvedValue(undefined);
  });

  it("rejects a caller-supplied decoy store for an opaque resource", async () => {
    mockedQuery.mockResolvedValue({
      rows: [{ store_id: "store-b" }],
      rowCount: 1,
    } as any);
    mockedRequireStoreAccess.mockRejectedValueOnce(
      new Error("Store is outside the user's scope"),
    );
    await expect(assertProtectedResourceScope(request())).rejects.toMatchObject(
      { message: "Store is outside the user's scope" },
    );
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM purchase_orders"),
      ["po-b"],
    );
    expect(mockedRequireStoreAccess).toHaveBeenCalledWith(
      expect.anything(),
      "store-b",
    );
  });

  it("checks both stores involved in a transfer", async () => {
    const transfer = request({
      method: "POST",
      url: "/api/transfers",
      params: {},
      query: {},
      body: { from_store_id: "store-a", to_store_id: "store-b" },
    });
    await assertProtectedResourceScope(transfer);
    expect(mockedRequireStoreAccess).toHaveBeenNthCalledWith(
      1,
      transfer,
      "store-a",
    );
    expect(mockedRequireStoreAccess).toHaveBeenNthCalledWith(
      2,
      transfer,
      "store-b",
    );
  });

  it("resolves both authoritative stores for an existing transfer", async () => {
    mockedQuery.mockResolvedValue({
      rows: [{ from_store_id: "store-a", to_store_id: "store-b" }],
      rowCount: 1,
    } as any);
    const transfer = request({
      url: "/api/transfers/transfer-b",
      params: { transferId: "transfer-b" },
      query: {},
    });

    await assertProtectedResourceScope(transfer);

    expect(mockedRequireStoreAccess).toHaveBeenNthCalledWith(
      1,
      transfer,
      "store-a",
    );
    expect(mockedRequireStoreAccess).toHaveBeenNthCalledWith(
      2,
      transfer,
      "store-b",
    );
  });

  it("resolves every batch participating in a merge", async () => {
    mockedQuery.mockResolvedValue({
      rows: [{ store_id: "store-a" }, { store_id: "store-b" }],
      rowCount: 2,
    } as any);
    const merge = request({
      method: "POST",
      url: "/api/batches/merge",
      params: {},
      query: {},
      body: {
        target_batch_id: "00000000-0000-4000-8000-000000000001",
        source_batch_ids: ["00000000-0000-4000-8000-000000000002"],
      },
    });

    await assertProtectedResourceScope(merge);

    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("ANY($1::uuid[])"),
      [
        [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
      ],
    );
    expect(mockedRequireStoreAccess).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "/api/purchase-orders/items/item-b/received",
      { itemId: "item-b" },
      "purchase_order_items",
    ],
    [
      "/api/batches/quality-exceptions/exception-b/resolve",
      { exceptionId: "exception-b" },
      "inventory_quality_exceptions",
    ],
  ])(
    "resolves nested resource ownership for %s",
    async (url, params, tableName) => {
      mockedQuery.mockResolvedValue({
        rows: [{ store_id: "store-b" }],
        rowCount: 1,
      } as any);
      const nestedRequest = request({
        method: "POST",
        url,
        params,
        query: {},
        body: {},
      });

      await assertProtectedResourceScope(nestedRequest);

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining(tableName),
        [Object.values(params)[0]],
      );
      expect(mockedRequireStoreAccess).toHaveBeenCalledWith(
        nestedRequest,
        "store-b",
      );
    },
  );

  it("keeps unknown opaque resource types fail closed", async () => {
    await expect(
      assertProtectedResourceScope(
        request({
          url: "/api/unknown/resource-b",
          params: { resourceId: "resource-b" },
          query: {},
        }),
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_SCOPE_UNVERIFIED" });
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it("uses the target staff store instead of a supplied store", async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        {
          id: "staff-b",
          store_id: "store-b",
          role_key: "cashier",
          capabilities: [],
        },
      ],
      rowCount: 1,
    } as any);
    const staffRequest = request({
      url: "/api/staff/staff-b?store_id=store-a",
      params: { staffId: "staff-b" },
    });
    await assertProtectedResourceScope(staffRequest);
    expect(mockedRequireStoreAccess).toHaveBeenCalledWith(
      staffRequest,
      "store-b",
    );
  });

  it("prevents a scoped manager from changing a system administrator", async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        {
          id: "platform-admin",
          store_id: "store-a",
          role_key: "platform_admin",
          capabilities: ["system.manage"],
        },
      ],
      rowCount: 1,
    } as any);
    await expect(
      assertProtectedResourceScope(
        request({
          method: "POST",
          url: "/api/staff/platform-admin/password",
          params: { staffId: "platform-admin" },
          body: { new_password: "attacker-controlled" },
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ProtectedResourceScopeError>>({
        code: "STAFF_TARGET_DENIED",
      }),
    );
  });

  it("prevents a global non-system actor from changing a system administrator", async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        {
          id: "platform-admin",
          store_id: null,
          role_key: "platform_admin",
          capabilities: ["system.manage"],
        },
      ],
      rowCount: 1,
    } as any);
    const globalRequest = request({
      method: "POST",
      url: "/api/staff/platform-admin/password",
      params: { staffId: "platform-admin" },
      body: { new_password: "attacker-controlled" },
      user: {
        id: "head-office-admin",
        username: "head-office-admin",
        roleId: "role-head-office",
        roleKey: "head_office_admin",
        capabilities: ["staff.manage"],
        scopeType: "GLOBAL",
        scopeStoreIds: [],
        mfaEnabled: true,
        mfaVerified: true,
      },
    });

    await expect(
      assertProtectedResourceScope(globalRequest),
    ).rejects.toMatchObject({ code: "STAFF_TARGET_DENIED" });
  });

  it("does not expose another staff member's password verification oracle", async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        {
          id: "staff-b",
          store_id: "store-a",
          role_key: "cashier",
          capabilities: [],
        },
      ],
      rowCount: 1,
    } as any);
    await expect(
      assertProtectedResourceScope(
        request({
          method: "POST",
          url: "/api/staff/staff-b/verify-password",
          params: { staffId: "staff-b" },
          body: { password: "guess" },
        }),
      ),
    ).rejects.toMatchObject({ code: "STAFF_TARGET_DENIED" });
  });
});
