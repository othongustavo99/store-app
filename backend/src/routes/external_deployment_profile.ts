import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireStoreRole } from '../security/identity.js';
import { uuidParam, validated } from '../security/validation.js';
import { assertIntegrationsEnabled } from '../integrations/core.js';
import { deploymentView, type DeploymentRow } from '../services/external_deployment_profile.js';

const paramsSchema = z.object({storeId:uuidParam,integrationId:uuidParam}).strict();
const checksSchema = z.object({
  credentialsSecured:z.boolean(), providerAccessChecked:z.boolean(),
  catalogChecked:z.boolean(), ordersChecked:z.boolean(),
  reconciliationChecked:z.boolean(),
}).strict();
const payloadSchema = z.object({
  expectedRevision:z.number().int().min(0).max(2147483646),
  environment:z.enum(['HOMOLOGATION','PRODUCTION']),
  workerAlias:z.string().regex(/^[a-z0-9][a-z0-9-]{2,47}$/).nullable(),
  checks:checksSchema,
}).strict();

type IntegrationRow = {provider:string;revokedAt:Date|null};
async function integrationForStore(integrationId:string,storeId:string):Promise<IntegrationRow> {
  const result=await pool.query<IntegrationRow>(`
    SELECT provider,revoked_at AS "revokedAt" FROM external_integrations
    WHERE id=$1 AND store_id=$2`,[integrationId,storeId]);
  if(!result.rowCount) throw new ApiError(404,'Integracao nao encontrada nesta loja.');
  return result.rows[0];
}

export async function externalDeploymentProfileRoutes(app:FastifyInstance):Promise<void> {
  app.get('/v1/stores/:storeId/integrations/:integrationId/deployment',async req=>{
    assertIntegrationsEnabled();
    const {storeId,integrationId}=validated(paramsSchema,req.params);
    await requireStoreRole(req,storeId,['OWNER']);
    const integration=await integrationForStore(integrationId,storeId);
    const stored=await pool.query<DeploymentRow>(`SELECT environment,worker_alias AS "workerAlias",
      credentials_secured AS "credentialsSecured",provider_access_checked AS "providerAccessChecked",
      catalog_checked AS "catalogChecked",orders_checked AS "ordersChecked",
      reconciliation_checked AS "reconciliationChecked", revision,updated_at AS "updatedAt"
      FROM external_integration_deployments WHERE store_id=$1 AND integration_id=$2`,[storeId,integrationId]);
    return deploymentView(integration.provider,Boolean(integration.revokedAt),stored.rows[0]);
  });

  app.put('/v1/stores/:storeId/integrations/:integrationId/deployment',async req=>{
    assertIntegrationsEnabled();
    const {storeId,integrationId}=validated(paramsSchema,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER']);
    const body=validated(payloadSchema,req.body);
    const integration=await integrationForStore(integrationId,storeId);
    if(integration.revokedAt) throw new ApiError(409,'Integracao revogada: nao e permitido configurar implantacao.');
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      // Controle de revisao atomico: uma edicao atrasada nao sobrescreve a recente.
      // O CTE so insere na primeira gravacao quando expectedRevision=0.
      const saved=await client.query<DeploymentRow>(`
        WITH permitted AS (
          SELECT i.id FROM external_integrations i
          LEFT JOIN external_integration_deployments d
            ON d.integration_id=i.id AND d.store_id=i.store_id
          WHERE i.id=$1 AND i.store_id=$2 AND i.revoked_at IS NULL
            AND COALESCE(d.revision,0)=$3
        )
        INSERT INTO external_integration_deployments (
          integration_id,store_id,environment,worker_alias,
          credentials_secured,provider_access_checked,catalog_checked,
          orders_checked,reconciliation_checked,revision,updated_by
        )
        SELECT $1,$2,$4,$5,$6,$7,$8,$9,$10,$3+1,$11 FROM permitted WHERE TRUE
        ON CONFLICT(store_id,integration_id) DO UPDATE SET
          environment=EXCLUDED.environment,worker_alias=EXCLUDED.worker_alias,
          credentials_secured=EXCLUDED.credentials_secured,
          provider_access_checked=EXCLUDED.provider_access_checked,
          catalog_checked=EXCLUDED.catalog_checked,
          orders_checked=EXCLUDED.orders_checked,
          reconciliation_checked=EXCLUDED.reconciliation_checked,
          revision=external_integration_deployments.revision+1,
          updated_at=now(),updated_by=EXCLUDED.updated_by
        WHERE external_integration_deployments.revision=$3
        RETURNING environment,worker_alias AS "workerAlias",credentials_secured AS "credentialsSecured",
          provider_access_checked AS "providerAccessChecked",catalog_checked AS "catalogChecked",
          orders_checked AS "ordersChecked",reconciliation_checked AS "reconciliationChecked",
          revision,updated_at AS "updatedAt"`,
      [integrationId,storeId,body.expectedRevision,body.environment,body.workerAlias,
        body.checks.credentialsSecured,body.checks.providerAccessChecked,
        body.checks.catalogChecked,body.checks.ordersChecked,body.checks.reconciliationChecked,
        identity.userId]);
      if(!saved.rowCount) throw new ApiError(409,'Configuracao foi alterada ou integracao revogada. Recarregue antes de salvar.');
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
        VALUES($1,$2,'INTEGRATION_DEPLOYMENT_UPDATED','external_integration',$3,$4::jsonb)`,
        [storeId,identity.userId,integrationId,
          JSON.stringify({environment:body.environment,revision:saved.rows[0].revision,
            completed:Object.values(body.checks).filter(Boolean).length})]);
      await client.query('COMMIT');
      return deploymentView(integration.provider,false,saved.rows[0]);
    }catch(e){await client.query('ROLLBACK');throw e;}
    finally{client.release();}
  });
}
