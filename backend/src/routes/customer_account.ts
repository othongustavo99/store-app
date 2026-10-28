import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireIdentity } from '../security/identity.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { validated } from '../security/validation.js';
import { addressBodySchema, addressIdParam, changePasswordSchema, editProfileSchema } from '../services/account_validation.js';
import type { PoolClient } from 'pg';

// Limita cada conta a um conjunto pequeno de endereços. A trava na linha de
// users serializa edições concorrentes para o MESMO usuário.
async function withUserLock<T>(userId: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    const value = await action(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

const addressOutput = (r: Record<string, unknown>) => ({
  id: r.id, label: r.label, zipCode: r.zip_code, street: r.street,
  number: r.number, complement: r.complement, neighborhood: r.neighborhood,
  city: r.city, state: r.state, isPrimary: r.is_primary,
});

export async function customerAccountRoutes(app: FastifyInstance) {
  app.patch('/v1/me', async (request) => {
    const { userId } = await requireIdentity(request);
    const { name } = validated(editProfileSchema, request.body);
    const updated = await pool.query<{ id: string; email: string; display_name: string }>(
      'UPDATE users SET display_name=$1, updated_at=now() WHERE id=$2 RETURNING id,email,display_name',
      [name, userId],
    );
    if (!updated.rowCount) throw new ApiError(404, 'Conta não encontrada.');
    return { id: updated.rows[0].id, email: updated.rows[0].email, name: updated.rows[0].display_name };
  });

  app.post('/v1/me/password', { config: { rateLimit: { max: 4, timeWindow: '5 minutes' } } }, async (request) => {
    const { userId, sessionId } = await requireIdentity(request);
    const body = validated(changePasswordSchema, request.body);
    // Protege contra alterações simultâneas com a senha antiga.
    await withUserLock(userId, async (client) => {
      const result = await client.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1', [userId]);
      if (!result.rowCount || !(await verifyPassword(body.currentPassword, result.rows[0].password_hash))) {
        throw new ApiError(401, 'Senha atual incorreta.');
      }
      const passwordHash = await hashPassword(body.newPassword);
      await client.query('UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2', [passwordHash, userId]);
      await client.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL',
        [userId, sessionId]);
    });
    return { message: 'Senha alterada. As demais sessões foram encerradas.' };
  });

  app.get('/v1/me/addresses', async (request) => {
    const { userId } = await requireIdentity(request);
    const rows = await pool.query(
      `SELECT id,label,zip_code,street,number,complement,neighborhood,city,state,is_primary
       FROM customer_addresses WHERE user_id=$1 ORDER BY is_primary DESC,created_at,id`, [userId],
    );
    return { addresses: rows.rows.map(addressOutput) };
  });

  app.post('/v1/me/addresses', async (request, reply) => {
    const { userId } = await requireIdentity(request);
    const data = validated(addressBodySchema, request.body);
    const result = await withUserLock(userId, async client => {
      const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM customer_addresses WHERE user_id=$1', [userId]);
      if (Number(count.rows[0].count) >= 20) throw new ApiError(409, 'Limite de 20 endereços atingido.');
      if (data.isPrimary || Number(count.rows[0].count) === 0) {
        await client.query('UPDATE customer_addresses SET is_primary=false,updated_at=now() WHERE user_id=$1 AND is_primary', [userId]);
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO customer_addresses (user_id,label,zip_code,street,number,complement,neighborhood,city,state,is_primary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [userId,data.label,data.zipCode,data.street,data.number,data.complement,data.neighborhood,data.city,
          data.state,data.isPrimary || Number(count.rows[0].count)===0],
      );
      return inserted.rows[0].id;
    });
    return reply.code(201).send({ id: result });
  });

  app.put('/v1/me/addresses/:id', async (request) => {
    const { userId } = await requireIdentity(request);
    const { id } = validated(addressIdParam, request.params);
    const data = validated(addressBodySchema, request.body);
    await withUserLock(userId, async client => {
      const found = await client.query<{ is_primary: boolean }>(
        'SELECT is_primary FROM customer_addresses WHERE id=$1 AND user_id=$2', [id, userId]);
      if (!found.rowCount) throw new ApiError(404, 'Endereço não encontrado.');
      const primary = data.isPrimary || found.rows[0].is_primary;
      if (primary) await client.query('UPDATE customer_addresses SET is_primary=false,updated_at=now() WHERE user_id=$1 AND is_primary', [userId]);
      await client.query(
        `UPDATE customer_addresses SET label=$1,zip_code=$2,street=$3,number=$4,complement=$5,
         neighborhood=$6,city=$7,state=$8,is_primary=$9,updated_at=now() WHERE id=$10 AND user_id=$11`,
        [data.label,data.zipCode,data.street,data.number,data.complement,data.neighborhood,data.city,
          data.state,primary,id,userId],
      );
    });
    return { status: 'ok' };
  });

  app.post('/v1/me/addresses/:id/primary', async request => {
    const { userId } = await requireIdentity(request);
    const { id } = validated(addressIdParam, request.params);
    await withUserLock(userId, async client => {
      const exists = await client.query('SELECT id FROM customer_addresses WHERE id=$1 AND user_id=$2', [id,userId]);
      if (!exists.rowCount) throw new ApiError(404, 'Endereço não encontrado.');
      await client.query('UPDATE customer_addresses SET is_primary=false,updated_at=now() WHERE user_id=$1 AND is_primary', [userId]);
      await client.query('UPDATE customer_addresses SET is_primary=true,updated_at=now() WHERE id=$1 AND user_id=$2', [id,userId]);
    });
    return { status: 'ok' };
  });

  app.delete('/v1/me/addresses/:id', async (request, reply) => {
    const { userId } = await requireIdentity(request);
    const { id } = validated(addressIdParam, request.params);
    await withUserLock(userId, async client => {
      const deleted = await client.query<{ is_primary: boolean }>(
        'DELETE FROM customer_addresses WHERE id=$1 AND user_id=$2 RETURNING is_primary', [id,userId]);
      if (!deleted.rowCount) throw new ApiError(404, 'Endereço não encontrado.');
      if (deleted.rows[0].is_primary) {
        await client.query(`UPDATE customer_addresses SET is_primary=true,updated_at=now()
          WHERE id=(SELECT id FROM customer_addresses WHERE user_id=$1 ORDER BY created_at,id LIMIT 1) AND user_id=$1`,[userId]);
      }
    });
    return reply.code(204).send();
  });
}
