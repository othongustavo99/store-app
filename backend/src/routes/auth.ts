import type { FastifyInstance } from 'fastify';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { ApiError } from '../security/errors.js';
import { requireIdentity } from '../security/identity.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { createAccessToken, hashToken, newRefreshToken, REFRESH_DAYS, refreshTokenId } from '../security/tokens.js';
import { emailField, nameField, passwordField, validated } from '../security/validation.js';

const registerBody = z.object({ name: nameField, email: emailField, password: passwordField }).strict();
const loginBody = z.object({ email: emailField, password: z.string().min(1).max(128) }).strict();
const refreshBody = z.object({ refreshToken: z.string().min(60).max(150) }).strict();

type UserRow = { id: string; email: string; display_name: string; password_hash: string; status: string };

async function createSession(userId: string) {
  const refresh = newRefreshToken();
  await pool.query(
    `INSERT INTO refresh_sessions (id,user_id,token_hash,expires_at)
     VALUES ($1,$2,$3,now()+($4::int * interval '1 day'))`,
    [refresh.id, userId, refresh.hash, REFRESH_DAYS],
  );
  return {
    accessToken: await createAccessToken(userId, refresh.id),
    refreshToken: refresh.token,
    tokenType: 'Bearer',
    expiresIn: 900,
  };
}

export async function authRoutes(app: FastifyInstance) {
  // Sessão descartável, sempre CLIENTE, sem conta compartilhada nem privilégios.
  // Precisa de duas autorizações: flag do servidor E is_demo da loja.
  app.post('/v1/shops/:slug/auth/demo-customer', {
    config: {rateLimit: {max: 10, timeWindow: '1 hour'}}
  }, async (request, reply) => {
    if (!config.ENABLE_PUBLIC_DEMO_LOGIN) throw new ApiError(403,'Login demonstrativo desabilitado.');
    const params=z.object({slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48)});
    const {slug}=validated(params,request.params);
    const result=await pool.query('SELECT id FROM stores WHERE slug=$1 AND status=$2 AND is_demo=true',
      [slug,'ACTIVE']);
    if (!result.rowCount) throw new ApiError(403,'A loja não está habilitada para demonstração.');
    const email=`visitor-${randomUUID()}@demo.invalid`;
    const hash=await hashPassword(randomBytes(48).toString('base64url'));
    const created=await pool.query<{id:string;email:string;display_name:string}>(
      'INSERT INTO users(email,display_name,password_hash) VALUES($1,$2,$3) RETURNING id,email,display_name',
      [email,'Cliente demonstração',hash]);
    const user=created.rows[0];
    return reply.code(201).send({user:{id:user.id,email:user.email,name:user.display_name},
      ...(await createSession(user.id))});
  });

  app.post('/v1/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = validated(registerBody, request.body);
    const hash = await hashPassword(body.password);
    let user: { id: string; email: string; display_name: string };
    try {
      const result = await pool.query<{ id: string; email: string; display_name: string }>(
        'INSERT INTO users (display_name,email,password_hash) VALUES ($1,$2,$3) RETURNING id,email,display_name',
        [body.name, body.email, hash],
      );
      user = result.rows[0];
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'Email já cadastrado.');
      throw error;
    }
    const tokens = await createSession(user.id);
    return reply.code(201).send({ user: { id: user.id, email: user.email, name: user.display_name }, ...tokens });
  });

  app.post('/v1/auth/login', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request) => {
    const body = validated(loginBody, request.body);
    const found = await pool.query<UserRow>('SELECT id,email,display_name,password_hash,status FROM users WHERE email=$1', [body.email]);
    const user = found.rows[0];
    if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(body.password, user.password_hash))) {
      throw new ApiError(401, 'Credenciais inválidas.');
    }
    return { user: { id: user.id, email: user.email, name: user.display_name }, ...(await createSession(user.id)) };
  });

  app.post('/v1/auth/refresh', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const { refreshToken } = validated(refreshBody, request.body);
    const sessionId = refreshTokenId(refreshToken);
    if (!sessionId) throw new ApiError(401, 'Sessão inválida.');
    const nextToken = `${sessionId}.${randomBytes(48).toString('base64url')}`;
    const updated = await pool.query<{ user_id: string }>(
      `UPDATE refresh_sessions rs SET token_hash=$1, last_used_at=now(),
         expires_at=now()+($2::int * interval '1 day')
       WHERE id=$3 AND token_hash=$4 AND revoked_at IS NULL AND expires_at > now()
         AND EXISTS (SELECT 1 FROM users u WHERE u.id=rs.user_id AND u.status='ACTIVE')
       RETURNING user_id`,
      [hashToken(nextToken), REFRESH_DAYS, sessionId, hashToken(refreshToken)],
    );
    if (!updated.rowCount) throw new ApiError(401, 'Sessão inválida ou token já utilizado.');
    // O identificador da sessão permanece estável; só o segredo muda.
    return {
      accessToken: await createAccessToken(updated.rows[0].user_id, sessionId),
      refreshToken: nextToken,
      tokenType: 'Bearer', expiresIn: 900,
    };
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    const identity = await requireIdentity(request);
    await pool.query('UPDATE refresh_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',
      [identity.sessionId, identity.userId]);
    return reply.code(204).send();
  });

  app.get('/v1/me', async (request) => {
    const identity = await requireIdentity(request);
    const user = await pool.query<{ id: string; email: string; display_name: string; email_verified_at: Date | null }>(
      'SELECT id,email,display_name,email_verified_at FROM users WHERE id=$1', [identity.userId],
    );
    return {
      id: user.rows[0].id, email: user.rows[0].email,
      name: user.rows[0].display_name,
      emailVerified: Boolean(user.rows[0].email_verified_at),
    };
  });
}
