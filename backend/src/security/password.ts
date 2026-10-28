import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const N = 32768;
const R = 8;
const P = 1;
const MAXMEM = 64 * 1024 * 1024;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(24);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM }) as Buffer;
  return `scrypt$v1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== 'v1') return false;
  try {
    const salt = Buffer.from(parts[2], 'base64url');
    const stored = Buffer.from(parts[3], 'base64url');
    if (salt.length !== 24 || stored.length !== KEYLEN) return false;
    const actual = await scrypt(password, salt, stored.length, { N, r: R, p: P, maxmem: MAXMEM }) as Buffer;
    return timingSafeEqual(stored, actual);
  } catch { return false; }
}
