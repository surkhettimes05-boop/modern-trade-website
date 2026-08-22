import { query } from "../database/connection.js";
import { CustomerService } from "./customerService.js";
import { RuleEngineService } from "./ruleEngineService.js";
import { LedgerService } from "./ledgerService.js";
import { EarnLotsService } from "./earnLotsService.js";
import { normalizePhone } from "../utils/phoneNormalization.js";
import { MARKET } from "../config/market.js";

const customerService = new CustomerService();
const ruleEngineService = new RuleEngineService();
const ledgerService = new LedgerService();
const earnLotsService = new EarnLotsService();

interface QuoteRequest {
  customer_id?: string;
  items: Array<{
    product_id: string;
    sku?: string;
    category_id?: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  total_amount: number;
  store_id: string;
  channel: string;
}

interface QuoteResponse {
  customer_id?: string;
  points_earned: number;
  points_available: number;
  applied_rules: any[];
  calculation_trace: any[];
  explanation: string;
}

interface CreateSaleInput {
  sale_number: string;
  customer_id?: string;
  store_id: string;
  total_amount: number;
  currency?: string;
  payment_method?: string;
  items: Array<{
    product_id?: string;
    sku?: string;
    product_name?: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    discount_amount?: number;
    points_eligible?: boolean;
  }>;
  created_by: string;
  idempotency_key?: string;
}

export class POSService {
  /**
   * Lookup customer by phone for POS
   */
  async lookupCustomer(phone: string) {
    try {
      const phoneNormalized = normalizePhone(phone);
      const customer = await customerService.findByPhone(phoneNormalized);

      if (!customer) {
        return {
          found: false,
          message: "Customer not found",
        };
      }

      // Get current balance
      const balance = await ledgerService.calculateBalance(customer.id);

      return {
        found: true,
        customer: {
          id: customer.id,
          phone_masked: customer.phone_masked,
          preferred_name: customer.preferred_name,
          verification_status: customer.verification_status,
          language: customer.language,
        },
        balance,
      };
    } catch {
      throw new Error("Failed to lookup customer");
    }
  }

  /**
   * Enroll new customer from POS
   */
  async enrollCustomer(input: {
    phone: string;
    preferred_name?: string;
    email?: string;
    language?: string;
    store_id: string;
    enrolled_by: string;
  }) {
    try {
      const customer = await customerService.createCustomer({
        phone: input.phone,
        preferred_name: input.preferred_name,
        email: input.email,
        language: input.language || "en",
        home_store_id: input.store_id,
        enrollment_source: "POS",
        enrollment_location_id: input.store_id,
        enrollment_channel: "IN_STORE",
        enrolled_by: input.enrolled_by,
      });

      // Get balance (will be 0 for new customer)
      const balance = await ledgerService.calculateBalance(customer.id);

      return {
        success: true,
        customer: {
          id: customer.id,
          phone_masked: customer.phone_masked,
          preferred_name: customer.preferred_name,
          verification_status: customer.verification_status,
        },
        balance,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        return {
          success: false,
          error: "Customer with this phone number already exists",
        };
      }
      throw new Error("Failed to enroll customer");
    }
  }

  /**
   * Quote points for a sale (before completion)
   */
  async quotePoints(request: QuoteRequest): Promise<QuoteResponse> {
    try {
      // Calculate points using rule engine
      const calculation = await ruleEngineService.calculatePoints({
        items: request.items,
        total_amount: request.total_amount,
        customer_id: request.customer_id,
        store_id: request.store_id,
        channel: request.channel,
      });

      // Get current balance if customer provided
      let pointsAvailable = 0;
      if (request.customer_id) {
        const balance = await ledgerService.calculateBalance(
          request.customer_id,
        );
        pointsAvailable = balance.available;
      }

      return {
        customer_id: request.customer_id,
        points_earned: calculation.points,
        points_available: pointsAvailable,
        applied_rules: calculation.applied_rules,
        calculation_trace: calculation.calculation_trace,
        explanation: calculation.explanation,
      };
    } catch {
      throw new Error("Failed to quote points");
    }
  }

