import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireStoreRole } from '../security/identity.js';
import { validated, uuidParam } from '../security/validation.js';
import { assertIntegrationsEnabled, hashValue, requireIntegration } from '../integrations/core.js';
import {
  assertLeasedDelivery, DELIVERY_LEASE_SECONDS, leaseSecret, MAX_CLAIM_BATCH,
  MAX_DELIVERY_ATTEMPTS, retryDelaySeconds,
} from '../services/external_delivery_rules.js';

const storeIntegrationParams = z.object({ storeId: uuidParam, integrationId: uuidParam }).strict();
const storeEventParams = storeIntegrationParams.extend({ eventId: z.string().regex(/^[1-9]\d{0,17}$/) });
const eventParams = z.object({ eventId: z.string().regex(/^[1-9]\d{0,17}$/) }).strict();
const claimBody = z.object({ limit: z.number().int().min(1).max(MAX_CLAIM_BATCH).default(10) }).strict();
const leaseToken = z.string().regex(/^f40l_[A-Za-z0-9_-]{43}$/);
const ackBody = z.object({ leaseToken }).strict();
const nackBody = z.object({
  leaseToken,
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,47}$/), // somente codigo; nunca incluir dados do cliente
  retryable: z.boolean().default(true),
}).strict();
const detailsQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();

