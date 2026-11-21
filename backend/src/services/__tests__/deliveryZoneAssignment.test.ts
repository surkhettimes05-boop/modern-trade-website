import { query } from "../../database/connection.js";
import { DeliveryZoneService } from "../deliveryZoneService.js";

jest.mock("../../database/connection.js", () => ({ query: jest.fn() }));

const databaseQuery = query as jest.Mock;
const service = new DeliveryZoneService();

const zone = (storeId: string, municipality: number, ward: number) => ({
  id: `zone-${storeId}`,
  store_id: storeId,
  zone_name: "Surkhet",
  included_municipalities: [municipality],
  included_wards: [ward],
  excluded_areas: [],
  base_fee: 100,
  surcharge: 10,
  free_delivery_threshold: null,
  minimum_order_value: 0,
  estimated_delivery_hours: 4,
  delivery_time_slots: [],
});

function configure(
  stores: Array<{ id: string }>,
  zones: ReturnType<typeof zone>[],
) {
  databaseQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("FROM stores")) {
      expect(sql).toContain("status = 'PUBLISHED'");
      expect(sql).toContain("is_temporarily_closed = FALSE");
      expect(sql).toContain("ORDER BY lower(name_en), id");
      return { rows: stores };
    }
    if (sql.includes("FROM delivery_zones")) {
      return { rows: zones.filter((item) => item.store_id === params?.[0]) };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
}

describe("backend fulfillment store assignment", () => {
  beforeEach(() => databaseQuery.mockReset());

  it("assigns a store whose existing zone covers the saved address", async () => {
    configure([{ id: "store-a" }], [zone("store-a", 10, 20)]);

    await expect(
      service.resolveFulfillmentStore({ municipality_id: 10, ward_id: 20 }),
    ).resolves.toMatchObject({
      serviceable: true,
      fulfillment_store_id: "store-a",
      delivery_fee: 110,
      estimated_delivery_hours: 4,
    });
  });

  it("returns unserviceable when no store zone covers the address", async () => {
    configure([{ id: "store-a" }], [zone("store-a", 10, 20)]);

    await expect(
      service.resolveFulfillmentStore({ municipality_id: 11, ward_id: 21 }),
    ).resolves.toMatchObject({
      serviceable: false,
      fulfillment_store_id: null,
      delivery_fee: null,
      reason: "OUTSIDE_SERVICE_AREA",
    });
  });

  it("queries only published open stores, so inactive/closed stores cannot win", async () => {
    configure([{ id: "active-store" }], [zone("active-store", 10, 20)]);

    await service.resolveFulfillmentStore({ municipality_id: 10, ward_id: 20 });

    const storesSql = databaseQuery.mock.calls[0][0] as string;
    expect(storesSql).toContain("status = 'PUBLISHED'");
    expect(storesSql).toContain("is_temporarily_closed = FALSE");
    expect(
      databaseQuery.mock.calls.some(([, params]) =>
        (params as unknown[] | undefined)?.includes("inactive-store"),
      ),
    ).toBe(false);
  });

  it("selects the first eligible store deterministically when several qualify", async () => {
    configure(
      [{ id: "alpha-store" }, { id: "beta-store" }],
      [zone("alpha-store", 10, 20), zone("beta-store", 10, 20)],
    );

    const result = await service.resolveFulfillmentStore({
      municipality_id: 10,
      ward_id: 20,
    });

    expect(result.fulfillment_store_id).toBe("alpha-store");
    expect(databaseQuery.mock.calls[0][0]).toContain(
      "ORDER BY lower(name_en), id",
    );
  });

  it("recomputes assignment for changed address geography instead of reusing prior state", async () => {
    configure(
      [{ id: "store-north" }, { id: "store-south" }],
      [zone("store-north", 10, 20), zone("store-south", 11, 21)],
    );

    const first = await service.resolveFulfillmentStore({
      municipality_id: 10,
      ward_id: 20,
    });
    const changed = await service.resolveFulfillmentStore({
      municipality_id: 11,
      ward_id: 21,
    });

    expect(first.fulfillment_store_id).toBe("store-north");
    expect(changed.fulfillment_store_id).toBe("store-south");
  });
});
