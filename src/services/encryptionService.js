import crypto from 'crypto';
import { config } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM

/**
 * Derives a 32-byte encryption key from the configured hex key or environment variable.
 */
function getKey() {
  const rawKey = config.encryption.key;
  if (Buffer.byteLength(rawKey, 'hex') === 32) {
    return Buffer.from(rawKey, 'hex');
  }
  // Fallback to SHA-256 hash if rawKey is arbitrary string
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM with authenticated tag.
 * Returns a compact colon-delimited string: "iv:tag:ciphertext" (in hex format).
 * @param {string} plaintext
 * @returns {string}
 */
export function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return null;
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(String(plaintext), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a compact "iv:tag:ciphertext" hex string.
 * @param {string} encryptedPacked
 * @returns {string}
 */
export function decryptField(encryptedPacked) {
  if (!encryptedPacked) {
    return null;
  }
  const parts = encryptedPacked.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted field format. Expected "iv:tag:ciphertext"');
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Masks an account number, preserving only the last 4 digits for safe logs and display.
 * @param {string} accountNumber
 * @returns {string} e.g. "XXXX-XXXX-1234"
 */
export function maskAccountNumber(accountNumber) {
  if (!accountNumber) return '';
  const clean = String(accountNumber).trim();
  if (clean.length <= 4) return clean;
  const last4 = clean.slice(-4);
  return `XXXX-XXXX-${last4}`;
}

/**
 * Masks a tax/PAN number, revealing only the last 4 characters.
 * @param {string} pan
 * @returns {string}
 */
export function maskPan(pan) {
  if (!pan) return '';
  const clean = String(pan).trim();
  if (clean.length <= 4) return clean;
  return `XXXXX${clean.slice(-4)}`;
}
