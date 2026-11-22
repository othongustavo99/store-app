/**
 * Frequência40 Store App — Fase 5.19.
 * Dossiê comercial offline. Não conecta, transmite pedidos, grava no banco,
 * aprova implantação nem lê credenciais. Todos os estados são conservadores.
 */
import {createHash} from 'node:crypto';
import {assessProfile} from '../assessment/assessment.mjs';
import {validateReconciliationManifest,validateManualReceipt} from '../csv/order_reconcile.mjs';

export class CommercialRolloutError extends Error {
  constructor(code) {super(code);this.name='CommercialRolloutError';this.code=code;}
}
const fail=code=>{throw new CommercialRolloutError(code);};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys,code)=>{
  if(!obj(x)||Object.keys(x).some(k=>!keys.includes(k)))fail(code);
};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

export const CHECK_KEYS=Object.freeze([
  'scopeApproved', 'privacyReviewed', 'supplierProcedureReviewed',
  'recoveryPlanReviewed', 'pilotEvidenceReviewed', 'commercialReleaseReviewed',
]);
export const CHECK_LABELS=Object.freeze({
  scopeApproved:'Escopo e limites assinados/aceitos pelo cliente',
  privacyReviewed:'Proteção de dados e responsabilidades revisadas',
  supplierProcedureReviewed:'Procedimento autorizado do ERP/PDV revisado',
  recoveryPlanReviewed:'Plano de recuperação, contingência e reconciliação revisado',
  pilotEvidenceReviewed:'Resultado de piloto assistido e evidências revisados',
  commercialReleaseReviewed:'Decisão comercial revisada por responsável humano',
});
const ARTIFACT_KEYS=['exportCsv','exportManifest','erpReturnCsv','reconciliationReport'];
const statuses=['pending','confirmed'];
const isPath=x=>x===null||(typeof x==='string'&&x.length>0&&x.length<=180&&
  !x.includes('\\')&&!x.includes(':')&&!x.startsWith('/')&&!x.startsWith('.')&&
  x.split('/').every(k=>k!=='.'&&k!=='..'&&k.length>0)&&/^[\p{L}\p{N} ._/-]+$/u.test(x));

export function validateRolloutConfig(input){
  exact(input,['schemaVersion','assessment','binding','checklist','artifacts','manualCsvOrders'],'ROLLOUT_CONFIG_INVALID');
  if(input.schemaVersion!==1)fail('ROLLOUT_SCHEMA_INVALID');
  // Delegar toda a validação de provedor/escopo à auditoria conservadora F5.15.
  try {assessProfile(input.assessment);}
  catch {fail('ROLLOUT_ASSESSMENT_INVALID');}
  if(typeof input.manualCsvOrders!=='boolean'||(input.manualCsvOrders&&input.assessment.transport!=='csv'))
    fail('ROLLOUT_MANUAL_CSV_SCOPE_INVALID');
  exact(input.binding,['storeId','integrationId'],'ROLLOUT_BINDING_INVALID');
  if(!uuid(input.binding.storeId)||!uuid(input.binding.integrationId)||
     input.binding.storeId===input.binding.integrationId)fail('ROLLOUT_BINDING_INVALID');
  exact(input.checklist,CHECK_KEYS,'ROLLOUT_CHECKLIST_INVALID');
  if(CHECK_KEYS.some(k=>!statuses.includes(input.checklist[k])))fail('ROLLOUT_CHECKLIST_INVALID');
  exact(input.artifacts,ARTIFACT_KEYS,'ROLLOUT_ARTIFACTS_INVALID');
  if(ARTIFACT_KEYS.some(k=>!Object.hasOwn(input.artifacts,k)||!isPath(input.artifacts[k])))
    fail('ROLLOUT_ARTIFACTS_INVALID');
  const {exportCsv,exportManifest,erpReturnCsv,reconciliationReport}=input.artifacts;
  if(Boolean(exportCsv)!==Boolean(exportManifest))fail('ROLLOUT_EXPORT_PAIR_REQUIRED');
  if(reconciliationReport&&!exportCsv)fail('ROLLOUT_RECONCILIATION_WITHOUT_EXPORT');
  if(erpReturnCsv&&!exportCsv)fail('ROLLOUT_RETURN_WITHOUT_EXPORT');
  if(exportCsv){
    if(!exportCsv.toLowerCase().endsWith('.csv')||exportManifest!==`${exportCsv}.manifest.json`)
      fail('ROLLOUT_MANIFEST_FILENAME_INVALID');
  }
  if(erpReturnCsv&&!erpReturnCsv.toLowerCase().endsWith('.csv'))fail('ROLLOUT_RETURN_FILENAME_INVALID');
  if(reconciliationReport&&!reconciliationReport.toLowerCase().endsWith('.json'))
    fail('ROLLOUT_REPORT_FILENAME_INVALID');
  const all=ARTIFACT_KEYS.map(k=>input.artifacts[k]).filter(Boolean);
  if(new Set(all.map(x=>x.toLowerCase())).size!==all.length)fail('ROLLOUT_DUPLICATE_ARTIFACT_PATH');
  return input;
}

