/**
 * F5.12 — consolidação somente de leitura para preparar homologação assistida.
 * Nunca autoriza produção, liga workers ou certifica ERP/PDV ou emissão fiscal.
 */
import type { ReadinessInput } from './external_integration_readiness.js';
import { evaluateIntegrationReadiness } from './external_integration_readiness.js';
import { deploymentView, type DeploymentRow } from './external_deployment_profile.js';

export type GoLiveInput = {
  technical: ReadinessInput;
  deployment?: DeploymentRow;
};

type Check = {code:string;ok:boolean;detail:string};
const manualChecks = [
  ['credentialsSecured','CREDENTIALS_PROTECTED','O responsável confirmou armazenamento seguro das credenciais.'],
  ['providerAccessChecked','PROVIDER_ACCESS','Acesso e autorização do fornecedor conferidos manualmente.'],
  ['catalogChecked','CATALOG_TESTS','Catálogo e estoque conferidos no ambiente real de teste.'],
  ['ordersChecked','ORDER_TESTS','Envio e identificação de pedidos conferidos.'],
  ['reconciliationChecked','RECONCILIATION_TESTS','Falhas, reenvios e conciliação conferidos.'],
] as const;

export function evaluateGoLivePreflight(input:GoLiveInput, at=Date.now()) {
  const technical=evaluateIntegrationReadiness(input.technical,at);
  const deployment=deploymentView(input.technical.provider,Boolean(input.technical.revokedAt),input.deployment);
  const checks:Check[] = [
    ...technical.checks.map(c=>({...c,code:`TECH_${c.code}`})),
    {code:'DEPLOYMENT_PROFILE',ok:deployment.hasProfile,
      detail:'Cadastre o perfil de implantação da integração nesta loja.'},
    {code:'HOMOLOGATION_ENVIRONMENT',ok:deployment.hasProfile && deployment.environment==='HOMOLOGATION',
      detail:'Realize a pré-homologação com o perfil no ambiente HOMOLOGATION.'},
    {code:'WORKER_ALIAS',ok:deployment.hasProfile && Boolean(deployment.workerAlias),
      detail:'Identifique o worker do cliente no perfil de implantação.'},
    ...manualChecks.map(([key,code,detail])=>({
      code,ok:deployment.hasProfile && deployment.checks[key],detail,
    })),
  ];
  const pending=checks.filter(c=>!c.ok);
  const ready=pending.length===0;
  return {
    provider:input.technical.provider,
    status: ready ? 'READY_FOR_SUPERVISED_VALIDATION' : 'NEEDS_ACTION',
    checkedAt:new Date(at).toISOString(),
    checks,
    summary:{passed:checks.length-pending.length,total:checks.length,pending:pending.length},
    pendingCodes:pending.map(c=>c.code),
    counts:technical.counts,
    deploymentRevision:deployment.revision,
    homologated:false,
    productionApproved:false,
    automationEnabledByThisCheck:false,
    manualValidationRequired:true,
    note:ready
      ? 'Pré-requisitos declarados e diagnósticos internos atendidos. Executar teste assistido com ERP real, documentos fiscais e responsável antes de qualquer ativação.'
      : 'Existem pendências de configuração ou evidência. Este diagnóstico não substitui testes reais com o ERP.',
  };
}
