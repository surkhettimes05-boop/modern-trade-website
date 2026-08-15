import crypto from "crypto";

/** Normalize Nepal mobile numbers to canonical 10-digit local format. */
export function normalizePhone(phone: string): string {
  if (!phone) {
    throw new Error("Phone number is required");
  }

  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, "");

  const localNumber = digitsOnly.startsWith("977")
    ? digitsOnly.substring(3)
    : digitsOnly;
  if (localNumber.length !== 10) {
    throw new Error("Invalid phone number format");
  }
  if (!/^9[6-9]\d{8}$/.test(localNumber)) {
    throw new Error("Invalid Nepal mobile number");
  }
  return localNumber;
}

/**
 * Create SHA-256 hash of normalized phone for lookup
 */
export function hashPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Mask phone number for staff views
 * Format: 98XXXXXX for Nepal mobile numbers.
 */
export function maskPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  return normalized.substring(0, 2) + "XXXX" + normalized.substring(6);
}

/**
 * Validate phone number format
 */
export function validatePhone(phone: string): boolean {
  try {
    normalizePhone(phone);
    return true;
  } catch {
    return false;
  }
}
