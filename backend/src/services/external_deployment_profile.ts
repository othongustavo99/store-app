/**
 * F5.11: checklist de implantação por cliente, informativo e não operacional.
 * Sem armazenamento de segredos, dados pessoais ou campos livres.
 */
export type DeploymentEnvironment = 'HOMOLOGATION' | 'PRODUCTION';
export type DeploymentChecks = {
  credentialsSecured: boolean;
  providerAccessChecked: boolean;
  catalogChecked: boolean;
  ordersChecked: boolean;
  reconciliationChecked: boolean;
};
export type DeploymentRow = DeploymentChecks & {
  environment: DeploymentEnvironment;
  workerAlias: string | null;
  revision: number;
  updatedAt: Date | string;
};
export const emptyDeploymentChecks: DeploymentChecks = {
  credentialsSecured: false,
  providerAccessChecked: false,
  catalogChecked: false,
  ordersChecked: false,
  reconciliationChecked: false,
};
export function deploymentView(
  provider: string, revoked: boolean, row?: DeploymentRow,
) {
  const checks = row ? {
    credentialsSecured: row.credentialsSecured,
    providerAccessChecked: row.providerAccessChecked,
    catalogChecked: row.catalogChecked,
    ordersChecked: row.ordersChecked,
    reconciliationChecked: row.reconciliationChecked,
  } : { ...emptyDeploymentChecks };
  const completed = Object.values(checks).filter(Boolean).length;
  return {
    provider,
    revoked,
    hasProfile: Boolean(row),
    revision: row?.revision ?? 0,
    environment: row?.environment ?? 'HOMOLOGATION',
    workerAlias: row?.workerAlias ?? null,
    checks,
    completed,
    total: 5,
    setupStatus: revoked ? 'REVOKED' : completed === 5 ? 'CHECKLIST_REPORTED' : 'PENDING',
    updatedAt: row?.updatedAt ?? null,
    note: 'Checklist preenchido pelo operador. Nao testa conexao com ERP, nao comprova homologacao e nao ativa sincronizacao.',
  };
}
