import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireIdentity, requireStoreRole } from '../security/identity.js';
import { nameField, slugField, uuidParam, validated } from '../security/validation.js';

const createStoreBody = z.object({ name: nameField, slug: slugField }).strict();
const storeIdParams = z.object({ storeId: uuidParam });
const slugParams = z.object({ slug: slugField });

export async function storeRoutes(app: FastifyInstance) {
  app.get('/v1/shops/:slug', async (request) => {
    const { slug } = validated(slugParams, request.params);
    const result = await pool.query<{ id: string; name: string; slug: string; currency: string }>(
      `SELECT id,name,slug,currency,is_demo AS "isDemo" FROM stores WHERE slug=$1 AND status='ACTIVE'`, [slug],
    );
    if (!result.rowCount) throw new ApiError(404, 'Loja não encontrada.');
    return { store: result.rows[0] };
  });

  app.post('/v1/stores', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (request, reply) => {
    const identity = await requireIdentity(request);
    if (!config.ALLOW_STORE_SELF_SERVICE) {
      throw new ApiError(403, 'Cadastro público de lojas desabilitado.');
    }
    const { name, slug } = validated(createStoreBody, request.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa tentativas simultâneas do mesmo proprietário para evitar duas lojas no piloto.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [identity.userId]);
      // Limite conservador no piloto. No futuro, criação de lojas exige provisionamento comercial.
      const already = await client.query('SELECT 1 FROM store_memberships WHERE user_id=$1 AND role=$2 LIMIT 1', [identity.userId, 'OWNER']);
      if (already.rowCount) throw new ApiError(409, 'Esta conta já possui uma loja.');
      const created = await client.query<{ id: string; name: string; slug: string }>(
        'INSERT INTO stores (name,slug) VALUES ($1,$2) RETURNING id,name,slug', [name, slug],
      );
      const store = created.rows[0];
      await client.query('INSERT INTO store_memberships (store_id,user_id,role) VALUES ($1,$2,$3)', [store.id, identity.userId, 'OWNER']);
      await client.query(
        `INSERT INTO audit_logs (store_id,actor_id,event,entity_type,entity_id)
         VALUES ($1,$2,'STORE_CREATED','store',$1)`, [store.id, identity.userId],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ store, role: 'OWNER' });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'Identificador de loja já utilizado.');
      throw error;
    } finally { client.release(); }
  });

  app.get('/v1/stores/mine', async (request) => {
    const identity = await requireIdentity(request);
    const result = await pool.query(
      `SELECT s.id,s.name,s.slug,s.status,s.currency,sm.role
       FROM store_memberships sm JOIN stores s ON s.id=sm.store_id
       WHERE sm.user_id=$1 ORDER BY s.created_at DESC`, [identity.userId],
    );
    return { stores: result.rows };
  });

  app.get('/v1/stores/:storeId', async (request) => {
    const { storeId } = validated(storeIdParams, request.params);
    const { role } = await requireStoreRole(request, storeId, ['OWNER', 'MANAGER', 'STAFF']);
    const result = await pool.query(
      'SELECT id,name,slug,status,currency,created_at FROM stores WHERE id=$1', [storeId],
    );
    return { store: result.rows[0], role };
  });

  app.get('/v1/stores/:storeId/members', async (request) => {
    const { storeId } = validated(storeIdParams, request.params);
    await requireStoreRole(request, storeId, ['OWNER', 'MANAGER']);
    const result = await pool.query(
      `SELECT u.id,u.display_name,u.email,sm.role,sm.created_at
       FROM store_memberships sm JOIN users u ON u.id=sm.user_id
       WHERE sm.store_id=$1 ORDER BY sm.created_at ASC`, [storeId],
    );
    return { members: result.rows };
  });
}
