// A presenca de um heartbeat demonstra somente que o worker conseguiu
// registrar seu ultimo ciclo no Store App. Nao valida conectividade com o ERP.
export const CONNECTOR_STALE_MS = 180_000;
export type ConnectorResult = 'OK' | 'WARNING' | 'ERROR';
export type ConnectorStatus = 'NO_REPORT' | 'REPORTING' | 'ATTENTION' | 'STALE' | 'REVOKED';

export function connectorStatus(report: {
  lastResult: ConnectorResult; lastReportAt: Date | string;
} | null, revoked: boolean, now = Date.now()): ConnectorStatus {
  if (revoked) return 'REVOKED';
  if (!report) return 'NO_REPORT';
  const at = new Date(report.lastReportAt).getTime();
  if (!Number.isFinite(at) || at > now + 30_000 || now - at > CONNECTOR_STALE_MS)
    return 'STALE';
  return report.lastResult === 'OK' ? 'REPORTING' : 'ATTENTION';
}
