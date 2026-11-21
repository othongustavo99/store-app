/**
 * F5.10 - Preflight *operacional* por loja/integracao.
 * Nao testa o ERP externo e nao constitui homologacao comercial ou fiscal.
 */
import { connectorStatus, type ConnectorResult } from './external_connector_health.js';

export type ReadinessCheck = {
  code: string;
  ok: boolean;
  detail: string;
};

export type ReadinessInput = {
  revokedAt: Date | null;
  provider: string;
  scopes: string[];
  deliveryMode: string;
  orderAuthority: boolean;
  activeVariants: number;
  mappedVariants: number;
  deadEvents: number;
  lastResult: ConnectorResult | null;
  lastReportAt: Date | null;
};

export function evaluateIntegrationReadiness(input: ReadinessInput, now = Date.now()) {
  // A verificacao e deliberadamente conservadora: todos os checks sao exigidos
  // para preparar exportacao automatica de pedidos. Catalogo isolado pode usar
  // subconjunto deles, mas nao deve ser apresentado como pronto para pedidos.
  const recent = connectorStatus(input.lastReportAt && input.lastResult
    ? { lastResult: input.lastResult, lastReportAt: input.lastReportAt }
    : null, !!input.revokedAt, now);
  const checks: ReadinessCheck[] = [
    { code: 'ACTIVE', ok: !input.revokedAt, detail: input.revokedAt
      ? 'Credencial revogada. Crie uma nova integracao.' : 'Credencial ativa nesta loja.' },
    { code: 'ORDER_PERMISSIONS',
      ok: ['orders.read','events.read','orders.customer.read','orders.write']
        .every(scope => input.scopes.includes(scope)) && input.orderAuthority,
      detail: 'Pedidos exigem leitura, eventos, acesso autorizado a dados do comprador e autoridade de atualizacao.' },
    { code: 'LEASED_QUEUE', ok: input.deliveryMode === 'LEASED',
      detail: 'A entrega por lease deve ser habilitada pelo proprietario para exportacao continua.' },
    { code: 'CATALOG_MAPPED',
      ok: input.activeVariants > 0 && input.activeVariants === input.mappedVariants,
      detail: `${input.mappedVariants} de ${input.activeVariants} variantes ativas vinculadas ao ERP.` },
    { code: 'NO_DEAD_EVENTS', ok: input.deadEvents === 0,
      detail: `${input.deadEvents} evento(s) em falha definitiva na fila desta integracao.` },
    { code: 'WORKER_REPORTING', ok: recent === 'REPORTING',
      detail: `Ultimo relatorio do worker: ${recent}. Nao comprova disponibilidade do ERP.` },
  ];
  return {
    provider: input.provider,
    status: checks.every(c => c.ok) ? 'CHECKLIST_OK' : 'NEEDS_ACTION',
    homologated: false,
    scope: 'ORDER_EXPORT',
    message: 'Diagnostico local. Requer testes reais do ERP, estoque, pedidos e fiscal antes da ativacao comercial.',
    counts: { activeVariants: input.activeVariants, mappedVariants: input.mappedVariants,
      unmappedVariants: Math.max(0, input.activeVariants - input.mappedVariants),
      deadEvents: input.deadEvents },
    checks,
  };
}