function safeReport(report,m) {
  if(!obj(report)||report.schema!==1||report.kind!=='F40_CSV_MANUAL_RECONCILIATION'||
    report.storeId!==m.storeId||report.integrationId!==m.integrationId||report.batchId!==m.batchId||
    report.exportSha256!==m.sha256||!sha(report.previewSha256)||
    !Array.isArray(report.decisions)||report.decisions.length!==m.orderIds.length||
    report.manualOnly!==true||report.externalApiVerified!==false||
    report.erpReceivedConfirmedByApi!==false||report.productionApproved!==false||
    report.reexportAuthorized!==false)fail('ROLLOUT_RECONCILIATION_INVALID');
  // Reaproveitar as verificações de referência única, itens, totais e isolamento F5.17.
  try {
    validateManualReceipt({schema:1,storeId:report.storeId,integrationId:report.integrationId,
      batchId:report.batchId,exportSha256:report.exportSha256,operatorAlias:report.operatorAlias,
      verifiedAt:report.verifiedAt,evidenceRef:report.evidenceRef,
      acknowledgement:'CONFIRMO_CONFERENCIA_NO_ERP',decisions:report.decisions},m);
  } catch {fail('ROLLOUT_RECONCILIATION_INVALID');}
  if(report.decisions.some((d,i)=>d.orderId!==m.orderIds[i]))fail('ROLLOUT_RECONCILIATION_ORDER_INVALID');
  const binding={schema:1,storeId:report.storeId,integrationId:report.integrationId,
    batchId:report.batchId,exportSha256:report.exportSha256,
    operatorAlias:report.operatorAlias,verifiedAt:report.verifiedAt,evidenceRef:report.evidenceRef,
    decisions:report.decisions};
  if(digest(JSON.stringify(binding))!==report.previewSha256)
    fail('ROLLOUT_RECONCILIATION_PREVIEW_CHANGED');
  const counts={reportedImported:0,reportedRejected:0,uncertain:0};
  for(const d of report.decisions){
    if(d.result==='IMPORTED')counts.reportedImported++;
    else if(d.result==='REJECTED')counts.reportedRejected++;
    else counts.uncertain++;
  }
  return counts;
}

