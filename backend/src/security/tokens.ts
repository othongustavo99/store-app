import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

const secret = new TextEncoder().encode(config.JWT_SECRET);
const AUDIENCE = 'loja-api-mobile';
export const REFRESH_DAYS = 30;

export async function createAccessToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer(config.JWT_ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime('15m')
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<{ userId: string; sessionId: string }> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: config.JWT_ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
    clockTolerance: 5,
  });
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new Error('Token inválido');
  return { userId: payload.sub, sessionId: payload.sid };
}

export function newRefreshToken() {
  const id = randomUUID();
  const token = `${id}.${randomBytes(48).toString('base64url')}`;
  return { id, token, hash: hashToken(token) };
}

export function hashToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function refreshTokenId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 150) return null;
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.[a-zA-Z0-9_-]{64}$/.exec(value);
  return match ? match[1] : null;
}
