import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
const N = 32768;
const R = 8;
const P = 1;
const MAXMEM = 64 * 1024 * 1024;
const KEYLEN = 64;

function deriveKey(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, { N, r: R, p: P, maxmem: MAXMEM }, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(24);
  const key = await deriveKey(password, salt, KEYLEN);
  return `scrypt$v1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== 'v1') return false;
  try {
    const salt = Buffer.from(parts[2], 'base64url');
    const stored = Buffer.from(parts[3], 'base64url');
    if (salt.length !== 24 || stored.length !== KEYLEN) return false;
    const actual = await deriveKey(password, salt, stored.length);
    return timingSafeEqual(stored, actual);
  } catch { return false; }
}