  /**
   * Create a sale (draft)
   */
  async createSale(input: CreateSaleInput) {
    try {
      // Check idempotency
      if (input.idempotency_key) {
        const existing = await query(
          "SELECT id FROM sales WHERE idempotency_key = $1",
          [input.idempotency_key],
        );
        if (existing.rows.length > 0) {
          return {
            success: false,
            error: "Sale with this idempotency key already exists",
            sale_id: existing.rows[0].id,
          };
        }
      }

      const result = await query(
        `INSERT INTO sales (
          sale_number, customer_id, store_id, total_amount, currency,
          payment_method, sale_status, idempotency_key, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $8)
        RETURNING *`,
        [
          input.sale_number,
          input.customer_id || null,
          input.store_id,
          input.total_amount,
          input.currency || MARKET.currencyCode,
          input.payment_method || null,
          input.idempotency_key || null,
          input.created_by,
        ],
      );

      const sale = result.rows[0];

      // Insert sale items
      for (const item of input.items) {
        await query(
          `INSERT INTO sale_items (
            sale_id, product_id, sku, product_name, quantity, unit_price, line_total, discount_amount, points_eligible
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            sale.id,
            item.product_id || null,
            item.sku || null,
            item.product_name || null,
            item.quantity,
            item.unit_price,
            item.line_total,
            item.discount_amount || 0,
            item.points_eligible !== undefined ? item.points_eligible : true,
          ],
        );
      }

      return {
        success: true,
        sale_id: sale.id,
        sale_number: sale.sale_number,
        sale_status: sale.sale_status,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        return {
          success: false,
          error: error.message,
        };
      }
      throw new Error("Failed to create sale");
    }
  }

  /**
   * Update sale status
   */
  async updateSaleStatus(saleId: string, status: string, updatedBy: string) {
    try {
      const validStatuses = [
        "DRAFT",
        "PENDING",
        "COMPLETED",
        "VOIDED",
        "RETURNED",
      ];
      if (!validStatuses.includes(status)) {
        throw new Error("Invalid sale status");
      }

      const result = await query(
        `UPDATE sales SET sale_status = $1, updated_by = $2 WHERE id = $3 RETURNING *`,
        [status, updatedBy, saleId],
      );

      if (result.rows.length === 0) {
        throw new Error("Sale not found");
      }

      return result.rows[0];
    } catch {
      throw new Error("Failed to update sale status");
    }
  }

  /**
   * Attach customer to sale
   */
  async attachCustomerToSale(saleId: string, customerId: string) {
    try {
      const result = await query(
        `UPDATE sales SET customer_id = $1 WHERE id = $2 AND sale_status = 'DRAFT' RETURNING *`,
        [customerId, saleId],
      );

      if (result.rows.length === 0) {
        throw new Error("Sale not found or not in DRAFT status");
      }

      return result.rows[0];
    } catch {
      throw new Error("Failed to attach customer to sale");
    }
  }

  /**
   * Get sale by ID
   */
  async getSale(saleId: string) {
    try {
      const result = await query(`SELECT * FROM sales WHERE id = $1`, [saleId]);

      if (result.rows.length === 0) {
        throw new Error("Sale not found");
      }

      // Get sale items
      const itemsResult = await query(
        `SELECT * FROM sale_items WHERE sale_id = $1`,
        [saleId],
      );

      return {
        ...result.rows[0],
        items: itemsResult.rows,
      };
    } catch {
      throw new Error("Failed to fetch sale");
    }
  }

  /**
   * Get sale by sale number
   */
  async getSaleByNumber(saleNumber: string) {
    try {
      const result = await query(`SELECT * FROM sales WHERE sale_number = $1`, [
        saleNumber,
      ]);

      if (result.rows.length === 0) {
        throw new Error("Sale not found");
      }

      // Get sale items
      const itemsResult = await query(
        `SELECT * FROM sale_items WHERE sale_id = $1`,
        [result.rows[0].id],
      );

      return {
        ...result.rows[0],
        items: itemsResult.rows,
      };
    } catch {
      throw new Error("Failed to fetch sale");
    }
  }

  /**
   * Post earn points after sale completion
   */
  async postEarnPoints(saleId: string, postedBy: string) {
    try {
      // Get sale details
      const sale = await this.getSale(saleId);

      if (sale.sale_status !== "COMPLETED") {
        throw new Error("Sale must be COMPLETED to post earn points");
      }

      if (!sale.customer_id) {
        throw new Error("Sale must have a customer to post earn points");
      }

      // Check if already posted
      if (sale.points_earned > 0) {
        throw new Error("Earn points already posted for this sale");
      }

      // Calculate points using rule engine
      const calculation = await ruleEngineService.calculatePoints({
        items: sale.items.map((item: any) => ({
          product_id: item.product_id || "",
          sku: item.sku,
          category_id: item.product_id, // Would need category lookup
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
        })),
        total_amount: sale.total_amount,
        customer_id: sale.customer_id,
        store_id: sale.store_id,
        channel: "IN_STORE",
      });

      if (calculation.points <= 0) {
        return {
          success: true,
          points_earned: 0,
          message: "No points earned based on rules",
        };
      }

      // Create ledger entry
      const ledgerEntry = await ledgerService.createEntry({
        customer_id: sale.customer_id,
        points_signed: calculation.points,
        entry_type: "EARN",
        effective_timestamp: new Date(),
        source_type: "SALE",
        source_id: sale.id,
        location_id: sale.store_id,
        idempotency_key: `sale_${sale.id}_earn`,
        actor: postedBy,
        reason: "Earn points from sale",
        calculation_metadata: {
          sale_number: sale.sale_number,
          total_amount: sale.total_amount,
          applied_rules: calculation.applied_rules.map((r) => ({
            id: r.id,
            name: r.name,
          })),
        },
      });

      // Create earn lot for expiry tracking
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1); // Default 1 year expiry

      await earnLotsService.createEarnLot({
        customer_id: sale.customer_id,
        ledger_entry_id: ledgerEntry.id,
        original_points: calculation.points,
        available_date: new Date(),
        expiry_date: expiryDate,
      });

      // Update sale with points earned
      await query(`UPDATE sales SET points_earned = $1 WHERE id = $2`, [
        calculation.points,
        saleId,
      ]);

      return {
        success: true,
        points_earned: calculation.points,
        ledger_entry_id: ledgerEntry.id,
        explanation: calculation.explanation,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to post earn points: ${error.message}`);
      }
      throw new Error("Failed to post earn points");
    }
  }