async function auditEvent(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  storeId: string, actorId: string, event: string, integrationId: string, metadata?: object,
): Promise<void> {
  await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
    VALUES($1,$2,$3,'external_integration',$4,$5::jsonb)`,
  [storeId, actorId, event, integrationId, JSON.stringify(metadata ?? {})]);
}

export async function externalDeliveryRoutes(app: FastifyInstance): Promise<void> {
  // Modo novo exige opt-in de OWNER. Integracoes ja criadas continuam em POLL.
  app.post('/v1/stores/:storeId/integrations/:integrationId/enable-leased-delivery', async req => {
    assertIntegrationsEnabled();
    const { storeId, integrationId } = validated(storeIntegrationParams, req.params);
    const { identity } = await requireStoreRole(req, storeId, ['OWNER']);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query<{ delivery_mode: string }>(`SELECT delivery_mode FROM external_integrations
        WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL FOR UPDATE`, [integrationId, storeId]);
      if (!row.rowCount) throw new ApiError(404, 'Integracao ativa nao encontrada nesta loja.');
      const alreadyEnabled = row.rows[0].delivery_mode === 'LEASED';
      if (!alreadyEnabled) {
        await client.query(`UPDATE external_integrations SET delivery_mode='LEASED'
          WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL`, [integrationId, storeId]);
        await auditEvent(client,storeId,identity.userId,'INTEGRATION_LEASED_DELIVERY_ENABLED',integrationId);
      }
      await client.query('COMMIT');
      return { deliveryMode: 'LEASED', alreadyEnabled };
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  });

  // Monitoramento por proprietario; nao devolve tokens nem dados pessoais.
  app.get('/v1/stores/:storeId/integrations/:integrationId/delivery', async req => {
    assertIntegrationsEnabled();
    const { storeId, integrationId } = validated(storeIntegrationParams, req.params);
    await requireStoreRole(req, storeId, ['OWNER']);
    const { limit } = validated(detailsQuery, req.query);
    const integration = await pool.query<{ deliveryMode: string }>(`SELECT delivery_mode AS "deliveryMode"
      FROM external_integrations WHERE id=$1 AND store_id=$2`, [integrationId,storeId]);
    if (!integration.rowCount) throw new ApiError(404,'Integracao nao encontrada nesta loja.');
    const [totals, waiting, failures] = await Promise.all([
      pool.query(`SELECT status,count(*)::int AS count FROM external_event_deliveries
        WHERE integration_id=$1 AND store_id=$2 GROUP BY status`, [integrationId,storeId]),
      pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM external_change_events e
        WHERE e.store_id=$1 AND e.origin_integration_id IS DISTINCT FROM $2::uuid
        AND NOT EXISTS (SELECT 1 FROM external_event_acks a
          WHERE a.integration_id=$2 AND a.event_id=e.id)
        AND NOT EXISTS (SELECT 1 FROM external_event_deliveries d
          WHERE d.integration_id=$2 AND d.event_id=e.id)`, [storeId,integrationId]),
      pool.query(`SELECT d.event_id::text AS "eventId",e.event_type AS "type",
        e.resource_id AS "resourceId",d.status,d.attempts,d.last_error_code AS "lastErrorCode",
        d.last_error_at AS "lastErrorAt",d.next_attempt_at AS "nextAttemptAt",d.updated_at AS "updatedAt"
        FROM external_event_deliveries d JOIN external_change_events e
          ON e.id=d.event_id AND e.store_id=d.store_id
        WHERE d.integration_id=$1 AND d.store_id=$2
          AND (d.status='DEAD' OR d.last_error_code IS NOT NULL)
        ORDER BY d.updated_at DESC LIMIT $3`, [integrationId,storeId,limit]),
    ]);
    return { deliveryMode: integration.rows[0].deliveryMode,
      unmaterializedEvents: Number(waiting.rows[0]?.count ?? 0),
      counts: Object.fromEntries(totals.rows.map((r: {status:string;count:number})=>[r.status,r.count])),
      recentFailures: failures.rows,
      note: 'Contadores por integracao; eventos ainda nao materializados aparecem separados.' };
  });

  app.post('/v1/stores/:storeId/integrations/:integrationId/events/:eventId/retry', async req => {
    assertIntegrationsEnabled();
    const {storeId,integrationId,eventId} = validated(storeEventParams,req.params);
    const {identity} = await requireStoreRole(req,storeId,['OWNER']);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const changed=await client.query(`UPDATE external_event_deliveries SET status='PENDING',attempts=0,
        next_attempt_at=now(),last_error_code=NULL,last_error_at=NULL,lease_token_hash=NULL,
        lease_expires_at=NULL,updated_at=now()
        WHERE integration_id=$1 AND store_id=$2 AND event_id=$3::bigint AND status='DEAD'
        RETURNING event_id`, [integrationId,storeId,eventId]);
      if (!changed.rowCount) throw new ApiError(409,'Evento nao esta na fila de falhas desta integracao.');
      await auditEvent(client,storeId,identity.userId,'INTEGRATION_EVENT_RETRIED',integrationId,{eventId});
      await client.query('COMMIT');
      return { eventId, requeued: true };
    } catch(e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  });

  // Cada requisicao reserva eventos por 5 minutos. Concorrencia: SKIP LOCKED + lock por integracao.
  app.post('/v1/external/events/claim', async req => {
    const identity=await requireIntegration(req,'events.read');
    assertLeasedDelivery(identity);
    const {limit}=validated(claimBody,req.body);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[identity.id]);
      const active=await client.query(`SELECT id FROM external_integrations
        WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL AND delivery_mode='LEASED' FOR SHARE`,
      [identity.id,identity.storeId]);
      if(!active.rowCount) throw new ApiError(403,'Integracao revogada ou alterada.');
      // Preenche fila de maneira incremental. Nunca pula commits atrasados por cursor de sequencia.
      await client.query(`INSERT INTO external_event_deliveries(integration_id,store_id,event_id)
        SELECT $2,e.store_id,e.id FROM external_change_events e
        WHERE e.store_id=$1 AND e.origin_integration_id IS DISTINCT FROM $2::uuid
          AND NOT EXISTS (SELECT 1 FROM external_event_acks a
            WHERE a.integration_id=$2 AND a.event_id=e.id)
          AND NOT EXISTS (SELECT 1 FROM external_event_deliveries d
            WHERE d.integration_id=$2 AND d.event_id=e.id)
        ORDER BY e.id LIMIT $3 ON CONFLICT DO NOTHING`,
      [identity.storeId,identity.id,Math.max(limit*4,100)]);
      // Leases vencidos na ultima tentativa vao para revisao manual, nao ficam presos para sempre.
      await client.query(`UPDATE external_event_deliveries
        SET status='DEAD',lease_token_hash=NULL,lease_expires_at=NULL,
          last_error_code='LEASE_EXPIRED_MAX_ATTEMPTS',last_error_at=now(),updated_at=now()
        WHERE integration_id=$1 AND store_id=$2 AND status='IN_FLIGHT'
          AND lease_expires_at <= now() AND attempts >= $3`,
      [identity.id,identity.storeId,MAX_DELIVERY_ATTEMPTS]);
      const due=await client.query<{id:string;type:string;resourceId:string;createdAt:Date;attempts:number}>(`
        SELECT d.event_id::text AS id,e.event_type AS type,e.resource_id AS "resourceId",
          e.created_at AS "createdAt",d.attempts
        FROM external_event_deliveries d JOIN external_change_events e
          ON e.id=d.event_id AND e.store_id=d.store_id
        WHERE d.integration_id=$1 AND d.store_id=$2 AND (
          (d.status='PENDING' AND d.next_attempt_at<=now()) OR
          (d.status='IN_FLIGHT' AND d.lease_expires_at<=now() AND d.attempts<$3))
        ORDER BY d.event_id LIMIT $4 FOR UPDATE OF d SKIP LOCKED`,
      [identity.id,identity.storeId,MAX_DELIVERY_ATTEMPTS,limit]);
      const events=[];
      for(const row of due.rows) {
        const token=leaseSecret();
        const result=await client.query<{attempts:number;leaseExpiresAt:Date}>(`
          UPDATE external_event_deliveries
          SET status='IN_FLIGHT',attempts=attempts+1,lease_token_hash=$4,
            lease_expires_at=now()+($5::integer * INTERVAL '1 second'),updated_at=now()
          WHERE integration_id=$1 AND store_id=$2 AND event_id=$3::bigint
          RETURNING attempts,lease_expires_at AS "leaseExpiresAt"`,
        [identity.id,identity.storeId,row.id,hashValue(token),DELIVERY_LEASE_SECONDS]);
        events.push({id:row.id,type:row.type,resourceId:row.resourceId,createdAt:row.createdAt,
          attempts:result.rows[0].attempts,leaseToken:token,leaseExpiresAt:result.rows[0].leaseExpiresAt});
      }
      await client.query('COMMIT');
      return {events,leaseSeconds:DELIVERY_LEASE_SECONDS,maxAttempts:MAX_DELIVERY_ATTEMPTS};
    } catch(e){await client.query('ROLLBACK');throw e;}
    finally{client.release();}
  });

  app.post('/v1/external/events/:eventId/ack', async req => {
    const identity=await requireIntegration(req,'events.read');
    assertLeasedDelivery(identity);
    const {eventId}=validated(eventParams,req.params);
    const {leaseToken:token}=validated(ackBody,req.body);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query<{status:string;leaseValid:boolean}>(`
        SELECT status,(lease_expires_at>now()) AS "leaseValid" FROM external_event_deliveries
        WHERE integration_id=$1 AND store_id=$2 AND event_id=$3::bigint
          AND lease_token_hash=$4 FOR UPDATE`,
      [identity.id,identity.storeId,eventId,hashValue(token)]);
      if(!found.rowCount) throw new ApiError(409,'Lease desconhecido, revogado ou substituido.');
      if(found.rows[0].status==='ACKED') {
        await client.query('COMMIT');
        return {eventId,acknowledged:true,idempotent:true};
      }
      if(found.rows[0].status!=='IN_FLIGHT'||!found.rows[0].leaseValid)
        throw new ApiError(409,'Lease expirado ou inativo. Solicite o evento novamente.');
      await client.query(`UPDATE external_event_deliveries SET status='ACKED',
        lease_expires_at=NULL,acknowledged_at=now(),updated_at=now()
        WHERE integration_id=$1 AND store_id=$2 AND event_id=$3::bigint`,
      [identity.id,identity.storeId,eventId]);
      await client.query(`INSERT INTO external_event_acks(integration_id,event_id)
        VALUES($1,$2::bigint) ON CONFLICT DO NOTHING`,[identity.id,eventId]);
      await client.query('COMMIT');
      return {eventId,acknowledged:true,idempotent:false};
    } catch(e){await client.query('ROLLBACK');throw e;}
    finally{client.release();}
  });

  app.post('/v1/external/events/:eventId/nack', async req => {
    const identity=await requireIntegration(req,'events.read');
    assertLeasedDelivery(identity);
    const {eventId}=validated(eventParams,req.params);
    const {leaseToken:token,code,retryable}=validated(nackBody,req.body);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const lease=await client.query<{attempts:number}>(`SELECT attempts FROM external_event_deliveries
        WHERE integration_id=$1 AND store_id=$2 AND event_id=$3::bigint
          AND status='IN_FLIGHT' AND lease_token_hash=$4 AND lease_expires_at>now()
        FOR UPDATE`,[identity.id,identity.storeId,eventId,hashValue(token)]);
      if(!lease.rowCount) throw new ApiError(409,'Lease expirado, processado ou substituido.');
      const attempts=lease.rows[0].attempts;
      const failed=!retryable || attempts>=MAX_DELIVERY_ATTEMPTS;
      const nextAttemptInSeconds=failed?null:retryDelaySeconds(attempts);
      const status=failed?'DEAD':'PENDING';
      await client.query(`UPDATE external_event_deliveries SET status=$4,
        lease_token_hash=NULL,lease_expires_at=NULL,
        next_attempt_at=CASE WHEN $5::integer IS NULL THEN next_attempt_at
          ELSE now()+($5::integer*INTERVAL '1 second') END,
        last_error_code=$6,last_error_at=now(),updated_at=now()
        WHERE integration_id=$1 AND store_id=$2 AND event_id=$3::bigint`,
      [identity.id,identity.storeId,eventId,status,nextAttemptInSeconds,code]);
      await client.query('COMMIT');
      return {eventId,status,attempts,nextAttemptInSeconds};
    } catch(e){await client.query('ROLLBACK');throw e;}
    finally{client.release();}
  });
}