/** Verifica comprovantes de um ÚNICO lote; sem confiar no status alegado pelo ERP. */
export function verifyCsvArtifacts(config,{exportBytes,manifest,erpReturnBytes=null,reconciliationReport=null}={}){
  validateRolloutConfig(config);
  const files=config.artifacts;
  if(!files.exportCsv){
    if(exportBytes!==undefined||manifest!==undefined||erpReturnBytes!==null||reconciliationReport!==null)
      fail('ROLLOUT_UNEXPECTED_ARTIFACTS');
    return {status:'NO_CSV_BATCH',exportSha256:null,orders:0,lines:0,
      reportedImported:0,reportedRejected:0,uncertain:0,
      erpReturnProvided:false,erpReturnSha256:null,externalApiVerified:false};
  }
  try{validateReconciliationManifest(manifest);}catch{fail('ROLLOUT_MANIFEST_INVALID');}
  if(config.binding.storeId!==manifest.storeId||config.binding.integrationId!==manifest.integrationId)
    fail('ROLLOUT_TENANT_MISMATCH');
  if(!Buffer.isBuffer(exportBytes)&&!(exportBytes instanceof Uint8Array))fail('ROLLOUT_CSV_INVALID');
  if(exportBytes.length<1||exportBytes.length>2_000_000||digest(exportBytes)!==manifest.sha256)
    fail('ROLLOUT_EXPORT_HASH_MISMATCH');
  const text=Buffer.from(exportBytes).toString('utf8');
  if(!text.endsWith('\r\n')||(text.match(/\r\n/g)||[]).length!==manifest.rows+1)
    fail('ROLLOUT_EXPORT_ROWS_INVALID');
  if(Boolean(files.erpReturnCsv)!==Boolean(erpReturnBytes))fail('ROLLOUT_RETURN_MISSING');
  if(erpReturnBytes!==null&&(!Buffer.isBuffer(erpReturnBytes)&&!(erpReturnBytes instanceof Uint8Array)||
      erpReturnBytes.length===0||erpReturnBytes.length>2_000_000))fail('ROLLOUT_RETURN_INVALID');
  if(Boolean(files.reconciliationReport)!==Boolean(reconciliationReport))fail('ROLLOUT_REPORT_MISSING');
  const counts=reconciliationReport?safeReport(reconciliationReport,manifest):
    {reportedImported:0,reportedRejected:0,uncertain:0};
  return {status:reconciliationReport?'MANUAL_REPORT_RECORDED':'CSV_FILE_PREPARED',
    exportSha256:manifest.sha256,batchId:manifest.batchId,
    orders:manifest.orderIds.length,lines:manifest.rows,
    ...counts,erpReturnProvided:erpReturnBytes!==null,
    erpReturnSha256:erpReturnBytes===null?null:digest(erpReturnBytes),externalApiVerified:false};
}

