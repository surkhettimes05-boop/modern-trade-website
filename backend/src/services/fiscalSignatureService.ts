import { query } from "../database/connection.js";
import crypto from "crypto";

interface FiscalSignature {
  id: string;
  signature_id: string;
  document_type: string;
  document_id: string;
  document_number: string;
  signature_value: string;
  signature_algorithm: string;
  public_key_fingerprint: string;
  is_valid: boolean;
  validation_timestamp: Date;
  signed_at: Date;
  created_at: Date;
}

export class FiscalSignatureService {
  /**
   * Sign document
   */
  async signDocument(documentData: {
    document_type: string;
    document_id: string;
    document_number: string;
    document_content: any;
  }): Promise<FiscalSignature> {
    const signatureId = this.generateFiscalSignatureId();

    // Get or create signing key
    const signingKey = await this.getOrCreateSigningKey();

    // Create signature
    const documentString = JSON.stringify(documentData);
    const signature = this.sign(documentString, signingKey.private_key);

    const result = await query(
      `INSERT INTO fiscal_signatures (
        signature_id, document_type, document_id, document_number,
        signature_value, signature_algorithm, public_key_fingerprint
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        signatureId,
        documentData.document_type,
        documentData.document_id,
        documentData.document_number,
        signature,
        "RSA-SHA256",
        this.getPublicKeyFingerprint(signingKey.public_key),
      ],
    );

    return result.rows[0];
  }

  /**
   * Verify document signature
   */
  async verifySignature(
    documentNumber: string,
    documentContent: any,
  ): Promise<boolean> {
    const result = await query(
      "SELECT * FROM fiscal_signatures WHERE document_number = $1 AND is_valid = TRUE ORDER BY signed_at DESC LIMIT 1",
      [documentNumber],
    );

    if (result.rows.length === 0) {
      return false;
    }

    const signature = result.rows[0];
    const signingKey = await this.getSigningKey();

    if (!signingKey) {
      return false;
    }

    const documentString = JSON.stringify(documentContent);
    return this.verify(
      documentString,
      signature.signature_value,
      signingKey.public_key,
    );
  }

  /**
   * Get signature for document
   */
  async getSignature(documentNumber: string): Promise<FiscalSignature | null> {
    const result = await query(
      "SELECT * FROM fiscal_signatures WHERE document_number = $1 ORDER BY signed_at DESC LIMIT 1",
      [documentNumber],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Invalidate signature
   */
  async invalidateSignature(signatureId: string): Promise<FiscalSignature> {
    const result = await query(
      `UPDATE fiscal_signatures 
       SET is_valid = FALSE, validation_timestamp = NOW()
       WHERE signature_id = $1
       RETURNING *`,
      [signatureId],
    );

    if (result.rows.length === 0) {
      throw new Error("Fiscal signature not found");
    }

    return result.rows[0];
  }

  /**
   * Get or create signing key
   */
  private async getOrCreateSigningKey(): Promise<any> {
    const result = await query(
      `SELECT * FROM encryption_keys 
       WHERE key_type = 'SIGNING' AND key_usage = 'SIGNING' AND is_active = TRUE 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [],
    );

    if (result.rows.length > 0) {
      return {
        public_key: this.decrypt(result.rows[0].public_key_encrypted),
        private_key: this.decrypt(result.rows[0].private_key_encrypted),
      };
    }

    // Generate new key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const keyId = this.generateEncryptionKeyId();

    await query(
      `INSERT INTO encryption_keys (
        key_id, key_type, key_algorithm, key_usage,
        public_key_encrypted, private_key_encrypted
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        keyId,
        "SIGNING",
        "RSA-2048",
        "SIGNING",
        this.encrypt(publicKey),
        this.encrypt(privateKey),
      ],
    );

    return { public_key: publicKey, private_key: privateKey };
  }

  /**
   * Get signing key
   */
  private async getSigningKey(): Promise<any> {
    const result = await query(
      `SELECT * FROM encryption_keys 
       WHERE key_type = 'SIGNING' AND key_usage = 'SIGNING' AND is_active = TRUE 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      public_key: this.decrypt(result.rows[0].public_key_encrypted),
      private_key: this.decrypt(result.rows[0].private_key_encrypted),
    };
  }

  /**
   * Sign data
   */
  private sign(data: string, privateKey: string): string {
    const sign = crypto.createSign("SHA256");
    sign.update(data);
    sign.end();
    return sign.sign(privateKey, "base64");
  }

  /**
   * Verify signature
   */
  private verify(data: string, signature: string, publicKey: string): boolean {
    const verify = crypto.createVerify("SHA256");
    verify.update(data);
    verify.end();
    return verify.verify(publicKey, signature, "base64");
  }

  /**
   * Get public key fingerprint
   */
  private getPublicKeyFingerprint(publicKey: string): string {
    const hash = crypto.createHash("sha256");
    hash.update(publicKey);
    return hash.digest("hex");
  }

  /**
   * Encrypt data
   */
  private encrypt(data: string): string {
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
   * Decrypt data
   */
  private decrypt(encryptedData: string): string {
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
   * Generate fiscal signature ID
   */
  private generateFiscalSignatureId(): string {
    return `FIS-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Generate encryption key ID
   */
  private generateEncryptionKeyId(): string {
    return `KEY-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}

export const fiscalSignatureService = new FiscalSignatureService();
