/**
 * Simple AES encryption for storing integration credentials.
 * Uses Node.js built-in crypto (no extra dependencies).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(
  (process.env.ENCRYPTION_KEY || 'default-key-change-this-in-prod!!').padEnd(32, '0').slice(0, 32)
);

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(encrypted: string): string {
  const [ivHex, tagHex, dataHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}

/** Hash email for Meta CAPI (SHA-256 lowercase trimmed) */
export async function hashEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized)
  );
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
