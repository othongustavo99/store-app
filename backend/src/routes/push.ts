import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireIdentity } from '../security/identity.js';
import { validated } from '../security/validation.js';
import { ApiError } from '../security/errors.js';
const params=z.object({slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48)});
const register=z.object({token:z.string().min(60).max(4096),platform:z.enum(['ANDROID','IOS'])}).strict();
const unregister=z.object({token:z.string().min(60).max(4096)}).strict();
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function pushRoutes(app:FastifyInstance) {
 app.post('/v1/shops/:slug/push/devices',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req)=>{
  const {slug}=validated(params,req.params),b=validated(register,req.body);
  const {userId}=await requireIdentity(req);
  const r=await pool.query<{id:string}>("SELECT id FROM stores WHERE slug=$1 AND status='ACTIVE'",[slug]);
  if(!r.rowCount)throw new ApiError(404,'Loja não encontrada.');
  await pool.query(`INSERT INTO push_device_tokens(token_hash,token,user_id,store_id,platform)
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(token_hash) DO UPDATE SET user_id=EXCLUDED.user_id,store_id=EXCLUDED.store_id,
      platform=EXCLUDED.platform,enabled=true,updated_at=now()`,[digest(b.token),b.token,userId,r.rows[0].id,b.platform]);
  return {registered:true};
 });
 app.delete('/v1/shops/:slug/push/devices',async(req)=>{
  const {slug}=validated(params,req.params),{token}=validated(unregister,req.body);
  const {userId}=await requireIdentity(req);
  await pool.query(`DELETE FROM push_device_tokens WHERE token_hash=$1 AND user_id=$2
    AND store_id=(SELECT id FROM stores WHERE slug=$3)`,[digest(token),userId,slug]);
  return {removed:true};
 });
}