  /**
   * Authorize redemption (check if customer has enough points)
   */
  async authorizeRedemption(customerId: string, pointsToRedeem: number) {
    try {
      if (pointsToRedeem <= 0) {
        throw new Error("Points to redeem must be positive");
      }

      // Get current balance
      const balance = await ledgerService.calculateBalance(customerId);

      if (balance.available < pointsToRedeem) {
        return {
          authorized: false,
          available_points: balance.available,
          requested_points: pointsToRedeem,
          shortfall: pointsToRedeem - balance.available,
        };
      }

      return {
        authorized: true,
        available_points: balance.available,
        requested_points: pointsToRedeem,
        remaining_after: balance.available - pointsToRedeem,
      };
    } catch {
      throw new Error("Failed to authorize redemption");
    }
  }

  /**
   * Post redemption (deduct points from earn lots and create ledger entry)
   */
  async postRedemption(
    saleId: string,
    pointsToRedeem: number,
    postedBy: string,
  ) {
    try {
      // Get sale details
      const sale = await this.getSale(saleId);

      if (sale.sale_status !== "COMPLETED") {
        throw new Error("Sale must be COMPLETED to post redemption");
      }

      if (!sale.customer_id) {
        throw new Error("Sale must have a customer to post redemption");
      }

      // Check if already posted
      if (sale.points_redeemed > 0) {
        throw new Error("Redemption already posted for this sale");
      }

      // Authorize redemption
      const authorization = await this.authorizeRedemption(
        sale.customer_id,
        pointsToRedeem,
      );
      if (!authorization.authorized) {
        throw new Error(
          `Insufficient points: available ${authorization.available_points}, requested ${pointsToRedeem}`,
        );
      }

      // Deduct points from earn lots (FIFO)
      await earnLotsService.deductPoints(sale.customer_id, pointsToRedeem);

      // Create ledger entry
      const ledgerEntry = await ledgerService.createEntry({
        customer_id: sale.customer_id,
        points_signed: -pointsToRedeem,
        entry_type: "REDEEM",
        effective_timestamp: new Date(),
        source_type: "SALE",
        source_id: sale.id,
        location_id: sale.store_id,
        idempotency_key: `sale_${sale.id}_redeem`,
        actor: postedBy,
        reason: "Redeem points for purchase",
        calculation_metadata: {
          sale_number: sale.sale_number,
          points_redeemed: pointsToRedeem,
        },
      });

      // Update sale with points redeemed
      await query(`UPDATE sales SET points_redeemed = $1 WHERE id = $2`, [
        pointsToRedeem,
        saleId,
      ]);

      return {
        success: true,
        points_redeemed: pointsToRedeem,
        ledger_entry_id: ledgerEntry.id,
        remaining_balance: authorization.remaining_after,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to post redemption: ${error.message}`);
      }
      throw new Error("Failed to post redemption");
    }
  }

  /**
   * Void a sale (reverse all points)
   */
  async voidSale(saleId: string, voidedBy: string, voidReason: string) {
    try {
      // Get sale details
      const sale = await this.getSale(saleId);

      if (sale.sale_status === "VOIDED") {
        throw new Error("Sale already voided");
      }

      if (sale.sale_status === "RETURNED") {
        throw new Error("Sale already returned - use return process instead");
      }

      // Reverse earn points if any
      if (sale.points_earned > 0) {
        // Get the original earn ledger entry
        const earnLedgerEntries = await ledgerService.getBySource(
          "SALE",
          sale.id,
        );
        const earnEntry = earnLedgerEntries.find(
          (e) => e.entry_type === "EARN",
        );

        if (earnEntry) {
          // Restore points to earn lots
          await earnLotsService.restorePoints(
            sale.customer_id!,
            sale.points_earned,
            earnEntry.id,
          );

          // Create reversal ledger entry
          await ledgerService.createEntry({
            customer_id: sale.customer_id!,
            points_signed: -sale.points_earned,
            entry_type: "REVERSAL",
            effective_timestamp: new Date(),
            source_type: "VOID",
            source_id: sale.id,
            location_id: sale.store_id,
            idempotency_key: `sale_${sale.id}_void_earn`,
            actor: voidedBy,
            reason: voidReason,
            reversal_of_id: earnEntry.id,
            reversal_reason: "Sale voided",
            calculation_metadata: {
              sale_number: sale.sale_number,
              points_reversed: sale.points_earned,
            },
          });
        }
      }

      // Reverse redemption if any
      if (sale.points_redeemed > 0) {
        const redeemLedgerEntries = await ledgerService.getBySource(
          "SALE",
          sale.id,
        );
        const redeemEntry = redeemLedgerEntries.find(
          (e) => e.entry_type === "REDEEM",
        );

        if (redeemEntry) {
          // Create reversal ledger entry (restores points)
          await ledgerService.createEntry({
            customer_id: sale.customer_id!,
            points_signed: sale.points_redeem,
            entry_type: "REVERSAL",
            effective_timestamp: new Date(),
            source_type: "VOID",
            source_id: sale.id,
            location_id: sale.store_id,
            idempotency_key: `sale_${sale.id}_void_redeem`,
            actor: voidedBy,
            reason: voidReason,
            reversal_of_id: redeemEntry.id,
            reversal_reason: "Sale voided",
            calculation_metadata: {
              sale_number: sale.sale_number,
              points_restored: sale.points_redeem,
            },
          });
        }
      }

      // Update sale status to VOIDED
      await query(
        `UPDATE sales SET sale_status = 'VOIDED', voided_at = CURRENT_TIMESTAMP, voided_by = $1, void_reason = $2 WHERE id = $3`,
        [voidedBy, voidReason, saleId],
      );

      return {
        success: true,
        message: "Sale voided successfully",
        points_reversed: sale.points_earned,
        points_restored: sale.points_redeemed,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to void sale: ${error.message}`);
      }
      throw new Error("Failed to void sale");
    }
  }

