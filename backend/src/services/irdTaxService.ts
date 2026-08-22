import { query } from "../database/connection.js";
import crypto from "crypto";
import { masterEncryptionKey } from "../utils/cryptoKeys.js";

interface IRDTaxConfiguration {
  id: string;
  store_id: string;
  vat_enabled: boolean;
  vat_rate: number;
  vat_registration_number: string;
  excise_duty_enabled: boolean;
  excise_duty_rates: any;
  withholding_tax_enabled: boolean;
  withholding_tax_rate: number;
  ird_api_url: string;
  ird_api_username: string;
  ird_api_password_encrypted: string;
  created_at: Date;
  updated_at: Date;
  updated_by: string;
}

interface TaxTransaction {
  id: string;
  transaction_id: string;
  store_id: string;
  transaction_type: string;
  reference_id: string;
  reference_type: string;
  vat_amount: number;
  excise_duty_amount: number;
  withholding_tax_amount: number;
  total_tax_amount: number;
  net_amount: number;
  gross_amount: number;
  ird_submission_status: string;
  ird_submission_id: string;
  ird_submission_timestamp: Date;
  ird_response: any;
  transaction_timestamp: Date;
  business_date: Date;
  created_at: Date;
}

export class IRDTaxService {
  /**
   * Get or create IRD tax configuration for store
   */
  async getConfiguration(storeId: string): Promise<IRDTaxConfiguration | null> {
    const result = await query(
      "SELECT * FROM ird_tax_configurations WHERE store_id = $1",
      [storeId],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create IRD tax configuration
   */
  async createConfiguration(config: {
    store_id: string;
    vat_enabled?: boolean;
    vat_rate?: number;
    vat_registration_number?: string;
    excise_duty_enabled?: boolean;
    excise_duty_rates?: any;
    withholding_tax_enabled?: boolean;
    withholding_tax_rate?: number;
    ird_api_url?: string;
    ird_api_username?: string;
    ird_api_password?: string;
    updated_by?: string;
  }): Promise<IRDTaxConfiguration> {
    const encryptedPassword = config.ird_api_password
      ? this.encrypt(config.ird_api_password)
      : null;

    const result = await query(
      `INSERT INTO ird_tax_configurations (
        store_id, vat_enabled, vat_rate, vat_registration_number,
        excise_duty_enabled, excise_duty_rates, withholding_tax_enabled,
        withholding_tax_rate, ird_api_url, ird_api_username,
        ird_api_password_encrypted, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        config.store_id,
        config.vat_enabled ?? true,
        config.vat_rate ?? 13.0,
        config.vat_registration_number || null,
        config.excise_duty_enabled ?? false,
        JSON.stringify(config.excise_duty_rates || {}),
        config.withholding_tax_enabled ?? false,
        config.withholding_tax_rate ?? 1.5,
        config.ird_api_url || null,
        config.ird_api_username || null,
        encryptedPassword,
        config.updated_by || null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Update IRD tax configuration
   */
  async updateConfiguration(
    storeId: string,
    config: {
      vat_enabled?: boolean;
      vat_rate?: number;
      vat_registration_number?: string;
      excise_duty_enabled?: boolean;
      excise_duty_rates?: any;
      withholding_tax_enabled?: boolean;
      withholding_tax_rate?: number;
      ird_api_url?: string;
      ird_api_username?: string;
      ird_api_password?: string;
      updated_by?: string;
    },
  ): Promise<IRDTaxConfiguration> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (config.vat_enabled !== undefined) {
      updates.push(`vat_enabled = $${paramIndex}`);
      values.push(config.vat_enabled);
      paramIndex++;
    }

    if (config.vat_rate !== undefined) {
      updates.push(`vat_rate = $${paramIndex}`);
      values.push(config.vat_rate);
      paramIndex++;
    }

    if (config.vat_registration_number !== undefined) {
      updates.push(`vat_registration_number = $${paramIndex}`);
      values.push(config.vat_registration_number);
      paramIndex++;
    }

    if (config.excise_duty_enabled !== undefined) {
      updates.push(`excise_duty_enabled = $${paramIndex}`);
      values.push(config.excise_duty_enabled);
      paramIndex++;
    }

    if (config.excise_duty_rates !== undefined) {
      updates.push(`excise_duty_rates = $${paramIndex}`);
      values.push(JSON.stringify(config.excise_duty_rates));
      paramIndex++;
    }

    if (config.withholding_tax_enabled !== undefined) {
      updates.push(`withholding_tax_enabled = $${paramIndex}`);
      values.push(config.withholding_tax_enabled);
      paramIndex++;
    }

    if (config.withholding_tax_rate !== undefined) {
      updates.push(`withholding_tax_rate = $${paramIndex}`);
      values.push(config.withholding_tax_rate);
      paramIndex++;
    }

    if (config.ird_api_url !== undefined) {
      updates.push(`ird_api_url = $${paramIndex}`);
      values.push(config.ird_api_url);
      paramIndex++;
    }

    if (config.ird_api_username !== undefined) {
      updates.push(`ird_api_username = $${paramIndex}`);
      values.push(config.ird_api_username);
      paramIndex++;
    }

    if (config.ird_api_password !== undefined) {
      updates.push(`ird_api_password_encrypted = $${paramIndex}`);
      values.push(this.encrypt(config.ird_api_password));
      paramIndex++;
    }

    if (config.updated_by !== undefined) {
      updates.push(`updated_by = $${paramIndex}`);
      values.push(config.updated_by);
      paramIndex++;
    }

    values.push(storeId);

    const result = await query(
      `UPDATE ird_tax_configurations SET ${updates.join(", ")} WHERE store_id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error("IRD tax configuration not found");
    }

    return result.rows[0];
  }

  /**
   * Calculate tax for transaction
   */
  async calculateTax(
    storeId: string,
    transactionData: {
      net_amount: number;
      transaction_type: string;
      product_category?: string;
    },
  ): Promise<any> {
    const config = await this.getConfiguration(storeId);
    if (!config) {
      throw new Error("IRD tax configuration not found");
    }

    const vatAmount = config.vat_enabled
      ? (transactionData.net_amount * config.vat_rate) / 100
      : 0;

    let exciseDutyAmount = 0;
    if (
      config.excise_duty_enabled &&
      config.excise_duty_rates &&
      transactionData.product_category
    ) {
      const rates = config.excise_duty_rates;
      const rate = rates[transactionData.product_category];
      if (rate) {
        exciseDutyAmount = (transactionData.net_amount * rate) / 100;
      }
    }

    const totalTaxAmount = vatAmount + exciseDutyAmount;
    const grossAmount = transactionData.net_amount + totalTaxAmount;

    return {
      vat_amount: Math.round(vatAmount * 100) / 100,
      excise_duty_amount: Math.round(exciseDutyAmount * 100) / 100,
      total_tax_amount: Math.round(totalTaxAmount * 100) / 100,
      gross_amount: Math.round(grossAmount * 100) / 100,
    };
  }

  /**
   * Record tax transaction
   */
  async recordTransaction(transactionData: {
    store_id: string;
    transaction_type: string;
    reference_id?: string;
    reference_type?: string;
    vat_amount: number;
    excise_duty_amount: number;
    withholding_tax_amount: number;
    total_tax_amount: number;
    net_amount: number;
    gross_amount: number;
  }): Promise<TaxTransaction> {
    const transactionId = this.generateTaxTransactionId();

    const result = await query(
      `INSERT INTO tax_transactions (
        transaction_id, store_id, transaction_type, reference_id, reference_type,
        vat_amount, excise_duty_amount, withholding_tax_amount, total_tax_amount,
        net_amount, gross_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        transactionId,
        transactionData.store_id,
        transactionData.transaction_type,
        transactionData.reference_id || null,
        transactionData.reference_type || null,
        transactionData.vat_amount,
        transactionData.excise_duty_amount,
        transactionData.withholding_tax_amount,
        transactionData.total_tax_amount,
        transactionData.net_amount,
        transactionData.gross_amount,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get tax transactions for store
   */
  async getTransactions(
    storeId: string,
    filters: {
      start_date?: Date;
      end_date?: Date;
      transaction_type?: string;
      ird_submission_status?: string;
    } = {},
  ): Promise<TaxTransaction[]> {
    const conditions: string[] = ["store_id = $1"];
    const values: any[] = [storeId];
    let paramIndex = 2;

    if (filters.start_date) {
      conditions.push(`business_date >= $${paramIndex}`);
      values.push(filters.start_date);
      paramIndex++;
    }

    if (filters.end_date) {
      conditions.push(`business_date <= $${paramIndex}`);
      values.push(filters.end_date);
      paramIndex++;
    }

    if (filters.transaction_type) {
      conditions.push(`transaction_type = $${paramIndex}`);
      values.push(filters.transaction_type);
      paramIndex++;
    }

    if (filters.ird_submission_status) {
      conditions.push(`ird_submission_status = $${paramIndex}`);
      values.push(filters.ird_submission_status);
      paramIndex++;
    }

    const result = await query(
      `SELECT * FROM tax_transactions WHERE ${conditions.join(" AND ")} ORDER BY transaction_timestamp DESC`,
      values,
    );

    return result.rows;
  }

  /**
   * Generate tax transaction ID
   */
  private generateTaxTransactionId(): string {
    return `TAX-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Encrypt data
   */
  private encrypt(data: string): string {
    const algorithm = "aes-256-gcm";
    const key = masterEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt data
   */
  private decrypt(encryptedData: string): string {
    const algorithm = "aes-256-gcm";
    const key = masterEncryptionKey();

    const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}

export const irdTaxService = new IRDTaxService();
