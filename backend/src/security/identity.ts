import type { FastifyRequest } from 'fastify';
import { pool } from '../db/pool.js';
import { ApiError } from './errors.js';
import { verifyAccessToken } from './tokens.js';

export type Identity = { userId: string; sessionId: string };
export type StoreRole = 'OWNER' | 'MANAGER' | 'STAFF';

export async function requireIdentity(request: FastifyRequest): Promise<Identity> {
  const raw = request.headers.authorization;
  if (!raw || !/^Bearer\s+\S+$/i.test(raw)) throw new ApiError(401, 'Autenticação necessária.');
  try {
    const identity = await verifyAccessToken(raw.replace(/^Bearer\s+/i, ''));
    const active = await pool.query(
      `SELECT 1 FROM refresh_sessions rs JOIN users u ON u.id=rs.user_id
       WHERE rs.id=$1 AND rs.user_id=$2 AND rs.revoked_at IS NULL
         AND rs.expires_at > now() AND u.status='ACTIVE'`,
      [identity.sessionId, identity.userId],
    );
    if (!active.rowCount) throw new Error('Sessão encerrada');
    return identity;
  } catch { throw new ApiError(401, 'Sessão inválida ou expirada.'); }
}

export async function requireStoreRole(
  request: FastifyRequest, storeId: string, allowedRoles: readonly StoreRole[],
): Promise<{ identity: Identity; role: StoreRole }> {
  const identity = await requireIdentity(request);
  const result = await pool.query<{ role: StoreRole; status: string }>(
    `SELECT sm.role, s.status FROM store_memberships sm
     JOIN stores s ON s.id=sm.store_id
     WHERE sm.store_id=$1 AND sm.user_id=$2`, [storeId, identity.userId],
  );
  if (!result.rowCount) throw new ApiError(404, 'Loja não encontrada.');
  const membership = result.rows[0];
  if (membership.status !== 'ACTIVE') throw new ApiError(403, 'Loja indisponível.');
  if (!allowedRoles.includes(membership.role)) throw new ApiError(403, 'Permissão insuficiente.');
  return { identity, role: membership.role };
}