  /**
   * Process a return (reverse points proportionally)
   */
  async processReturn(returnInput: {
    return_number: string;
    sale_id: string;
    customer_id: string;
    store_id: string;
    total_amount: number;
    items: Array<{
      sale_item_id: string;
      quantity: number;
      return_amount: number;
    }>;
    processed_by: string;
  }) {
    try {
      // Get sale details
      const sale = await this.getSale(returnInput.sale_id);

      if (sale.sale_status !== "COMPLETED") {
        throw new Error("Can only return COMPLETED sales");
      }

      // Create return record
      const returnResult = await query(
        `INSERT INTO returns (return_number, sale_id, customer_id, store_id, total_amount, return_status, processed_by)
         VALUES ($1, $2, $3, $4, $5, 'PROCESSED', $6)
         RETURNING *`,
        [
          returnInput.return_number,
          returnInput.sale_id,
          returnInput.customer_id,
          returnInput.store_id,
          returnInput.total_amount,
          returnInput.processed_by,
        ],
      );

      const returnRecord = returnResult.rows[0];

      // Calculate proportion of points to reverse
      const returnRatio = returnInput.total_amount / sale.total_amount;
      const pointsToReverse = Math.floor(sale.points_earned * returnRatio);
      const redemptionToRestore = Math.floor(
        sale.points_redeemed * returnRatio,
      );

      // Reverse earn points proportionally
      if (pointsToReverse > 0) {
        const earnLedgerEntries = await ledgerService.getBySource(
          "SALE",
          sale.id,
        );
        const earnEntry = earnLedgerEntries.find(
          (e) => e.entry_type === "EARN",
        );

        if (earnEntry) {
          // Restore points to earn lots
          await earnLotsService.restorePoints(
            returnInput.customer_id,
            pointsToReverse,
            earnEntry.id,
          );

          // Create reversal ledger entry
          await ledgerService.createEntry({
            customer_id: returnInput.customer_id,
            points_signed: -pointsToReverse,
            entry_type: "REVERSAL",
            effective_timestamp: new Date(),
            source_type: "RETURN",
            source_id: returnRecord.id,
            location_id: returnInput.store_id,
            idempotency_key: `return_${returnRecord.id}_earn`,
            actor: returnInput.processed_by,
            reason: "Return processed",
            reversal_of_id: earnEntry.id,
            reversal_reason: "Partial return",
            calculation_metadata: {
              sale_number: sale.sale_number,
              return_number: returnInput.return_number,
              return_ratio: returnRatio,
              points_reversed: pointsToReverse,
            },
          });
        }
      }

      // Restore redemption proportionally
      if (redemptionToRestore > 0) {
        const redeemLedgerEntries = await ledgerService.getBySource(
          "SALE",
          sale.id,
        );
        const redeemEntry = redeemLedgerEntries.find(
          (e) => e.entry_type === "REDEEM",
        );

        if (redeemEntry) {
          // Create reversal ledger entry (restores points)
          await ledgerService.createEntry({
            customer_id: returnInput.customer_id,
            points_signed: redemptionToRestore,
            entry_type: "REVERSAL",
            effective_timestamp: new Date(),
            source_type: "RETURN",
            source_id: returnRecord.id,
            location_id: returnInput.store_id,
            idempotency_key: `return_${returnRecord.id}_redeem`,
            actor: returnInput.processed_by,
            reason: "Return processed",
            reversal_of_id: redeemEntry.id,
            reversal_reason: "Partial return",
            calculation_metadata: {
              sale_number: sale.sale_number,
              return_number: returnInput.return_number,
              return_ratio: returnRatio,
              points_restored: redemptionToRestore,
            },
          });
        }
      }

      // Insert return items
      for (const item of returnInput.items) {
        await query(
          `INSERT INTO return_items (return_id, sale_item_id, quantity, return_amount)
           VALUES ($1, $2, $3, $4)`,
          [
            returnRecord.id,
            item.sale_item_id,
            item.quantity,
            item.return_amount,
          ],
        );
      }

      // Update sale status to RETURNED if full return
      if (returnInput.total_amount >= sale.total_amount) {
        await query(`UPDATE sales SET sale_status = 'RETURNED' WHERE id = $1`, [
          returnInput.sale_id,
        ]);
      }

      // Update return record with points reversed
      await query(
        `UPDATE returns SET points_reversed = $1, redemption_reversed = $2 WHERE id = $3`,
        [pointsToReverse, redemptionToRestore, returnRecord.id],
      );

      return {
        success: true,
        return_id: returnRecord.id,
        points_reversed: pointsToReverse,
        redemption_restored: redemptionToRestore,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to process return: ${error.message}`);
      }
      throw new Error("Failed to process return");
    }
  }
}
