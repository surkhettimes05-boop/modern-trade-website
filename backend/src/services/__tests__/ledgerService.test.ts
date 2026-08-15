import { query } from "../../database/connection.js";
import { LedgerService } from "../ledgerService.js";

const CUSTOMER_ID = "10000000-0000-4000-8000-000000000001";

describe("LedgerService", () => {
  let ledgerService: LedgerService;

  beforeAll(async () => {
    await query(
      `INSERT INTO customers (id, phone_normalized, phone_hash, preferred_name)
       VALUES ($1, '+9779800000001', 'ledger-test-customer-hash', 'Ledger Test Customer')
       ON CONFLICT (id) DO NOTHING`,
      [CUSTOMER_ID],
    );
  });

  beforeEach(() => {
    ledgerService = new LedgerService();
  });

  describe("createEntry", () => {
    it("persists an EARN entry and enforces idempotency", async () => {
      const input = {
        customer_id: CUSTOMER_ID,
        points_signed: 100,
        entry_type: "EARN" as const,
        effective_timestamp: new Date("2026-01-01T00:00:00.000Z"),
        source_type: "SALE",
        actor: "SYSTEM",
        reason: "Test earn",
        idempotency_key: "ledger-test-earn-1",
      };

      const created = await ledgerService.createEntry(input);
      const duplicate = await ledgerService.createEntry(input);
      const persisted = await ledgerService.findById(created.id);

      expect(created.customer_id).toBe(CUSTOMER_ID);
      expect(created.points_signed).toBe(100);
      expect(created.entry_type).toBe("EARN");
      expect(duplicate.id).toBe(created.id);
      expect(persisted).toMatchObject({
        id: created.id,
        customer_id: CUSTOMER_ID,
      });

      const rows = await ledgerService.getCustomerLedger(CUSTOMER_ID);
      expect(rows).toHaveLength(1);
    });

    it("persists a REDEEM entry as a negative debit", async () => {
      const created = await ledgerService.createEntry({
        customer_id: CUSTOMER_ID,
        points_signed: -50,
        entry_type: "REDEEM",
        effective_timestamp: new Date("2026-01-02T00:00:00.000Z"),
        source_type: "SALE",
        actor: "SYSTEM",
        reason: "Test redeem",
      });

      expect(created).toMatchObject({
        customer_id: CUSTOMER_ID,
        points_signed: -50,
        entry_type: "REDEEM",
        entry_status: "POSTED",
      });
      expect(
        (await ledgerService.calculateBalance(CUSTOMER_ID)).available,
      ).toBe(-50);
    });

    it("should reject zero points", async () => {
      await expect(
        ledgerService.createEntry({
          customer_id: CUSTOMER_ID,
          points_signed: 0,
          entry_type: "EARN",
          effective_timestamp: new Date(),
          source_type: "SALE",
          actor: "SYSTEM",
        }),
      ).rejects.toThrow("Points cannot be zero");
    });

    it("should reject EARN with negative points", async () => {
      await expect(
        ledgerService.createEntry({
          customer_id: CUSTOMER_ID,
          points_signed: -10,
          entry_type: "EARN",
          effective_timestamp: new Date(),
          source_type: "SALE",
          actor: "SYSTEM",
        }),
      ).rejects.toThrow("EARN entries must have positive points");
    });

    it("should reject REDEEM with positive points", async () => {
      await expect(
        ledgerService.createEntry({
          customer_id: CUSTOMER_ID,
          points_signed: 10,
          entry_type: "REDEEM",
          effective_timestamp: new Date(),
          source_type: "SALE",
          actor: "SYSTEM",
        }),
      ).rejects.toThrow("REDEEM entries must have negative points");
    });

    it("should require reversal_of_id for REVERSAL entries", async () => {
      await expect(
        ledgerService.createEntry({
          customer_id: CUSTOMER_ID,
          points_signed: -100,
          entry_type: "REVERSAL",
          effective_timestamp: new Date(),
          source_type: "VOID",
          actor: "SYSTEM",
        }),
      ).rejects.toThrow("Reversal entries must specify reversal_of_id");
    });
  });

  describe("calculateBalance", () => {
    it("calculates available and lifetime earned from persisted entries", async () => {
      await ledgerService.createEntry({
        customer_id: CUSTOMER_ID,
        points_signed: 100,
        entry_type: "EARN",
        effective_timestamp: new Date("2026-01-01T00:00:00.000Z"),
        source_type: "SALE",
        actor: "SYSTEM",
      });
      await ledgerService.createEntry({
        customer_id: CUSTOMER_ID,
        points_signed: -35,
        entry_type: "REDEEM",
        effective_timestamp: new Date("2026-01-02T00:00:00.000Z"),
        source_type: "SALE",
        actor: "SYSTEM",
      });

      await expect(
        ledgerService.calculateBalance(CUSTOMER_ID),
      ).resolves.toEqual({
        available: 65,
        pending: 0,
        lifetime_earned: 100,
      });
    });
  });

  describe("getReversalChain", () => {
    it("returns the original entry followed by its persisted reversal", async () => {
      const original = await ledgerService.createEntry({
        customer_id: CUSTOMER_ID,
        points_signed: 100,
        entry_type: "EARN",
        effective_timestamp: new Date("2026-01-01T00:00:00.000Z"),
        source_type: "SALE",
        actor: "SYSTEM",
      });
      const reversal = await ledgerService.createEntry({
        customer_id: CUSTOMER_ID,
        points_signed: -100,
        entry_type: "REVERSAL",
        effective_timestamp: new Date("2026-01-02T00:00:00.000Z"),
        source_type: "VOID",
        actor: "SYSTEM",
        reversal_of_id: original.id,
        reversal_reason: "Sale voided",
      });

      const chain = await ledgerService.getReversalChain(original.id);

      expect(chain.map((entry) => entry.id)).toEqual([
        original.id,
        reversal.id,
      ]);
      expect(chain[1]).toMatchObject({
        reversal_of_id: original.id,
        points_signed: -100,
      });
      expect(
        (await ledgerService.calculateBalance(CUSTOMER_ID)).available,
      ).toBe(0);
    });
  });
});