const requiredBeforePilot=['scopeApproved','privacyReviewed','supplierProcedureReviewed','recoveryPlanReviewed'];
export function evaluateCommercialRollout(input,artifacts){
  const config=validateRolloutConfig(input);
  const assessment=assessProfile(config.assessment);
  const batch=artifacts??verifyCsvArtifacts(config);
  const pending=CHECK_KEYS.filter(k=>config.checklist[k]!=='confirmed')
    .map(k=>({code:`CHECK_${k.toUpperCase()}`,message:CHECK_LABELS[k]}));
  const requiresCsvEvidence=config.manualCsvOrders;
  if(requiresCsvEvidence&&batch.status==='NO_CSV_BATCH')
    pending.push({code:'CSV_ORDER_EXPORT_NOT_DOCUMENTED',message:'Sem lote CSV de pedido para conferência manual.'});
  if(requiresCsvEvidence&&batch.status!=='MANUAL_REPORT_RECORDED')
    pending.push({code:'CSV_ORDER_RECONCILIATION_NOT_DOCUMENTED',message:'Sem comprovante de conciliação manual vinculado ao lote.'});
  if(batch.status==='MANUAL_REPORT_RECORDED'&&(batch.uncertain>0||batch.reportedRejected>0))
    pending.push({code:'CSV_ORDERS_REQUIRE_REVIEW',message:'Lote tem pedidos incertos ou rejeitados; revisar antes de avançar.'});
  const pilotEligible=['READY_FOR_ASSISTED_PILOT','MANUAL_PRODUCTION_REVIEW'].includes(assessment.verdict)&&
    requiredBeforePilot.every(k=>config.checklist[k]==='confirmed');
  const reviewEligible=assessment.verdict==='MANUAL_PRODUCTION_REVIEW'&&
    CHECK_KEYS.every(k=>config.checklist[k]==='confirmed')&&
    (!requiresCsvEvidence||(batch.status==='MANUAL_REPORT_RECORDED'&&
      batch.uncertain===0&&batch.reportedRejected===0));
  let verdict;
  if(assessment.summary.hardBlockers>0)verdict='SCOPE_BLOCKED';
  else if(assessment.verdict==='DISCOVERY_PENDING')verdict='DISCOVERY_PENDING';
  else if(reviewEligible)verdict='HUMAN_RELEASE_REVIEW_REQUIRED';
  else if(pilotEligible)verdict='ASSISTED_PILOT_ELIGIBLE';
  else verdict='PREPARATION_PENDING';
  return {schemaVersion:1,kind:'F40_COMMERCIAL_DEPLOYMENT_DOSSIER',
    storeAlias:assessment.storeAlias,provider:assessment.provider,transport:assessment.transport,
    verdict,productionAuthorized:false,activationPerformed:false,
    pilotEligible,reviewEligible,
    assessment:{verdict:assessment.verdict,approach:assessment.approach,
      hardBlockers:assessment.hardBlockers,pendingChecks:assessment.pendingChecks,
      notices:assessment.notices},
    checklist:{pending,completed:CHECK_KEYS.filter(k=>config.checklist[k]==='confirmed'),
      total:CHECK_KEYS.length},
    csvEvidence:batch,
    nextActions:[
      ...assessment.hardBlockers.map(x=>({code:x.code,message:x.message})),
      ...assessment.pendingChecks.map(x=>({code:x.code,message:x.message})),
      ...pending,
      ...(reviewEligible? [{code:'HUMAN_APPROVAL_REQUIRED',message:'Aprovação formal e homologação real continuam obrigatórias; nenhum botão é ativado pelo dossiê.'}]:[]),
    ],
    limitations:'Parecer offline baseado em declarações e arquivos locais. Não verifica a API do ERP, não comprova pagamentos, não emite documentos fiscais, não envia pedidos e não autoriza produção.',
  };
}

export function rolloutMarkdown(r){
  const escape=x=>String(x).replace(/[\\`*_[\]<>]/g,'');
  const bullet=(items,none)=>items.length?items.map(x=>`- **${escape(x.code)}** — ${escape(x.message)}`):[`- ${none}`];
  return [
    '# Frequência40 — Dossiê de implantação ERP/PDV', '',
    `- Loja: \`${escape(r.storeAlias)}\``,
    `- Provedor: ${escape(r.provider)}`,
    `- Transporte: ${escape(r.transport)}`,
    `- Resultado: **${r.verdict}**`,
    '- Produção autorizada: **NÃO**',
    '', '## Avaliação técnica',
    `- Parecer anterior: ${r.assessment.verdict}`,
    ...bullet(r.assessment.hardBlockers,'Sem bloqueios de escopo identificados'),
    '', '## Checklist operacional',
    `- Confirmados: ${r.checklist.completed.length}/${r.checklist.total}`,
    ...bullet(r.checklist.pending,'Nenhuma pendência declarada'),
    '', '## Lote CSV (se houver)',
    `- Estado: ${r.csvEvidence.status}`,
    `- Pedidos: ${r.csvEvidence.orders}`,
    `- Relatados como importados: ${r.csvEvidence.reportedImported}`,
    `- Rejeitados: ${r.csvEvidence.reportedRejected}`,
    `- Incertos: ${r.csvEvidence.uncertain}`,
    '- Aceite comprovado por API: **NÃO**',
    '', '## Próximos passos',
    ...bullet(r.nextActions,'Revisão humana e homologação real continuam obrigatórias'),
    '', `**Limite:** ${r.limitations}`, '',
  ].join('\n');
}
