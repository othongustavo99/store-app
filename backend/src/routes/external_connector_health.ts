import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireStoreRole } from '../security/identity.js';
import { uuidParam, validated } from '../security/validation.js';
import { assertIntegrationsEnabled, requireIntegration } from '../integrations/core.js';
import { connectorStatus, type ConnectorResult } from '../services/external_connector_health.js';

const params = z.object({storeId: uuidParam, integrationId: uuidParam}).strict();
const summaryFields = z.number().int().min(0).max(10000);
const reportBody = z.object({
  component: z.literal('ORDERS'),
  result: z.enum(['OK', 'WARNING', 'ERROR']),
  errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,47}$/).optional(),
  summary: z.object({
    claimed: summaryFields,
    acknowledged: summaryFields,
    review: summaryFields,
    retry: summaryFields,
    ackErrors: summaryFields,
  }).strict().optional(),
}).strict().superRefine((body,ctx) => {
  if (body.result === 'ERROR' && !body.errorCode)
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ['errorCode'], message: 'Codigo de erro obrigatorio.'});
  if (body.result === 'OK' && body.errorCode)
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ['errorCode'], message: 'Ciclo OK nao aceita erro.'});
});

type HealthRow = {
  revokedAt: Date | null;
  lastResult: ConnectorResult | null;
  lastReportAt: Date | null;
  lastOkAt: Date | null;
  lastErrorCode: string | null;
  lastSummary: Record<string,number> | null;
};

export async function externalConnectorHealthRoutes(app: FastifyInstance): Promise<void> {
  // Credencial da integracao: nao recebe storeId nem integrationId do cliente.
  // Relatorio enxuto; sem URL, tokens, resposta do ERP, nome ou CPF de comprador.
  app.post('/v1/external/health/report', {config: {rateLimit: {max: 30, timeWindow: '1 minute'}}}, async req => {
    const identity = await requireIntegration(req, 'events.read');
    const body = validated(reportBody, req.body);
    const row = await pool.query(`INSERT INTO external_connector_health
      (integration_id,store_id,component,last_result,last_error_code,last_summary,last_report_at,last_ok_at)
      SELECT id,store_id,$3,$4,$5,$6::jsonb,now(),CASE WHEN $4='OK' THEN now() ELSE NULL END
      FROM external_integrations WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL
      ON CONFLICT(integration_id,component) DO UPDATE SET
        last_result=EXCLUDED.last_result,
        last_error_code=EXCLUDED.last_error_code,
        last_summary=EXCLUDED.last_summary,
        last_report_at=now(),
        last_ok_at=CASE WHEN EXCLUDED.last_result='OK' THEN now()
          ELSE external_connector_health.last_ok_at END
      RETURNING last_report_at AS "reportedAt"`,
    [identity.id, identity.storeId, body.component, body.result, body.errorCode ?? null,
      JSON.stringify(body.summary ?? {})]);
    if (!row.rowCount) throw new ApiError(403, 'Integracao revogada.');
    return { recorded: true, reportedAt: row.rows[0].reportedAt };
  });

  // Diagnostico exclusivo da loja proprietaria, incluindo integracoes sem heartbeat.
  app.get('/v1/stores/:storeId/integrations/:integrationId/health', async req => {
    assertIntegrationsEnabled();
    const {storeId,integrationId} = validated(params,req.params);
    await requireStoreRole(req,storeId,['OWNER']);
    const record = await pool.query<HealthRow>(`SELECT i.revoked_at AS "revokedAt",
      h.last_result AS "lastResult",h.last_report_at AS "lastReportAt",
      h.last_ok_at AS "lastOkAt",h.last_error_code AS "lastErrorCode",
      h.last_summary AS "lastSummary"
      FROM external_integrations i LEFT JOIN external_connector_health h
        ON h.integration_id=i.id AND h.store_id=i.store_id AND h.component='ORDERS'
      WHERE i.id=$1 AND i.store_id=$2`, [integrationId,storeId]);
    if (!record.rowCount) throw new ApiError(404,'Integracao nao encontrada nesta loja.');
    const r=record.rows[0];
    const report=r.lastResult && r.lastReportAt
      ? {lastResult:r.lastResult,lastReportAt:r.lastReportAt} : null;
    return {component:'ORDERS',status:connectorStatus(report,!!r.revokedAt),
      staleAfterSeconds:180,lastResult:r.lastResult,lastReportAt:r.lastReportAt,
      lastOkAt:r.lastOkAt,lastErrorCode:r.lastErrorCode,lastSummary:r.lastSummary};
  });
}
