import { createHash, randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';

export type IntegrationScope = 'catalog.read' | 'orders.read' | 'events.read' | 'mapping.write' | 'stock.write' | 'catalog.write' | 'orders.write' | 'orders.customer.read';
export type IntegrationIdentity = { id: string; storeId: string; provider: string; stockAuthority: boolean; scopes: IntegrationScope[] };

export function assertIntegrationsEnabled(): void {
  if (!config.ENABLE_EXTERNAL_INTEGRATIONS) throw new ApiError(503, 'Integracoes externas desativadas neste ambiente.');
}

export function createIntegrationKey(): { key: string; prefix: string; hash: string } {
  const key = 'f40i_' + randomBytes(32).toString('base64url');
  return { key, prefix: key.slice(0, 18), hash: hashValue(key) };
}

export function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function requireIntegration(request: FastifyRequest, scope: IntegrationScope): Promise<IntegrationIdentity> {
  assertIntegrationsEnabled();
  const bearer = request.headers.authorization;
  const credential = /^Bearer (f40i_[A-Za-z0-9_-]{43})$/i.exec(bearer ?? '');
  if (!credential) throw new ApiError(401, 'Credencial de integracao ausente ou invalida.');
  const hash = hashValue(credential[1]);
  const result = await pool.query<{
    id: string; store_id: string; provider: string; stock_authority: boolean; scopes: IntegrationScope[];
  }>(`SELECT i.id, i.store_id, i.provider, i.stock_authority, i.scopes
      FROM external_integrations i JOIN stores s ON s.id=i.store_id
      WHERE i.token_hash=$1 AND i.revoked_at IS NULL AND s.status='ACTIVE'`, [hash]);
  if (!result.rowCount) throw new ApiError(401, 'Credencial de integracao revogada ou desconhecida.');
  const identity = result.rows[0];
  if (!identity.scopes.includes(scope)) throw new ApiError(403, 'Permissao insuficiente para esta integracao.');
  return { id: identity.id, storeId: identity.store_id, provider: identity.provider,
    stockAuthority: identity.stock_authority, scopes: identity.scopes };
}

export function encodeOrderCursor(date: string, id: string): string {
  // Preserva os microssegundos do PostgreSQL; Date.toISOString() truncaria o cursor.
  return Buffer.from(JSON.stringify([date, id])).toString('base64url');
}
export function decodeOrderCursor(cursor?: string): { date: string; id: string } {
  if (!cursor) return { date: '1970-01-01T00:00:00.000Z', id: '00000000-0000-0000-0000-000000000000' };
  try {
    if (!/^[A-Za-z0-9_-]{20,240}$/.test(cursor)) throw new Error('format');
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== 'string' ||
      typeof decoded[1] !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(decoded[0]) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded[1]) ||
      Number.isNaN(Date.parse(decoded[0]))) throw new Error('payload');
    return { date: decoded[0], id: decoded[1] };
  } catch { throw new ApiError(400, 'Cursor de pedidos invalido.'); }
}
