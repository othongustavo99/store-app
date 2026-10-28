import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireIdentity, requireStoreRole } from '../security/identity.js';
import { emailField, uuidParam, validated } from '../security/validation.js';
import { hashInviteCode, newInviteCode } from '../services/team_invites.js';

const storeParams = z.object({ storeId: uuidParam }).strict();
const memberParams = storeParams.extend({ userId: uuidParam });
const inviteParams = storeParams.extend({ invitationId: uuidParam });
const inviteBody = z.object({ email: emailField, role: z.enum(['MANAGER', 'STAFF']) }).strict();
const roleBody = z.object({ role: z.enum(['MANAGER', 'STAFF']) }).strict();
const acceptBody = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/), storeId: uuidParam }).strict();

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/stores/:storeId/team', async (req) => {
    const { storeId } = validated(storeParams, req.params);
    const { role } = await requireStoreRole(req, storeId, ['OWNER', 'MANAGER']);
    const members = await pool.query(`
      SELECT u.id, u.display_name AS name, u.email, sm.role, sm.created_at AS "joinedAt"
      FROM store_memberships sm JOIN users u ON u.id=sm.user_id
      WHERE sm.store_id=$1 ORDER BY CASE sm.role WHEN 'OWNER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END, u.display_name`, [storeId]);
    const invites = role === 'OWNER'
      ? await pool.query(`SELECT id,email,role,created_at AS "createdAt",expires_at AS "expiresAt",
           accepted_at AS "acceptedAt",revoked_at AS "revokedAt"
           FROM store_team_invitations WHERE store_id=$1 ORDER BY created_at DESC LIMIT 50`, [storeId])
      : { rows: [] };
    return { myRole: role, members: members.rows, invitations: invites.rows };
  });

  app.post('/v1/stores/:storeId/team/invitations', { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { storeId } = validated(storeParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER']);
    const body = validated(inviteBody, req.body);
    const code = newInviteCode();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa convites da mesma loja para que o limite seja aplicado sob concorrência.
      await client.query('SELECT id FROM stores WHERE id=$1 FOR UPDATE', [storeId]);
      const existing = await client.query(`SELECT 1 FROM store_memberships sm JOIN users u ON u.id=sm.user_id
        WHERE sm.store_id=$1 AND u.email=$2`, [storeId, body.email]);
      if (existing.rowCount) throw new ApiError(409, 'Este usuário já pertence à equipe.');
      const duplicates = await client.query(`SELECT 1 FROM store_team_invitations
        WHERE store_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()`, [storeId, body.email]);
      if (duplicates.rowCount) throw new ApiError(409, 'Já existe convite ativo para esse email. Revogue-o antes de criar outro.');
      const pending = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM store_team_invitations
        WHERE store_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()`, [storeId]);
      if (Number(pending.rows[0].count) >= 15) throw new ApiError(409, 'Limite de 15 convites ativos atingido.');
      const created = await client.query<{ id: string; expiresAt: Date }>(`
        INSERT INTO store_team_invitations(store_id,email,role,token_hash,invited_by,expires_at)
        VALUES($1,$2,$3,$4,$5,now()+interval '72 hours') RETURNING id,expires_at AS "expiresAt"`,
        [storeId, body.email, body.role, hashInviteCode(code), identity.userId]);
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
        VALUES ($1,$2,'TEAM_INVITED','team_invitation',$3,$4::jsonb)`,
        [storeId, identity.userId, created.rows[0].id, JSON.stringify({ role: body.role, email: body.email })]);
      await client.query('COMMIT');
      // Não persistir nem registrar o código no log. Exibir apenas nesta resposta.
      return reply.code(201).send({ invitation: { id: created.rows[0].id, email: body.email, role: body.role,
        expiresAt: created.rows[0].expiresAt }, code });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  });

  app.post('/v1/team/invitations/accept', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (req) => {
    const { userId } = await requireIdentity(req);
    const { code, storeId } = validated(acceptBody, req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const invite = await client.query<{ id: string; store_id: string; email: string; role: string }>(`
        SELECT id,store_id,email,role FROM store_team_invitations
        WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()
        FOR UPDATE`, [hashInviteCode(code)]);
      if (!invite.rowCount) throw new ApiError(400, 'Convite inválido, utilizado ou expirado.');
      const i = invite.rows[0];
      if (i.store_id !== storeId) throw new ApiError(403, 'O convite não pertence à loja aberta.');
      const user = await client.query<{ email: string }>(`SELECT email FROM users WHERE id=$1 AND status='ACTIVE'`, [userId]);
      if (!user.rowCount || user.rows[0].email !== i.email) {
        throw new ApiError(403, 'Entre com o email indicado no convite para aceitá-lo.');
      }
      const store = await client.query(`SELECT 1 FROM stores WHERE id=$1 AND status='ACTIVE'`, [i.store_id]);
      if (!store.rowCount) throw new ApiError(403, 'Loja indisponível.');
      const already = await client.query('SELECT 1 FROM store_memberships WHERE store_id=$1 AND user_id=$2', [i.store_id, userId]);
      if (already.rowCount) throw new ApiError(409, 'Você já pertence a esta loja.');
      await client.query('INSERT INTO store_memberships(store_id,user_id,role) VALUES($1,$2,$3)', [i.store_id, userId, i.role]);
      await client.query(`UPDATE store_team_invitations SET accepted_by=$2,accepted_at=now() WHERE id=$1`, [i.id, userId]);
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
        VALUES($1,$2,'TEAM_INVITE_ACCEPTED','store_membership',$2,$3::jsonb)`,
        [i.store_id, userId, JSON.stringify({ invitationId: i.id, role: i.role })]);
      await client.query('COMMIT');
      return { storeId: i.store_id, role: i.role };
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  });

  app.post('/v1/stores/:storeId/team/invitations/:invitationId/revoke', async (req) => {
    const { storeId, invitationId } = validated(inviteParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER']);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`UPDATE store_team_invitations SET revoked_at=now()
        WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL AND accepted_at IS NULL RETURNING id`,
        [invitationId, storeId]);
      if (!result.rowCount) throw new ApiError(404, 'Convite não encontrado ou já utilizado.');
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id)
        VALUES($1,$2,'TEAM_INVITE_REVOKED','team_invitation',$3)`,
        [storeId, identity.userId, invitationId]);
      await client.query('COMMIT');
      return { revoked: true };
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  });

  app.patch('/v1/stores/:storeId/team/members/:userId', async (req) => {
    const { storeId, userId } = validated(memberParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER']);
    const { role } = validated(roleBody, req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(`UPDATE store_memberships SET role=$3
        WHERE store_id=$1 AND user_id=$2 AND role IN ('MANAGER','STAFF') RETURNING role`,
        [storeId, userId, role]);
      if (!updated.rowCount) throw new ApiError(404, 'Funcionário não encontrado ou proprietário protegido.');
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
        VALUES($1,$2,'TEAM_ROLE_CHANGED','store_membership',$3,$4::jsonb)`,
        [storeId, identity.userId, userId, JSON.stringify({ role })]);
      await client.query('COMMIT');
      return { role };
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  });

  app.delete('/v1/stores/:storeId/team/members/:userId', async (req) => {
    const { storeId, userId } = validated(memberParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER']);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const removed = await client.query(`DELETE FROM store_memberships
        WHERE store_id=$1 AND user_id=$2 AND role IN ('MANAGER','STAFF') RETURNING user_id`,
        [storeId, userId]);
      if (!removed.rowCount) throw new ApiError(404, 'Funcionário não encontrado ou proprietário protegido.');
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id)
        VALUES($1,$2,'TEAM_MEMBER_REMOVED','store_membership',$3)`,
        [storeId, identity.userId, userId]);
      await client.query('COMMIT');
      return { removed: true };
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  });
}
