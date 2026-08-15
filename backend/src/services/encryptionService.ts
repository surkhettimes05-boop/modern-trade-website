import { query } from "../database/connection.js";
import crypto from "crypto";

interface EncryptionKey {
  id: string;
  key_id: string;
  key_type: string;
  key_algorithm: string;
  key_usage: string;
  public_key_encrypted: string;
  private_key_encrypted: string;
  key_version: number;
  is_active: boolean;
  expires_at: Date;
  rotated_at: Date;
  rotated_by: string;
  created_by: string;
  created_at: Date;
}

export class EncryptionService {
  /**
   * Encrypt data
   */
  async encryptData(
    data: string,
    keyType = "DATA_ENCRYPTION",
  ): Promise<{ encrypted_data: string; key_id: string }> {
    const key = await this.getActiveKey(keyType, "ENCRYPTION");

    if (!key) {
      throw new Error("No active encryption key found");
    }

    const encrypted = this.encrypt(data, key.private_key);

    return {
      encrypted_data: encrypted,
      key_id: key.key_id,
    };
  }

  /**
   * Decrypt data
   */
  async decryptData(encryptedData: string, keyId: string): Promise<string> {
    const key = await this.getKeyById(keyId);

    if (!key) {
      throw new Error("Encryption key not found");
    }

    return this.decrypt(encryptedData, key.private_key);
  }

  /**
   * Create encryption key
   */
  async createKey(keyData: {
    key_type: string;
    key_algorithm: string;
    key_usage: string;
    created_by?: string;
    expires_at?: Date;
  }): Promise<EncryptionKey> {
    const keyId = this.generateEncryptionKeyId();

    let publicKey = "";
    let privateKey = "";

    if (keyData.key_algorithm.startsWith("RSA")) {
      const keyPair = crypto.generateKeyPairSync("rsa", {
        modulusLength: parseInt(keyData.key_algorithm.split("-")[1]) || 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      publicKey = keyPair.publicKey;
      privateKey = keyPair.privateKey;
    } else if (keyData.key_algorithm.startsWith("AES")) {
      privateKey = crypto.randomBytes(32).toString("hex");
      publicKey = privateKey; // For symmetric keys, public and private are the same
    }

    const result = await query(
      `INSERT INTO encryption_keys (
        key_id, key_type, key_algorithm, key_usage,
        public_key_encrypted, private_key_encrypted, expires_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        keyId,
        keyData.key_type,
        keyData.key_algorithm,
        keyData.key_usage,
        this.encryptWithMasterKey(publicKey),
        this.encryptWithMasterKey(privateKey),
        keyData.expires_at || null,
        keyData.created_by || null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get active key
   */
  async getActiveKey(keyType: string, keyUsage: string): Promise<any> {
    const result = await query(
      `SELECT * FROM encryption_keys 
       WHERE key_type = $1 AND key_usage = $2 AND is_active = TRUE 
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC 
       LIMIT 1`,
      [keyType, keyUsage],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      key_id: result.rows[0].key_id,
      public_key: this.decryptWithMasterKey(
        result.rows[0].public_key_encrypted,
      ),
      private_key: this.decryptWithMasterKey(
        result.rows[0].private_key_encrypted,
      ),
    };
  }

  /**
   * Get key by ID
   */
  async getKeyById(keyId: string): Promise<any> {
    const result = await query(
      "SELECT * FROM encryption_keys WHERE key_id = $1",
      [keyId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      key_id: result.rows[0].key_id,
      public_key: this.decryptWithMasterKey(
        result.rows[0].public_key_encrypted,
      ),
      private_key: this.decryptWithMasterKey(
        result.rows[0].private_key_encrypted,
      ),
    };
  }

  /**
   * Rotate key
   */
  async rotateKey(keyId: string, rotatedBy: string): Promise<EncryptionKey> {
    const oldKey = await this.getKeyById(keyId);

    if (!oldKey) {
      throw new Error("Encryption key not found");
    }

    // Deactivate old key
    await query(
      `UPDATE encryption_keys SET is_active = FALSE, rotated_at = NOW(), rotated_by = $1 WHERE key_id = $2`,
      [rotatedBy, keyId],
    );

    // Create new key with same configuration
    const keyConfig = await query(
      "SELECT key_type, key_algorithm, key_usage FROM encryption_keys WHERE key_id = $1",
      [keyId],
    );

    const config = keyConfig.rows[0];

    return await this.createKey({
      key_type: config.key_type,
      key_algorithm: config.key_algorithm,
      key_usage: config.key_usage,
      created_by: rotatedBy,
    });
  }

  /**
   * Get all keys
   */
  async getAllKeys(
    filters: {
      key_type?: string;
      key_usage?: string;
      is_active?: boolean;
    } = {},
  ): Promise<EncryptionKey[]> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters.key_type) {
      conditions.push("key_type = $1");
      values.push(filters.key_type);
    }

    if (filters.key_usage) {
      conditions.push(`key_usage = $${values.length + 1}`);
      values.push(filters.key_usage);
    }

    if (filters.is_active !== undefined) {
      conditions.push(`is_active = $${values.length + 1}`);
      values.push(filters.is_active);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT * FROM encryption_keys ${whereClause} ORDER BY created_at DESC`,
      values,
    );

    return result.rows;
  }

  /**
   * Encrypt data with master key
   */
  private encryptWithMasterKey(data: string): string {
    const algorithm = "aes-256-gcm";
    const key = Buffer.from(
      process.env.ENCRYPTION_KEY || "default-encryption-key-32-bytes",
      "utf8",
    ).slice(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt data with master key
   */
  private decryptWithMasterKey(encryptedData: string): string {
    const algorithm = "aes-256-gcm";
    const key = Buffer.from(
      process.env.ENCRYPTION_KEY || "default-encryption-key-32-bytes",
      "utf8",
    ).slice(0, 32);

    const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Encrypt data
   */
  private encrypt(data: string, key: string): string {
    const algorithm = "aes-256-gcm";
    const keyBuffer = Buffer.from(key.slice(0, 64), "hex").slice(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt data
   */
  private decrypt(encryptedData: string, key: string): string {
    const algorithm = "aes-256-gcm";
    const keyBuffer = Buffer.from(key.slice(0, 64), "hex").slice(0, 32);

    const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Generate encryption key ID
   */
  private generateEncryptionKeyId(): string {
    return `KEY-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const encryptionService = new EncryptionService();
