import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireStoreRole } from '../security/identity.js';
import { uuidParam, validated } from '../security/validation.js';
import { assertIntegrationsEnabled } from '../integrations/core.js';
import { evaluateIntegrationReadiness, type ReadinessInput } from '../services/external_integration_readiness.js';

const params = z.object({storeId: uuidParam, integrationId: uuidParam}).strict();

type IntegrationRow = {
  revokedAt: Date | null;
  provider: string;
  scopes: string[];
  deliveryMode: string;
  orderAuthority: boolean;
};

export async function externalIntegrationReadinessRoutes(app: FastifyInstance): Promise<void> {
  // Apenas OWNER. As queries sempre filtram tanto store_id quanto integration_id.
  // Nenhuma credencial, payload fiscal ou dado pessoal e retornado.
  app.get('/v1/stores/:storeId/integrations/:integrationId/readiness', async req => {
    assertIntegrationsEnabled();
    const {storeId,integrationId} = validated(params, req.params);
    await requireStoreRole(req, storeId, ['OWNER']);

    const integration = await pool.query<IntegrationRow>(`SELECT provider,scopes,
      revoked_at AS "revokedAt",delivery_mode AS "deliveryMode",
      order_authority AS "orderAuthority"
      FROM external_integrations WHERE id=$1 AND store_id=$2`, [integrationId,storeId]);
    if (!integration.rowCount) throw new ApiError(404,'Integracao nao encontrada nesta loja.');

    const [mapped,dead,health] = await Promise.all([
      pool.query<{activeVariants:number;mappedVariants:number}>(`SELECT
        count(v.id)::int AS "activeVariants",count(m.variant_id)::int AS "mappedVariants"
        FROM product_variants v
        JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
        LEFT JOIN external_variant_mappings m ON m.integration_id=$1
          AND m.store_id=v.store_id AND m.variant_id=v.id
        WHERE v.store_id=$2 AND v.status='ACTIVE' AND p.status <> 'ARCHIVED'`, [integrationId,storeId]),
      pool.query<{deadEvents:number}>(`SELECT count(*)::int AS "deadEvents"
        FROM external_event_deliveries
        WHERE integration_id=$1 AND store_id=$2 AND status='DEAD'`, [integrationId,storeId]),
      pool.query<{lastResult:'OK'|'WARNING'|'ERROR';lastReportAt:Date}>(`
        SELECT last_result AS "lastResult",last_report_at AS "lastReportAt"
        FROM external_connector_health
        WHERE integration_id=$1 AND store_id=$2 AND component='ORDERS'`, [integrationId,storeId]),
    ]);
    const source = integration.rows[0];
    const report = health.rows[0];
    const input: ReadinessInput = {
      ...source,
      activeVariants: mapped.rows[0]?.activeVariants ?? 0,
      mappedVariants: mapped.rows[0]?.mappedVariants ?? 0,
      deadEvents: dead.rows[0]?.deadEvents ?? 0,
      lastResult: report?.lastResult ?? null,
      lastReportAt: report?.lastReportAt ?? null,
    };
    return evaluateIntegrationReadiness(input);
  });
}
