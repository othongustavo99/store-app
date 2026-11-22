import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CommercialRolloutError,validateRolloutConfig,verifyCsvArtifacts,
  evaluateCommercialRollout,rolloutMarkdown} from '../rollout.mjs';
import {prepareOrderExport} from '../../csv/order_export.mjs';
import {prepareManualReconciliation,createManualReconciliationReport} from '../../csv/order_reconcile.mjs';
const example=JSON.parse(await readFile(new URL('../deployment.example.json',import.meta.url),'utf8'));
const orders=JSON.parse(await readFile(new URL('../../csv/orders.example.json',import.meta.url),'utf8'));
const clone=x=>structuredClone(x);
const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
const error=code=>e=>e instanceof CommercialRolloutError&&e.code===code;
const apiMock=()=>({});
function confirmed({pilot=true}={}){
  const p=clone(example);
  for(const k of Object.keys(p.assessment.vendorCapabilities))p.assessment.vendorCapabilities[k]='confirmed';
  for(const k of Object.keys(p.assessment.evidence))p.assessment.evidence[k]='confirmed';
  if(!pilot)p.assessment.evidence.pilotReconciled='unconfirmed';
  for(const k of Object.keys(p.checklist))p.checklist[k]='confirmed';
  return p;
}
function csvFixture({withReport=true,withReturn=false}={}){
  const config=confirmed();
  config.assessment.transport='csv';config.assessment.provider='other';
  config.manualCsvOrders=true;
  config.assessment.requiredFlows=['catalog_import','stock_import'];
  config.assessment.operation.variants=false;
  config.binding.storeId=orders.settings.storeId;
  config.binding.integrationId=orders.settings.integrationId;
  config.artifacts.exportCsv='evidencias/lote.csv';
  config.artifacts.exportManifest='evidencias/lote.csv.manifest.json';
  if(withReport)config.artifacts.reconciliationReport='evidencias/reconciliacao.json';
  if(withReturn)config.artifacts.erpReturnCsv='evidencias/erp.csv';
  const plan=prepareOrderExport(orders.snapshots,orders.settings);
  const now='2026-11-22T20:20:00.000Z';
  const createdAt='2026-11-22T20:00:00.000Z';
  const batchId='99999999-9999-4999-8999-999999999999';
  const manifest={schema:1,batchId,storeId:config.binding.storeId,
    integrationId:config.binding.integrationId,orderIds:plan.orderIds,
    createdAt,sha256:plan.sha256,rows:plan.summary.lines,
    erpReceived:false,erpOrderCreated:false,note:'Manual, nao comprova aceite'};
  const state={schema:1,provider:'csv-orders',storeId:config.binding.storeId,
    integrationId:config.binding.integrationId,
    orders:Object.fromEntries(plan.orderIds.map(id=>[id,{stage:'FILE_CREATED',batchId,
      sha256:plan.sha256,createdAt}]))};
  const receipt={schema:1,storeId:config.binding.storeId,integrationId:config.binding.integrationId,
    batchId,exportSha256:plan.sha256,operatorAlias:'operador_demo',verifiedAt:now,
    evidenceRef:'PROTOCOLO-TESTE-001',acknowledgement:'CONFIRMO_CONFERENCIA_NO_ERP',
    decisions:plan.orderIds.map(id=>({orderId:id,result:'IMPORTED',externalOrderId:'ERP-001',
      checks:{reference:true,items:true,total:true}}))};
  const prepared=prepareManualReconciliation({manifest,csvBytes:Buffer.from(plan.contents),
    state,receipt,now:new Date('2026-11-22T20:30:00.000Z')});
  const report=createManualReconciliationReport(prepared,{recordedAt:'2026-11-22T20:30:00.000Z'});
  const sources={exportBytes:Buffer.from(plan.contents),manifest,
    erpReturnBytes:withReturn?Buffer.from('status;id\nOK;1\n'):null,
    reconciliationReport:withReport?report:null};
  return {config,sources};
}
function verify(f){return verifyCsvArtifacts(f.config,f.sources);}
const result=x=>evaluateCommercialRollout(x.config,verify(x));
const nodeCli=(args,env={})=>spawnSync(process.execPath,[cli,...args],{
  encoding:'utf8',env:{...process.env,...env},timeout:10000});
async function directory(fn){const d=await mkdtemp(join(tmpdir(),'f40-commercial-'));
  try{return await fn(d);}finally{await rm(d,{recursive:true,force:true});}}
async function fixtureOnDisk(d,f){
  const path=join(d,'plano.json');
  const {mkdir}=await import('node:fs/promises');
  await mkdir(join(d,'evidencias'),{recursive:true});
  await writeFile(path,JSON.stringify(f.config));
  if(f.config.artifacts.exportCsv){
    await writeFile(join(d,f.config.artifacts.exportCsv),f.sources.exportBytes);
    await writeFile(join(d,f.config.artifacts.exportManifest),JSON.stringify(f.sources.manifest));
  }
  if(f.config.artifacts.erpReturnCsv)await writeFile(join(d,f.config.artifacts.erpReturnCsv),f.sources.erpReturnBytes);
  if(f.config.artifacts.reconciliationReport)await writeFile(join(d,f.config.artifacts.reconciliationReport),JSON.stringify(f.sources.reconciliationReport));
  return path;
}

test('01 exemplo isolado válido sem token',()=>{
  assert.equal(validateRolloutConfig(example).schemaVersion,1);
  assert.doesNotMatch(JSON.stringify(example),/secret|password|accessToken/);
});
test('02 exemplo permanece pendente sem autorização',()=>{
  const r=evaluateCommercialRollout(example);
  assert.equal(r.verdict,'DISCOVERY_PENDING');assert.equal(r.productionAuthorized,false);
  assert.equal(r.activationPerformed,false);
});
test('03 campo extra ou segredo rejeitado no plano',()=>{
  const a=clone(example);a.apiKey='segredo';assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_CONFIG_INVALID'));
});
test('04 campo extra ou segredo no checklist rejeitado',()=>{
  const a=clone(example);a.checklist.token='segredo';assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_CHECKLIST_INVALID'));
});
test('05 campo extra na configuração de artefatos é rejeitado',()=>{
  const a=clone(example);a.artifacts.password='xx';assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_ARTIFACTS_INVALID'));
});
test('06 schema diferente é rejeitado',()=>{
  const a=clone(example);a.schemaVersion=2;assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_SCHEMA_INVALID'));
});
test('07 checksum exige UUID válido por loja',()=>{
  const a=clone(example);a.binding.storeId='outro';assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_BINDING_INVALID'));
});
test('08 vincular credencial à mesma ID da loja não é aceito',()=>{
  const a=clone(example);a.binding.integrationId=a.binding.storeId;
  assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_BINDING_INVALID'));
});
test('09 não aceita código de checklist inventado',()=>{
  const a=clone(example);a.checklist.scopeApproved='approved';
  assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_CHECKLIST_INVALID'));
});
test('10 mantém a validação de fornecedor da fase 5.15',()=>{
  const a=clone(example);a.assessment.provider='um_erp_aleatorio';
  assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_ASSESSMENT_INVALID'));
});
test('11 CSV e manifesto devem aparecer como um par',()=>{
  const a=clone(example);a.artifacts.exportCsv='lote.csv';
  assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_EXPORT_PAIR_REQUIRED'));
});
test('12 manifesto deve acompanhar exatamente o nome do CSV',()=>{
  const a=clone(example);a.artifacts.exportCsv='lote.csv';a.artifacts.exportManifest='outro.manifest.json';
  assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_MANIFEST_FILENAME_INVALID'));
});
test('13 retorno sem exportação é rejeitado',()=>{
  const a=clone(example);a.artifacts.erpReturnCsv='resposta.csv';
  assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_RETURN_WITHOUT_EXPORT'));
});
test('14 relatório sem exportação é rejeitado',()=>{
  const a=clone(example);a.artifacts.reconciliationReport='relatorio.json';
  assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_RECONCILIATION_WITHOUT_EXPORT'));
});
test('15 path absoluto e traversal não são aceitos no plano',()=>{
  for(const value of ['/home/oai/arquivo.csv','../outro.csv','C:\\dados\\lote.csv']){
    const a=clone(example);a.artifacts.exportCsv=value;a.artifacts.exportManifest=value+'.manifest.json';
    assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_ARTIFACTS_INVALID'));
  }
});
test('16 nomes de arquivos duplicados não são aceitos',()=>{
  const a=clone(example);a.artifacts.exportCsv='dados.csv';a.artifacts.exportManifest='dados.csv.manifest.json';
  a.artifacts.erpReturnCsv='dados.csv';
  assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_DUPLICATE_ARTIFACT_PATH'));
});
test('17 nenhuma evidência gera lote vazio, sem dados artificiais',()=>{
  const v=verifyCsvArtifacts(example);assert.equal(v.status,'NO_CSV_BATCH');assert.equal(v.orders,0);
});
test('18 lote CSV legítimo pode ser inspecionado offline',()=>{
  const f=csvFixture({withReport:false});const a=verify(f);
  assert.equal(a.status,'CSV_FILE_PREPARED');assert.equal(a.orders,1);
  assert.equal(a.externalApiVerified,false);
});
test('19 checksum do arquivo exportado detecta adulteração',()=>{
  const f=csvFixture();f.sources.exportBytes=Buffer.from('alterado');
  assert.throws(()=>verify(f),error('ROLLOUT_EXPORT_HASH_MISMATCH'));
});
test('20 reporte de outra loja é rejeitado',()=>{
  const f=csvFixture();f.config.binding.storeId='22222222-2222-4222-8222-222222222222';
  assert.throws(()=>verify(f),error('ROLLOUT_TENANT_MISMATCH'));
});
test('21 outro identificador de integração é rejeitado',()=>{
  const f=csvFixture();f.config.binding.integrationId='22222222-2222-4222-8222-222222222222';
  assert.throws(()=>verify(f),error('ROLLOUT_TENANT_MISMATCH'));
});
test('22 linhas divergentes no manifesto não são aceitas',()=>{
  const f=csvFixture();f.sources.manifest.rows+=1;
  assert.throws(()=>verify(f),error('ROLLOUT_EXPORT_ROWS_INVALID'));
});
test('23 ID de lote divergente no relatório bloqueia',()=>{
  const f=csvFixture();f.sources.reconciliationReport.batchId='44444444-4444-4444-8444-444444444444';
  assert.throws(()=>verify(f),error('ROLLOUT_RECONCILIATION_INVALID'));
});
test('24 nenhuma reconciliação manual é inventada pelo arquivo de retorno',()=>{
  const f=csvFixture({withReport:false,withReturn:true});const r=result(f);
  assert.equal(r.csvEvidence.status,'CSV_FILE_PREPARED');
  assert.equal(r.csvEvidence.erpReturnProvided,true);
  assert.equal(r.csvEvidence.reportedImported,0);
});
test('25 estado fiscal e pagamento permanecem não autorizados',()=>{
  const r=result(csvFixture());
  assert.equal(r.productionAuthorized,false);assert.equal(r.csvEvidence.externalApiVerified,false);
});
test('26 relatório humano íntegro é descrito somente como declaração',()=>{
  const r=result(csvFixture());
  assert.equal(r.csvEvidence.status,'MANUAL_REPORT_RECORDED');
  assert.equal(r.csvEvidence.reportedImported,1);
  assert.equal(r.csvEvidence.externalApiVerified,false);
});
test('27 relatório que alega confirmação por API é recusado',()=>{
  const f=csvFixture();f.sources.reconciliationReport.externalApiVerified=true;
  assert.throws(()=>verify(f),error('ROLLOUT_RECONCILIATION_INVALID'));
});
test('28 relatório que alega produção aprovada é recusado',()=>{
  const f=csvFixture();f.sources.reconciliationReport.productionApproved=true;
  assert.throws(()=>verify(f),error('ROLLOUT_RECONCILIATION_INVALID'));
});
test('29 resultado importado sem tripla conferência é recusado',()=>{
  const f=csvFixture();f.sources.reconciliationReport.decisions[0].checks.items=false;
  assert.throws(()=>verify(f),error('ROLLOUT_RECONCILIATION_INVALID'));
});
test('30 prévia alterada após o registro é rejeitada',()=>{
  const f=csvFixture();f.sources.reconciliationReport.previewSha256='0'.repeat(64);
  assert.throws(()=>verify(f),error('ROLLOUT_RECONCILIATION_PREVIEW_CHANGED'));
});
test('31 falta de arquivo do relatório configurado falha fechado',()=>{
  const f=csvFixture();f.sources.reconciliationReport=null;
  assert.throws(()=>verify(f),error('ROLLOUT_REPORT_MISSING'));
});
test('32 relatório inesperado sem caminho configurado é rejeitado',()=>{
  const f=csvFixture({withReport:false});f.sources.reconciliationReport={};
  assert.throws(()=>verify(f),error('ROLLOUT_REPORT_MISSING'));
});
test('33 evidencia completa continua exigindo autorização humana',()=>{
  const f=csvFixture();const r=result(f);
  assert.equal(r.verdict,'HUMAN_RELEASE_REVIEW_REQUIRED');
  assert.equal(r.reviewEligible,true);assert.equal(r.productionAuthorized,false);
});
test('34 escopo não suportado bloqueia mesmo com checklist completo',()=>{
  const f=csvFixture();f.config.assessment.requiredFlows.push('fiscal_reference');
  const r=result(f);assert.equal(r.verdict,'SCOPE_BLOCKED');assert.equal(r.reviewEligible,false);
});
test('35 checklist incompleto impede avanço de revisão',()=>{
  const f=csvFixture();f.config.checklist.privacyReviewed='pending';
  const r=result(f);assert.equal(r.reviewEligible,false);
});
test('36 piloto assistido pode ser indicado sem autorizar produção',()=>{
  const p=confirmed({pilot:false});const r=evaluateCommercialRollout(p);
  assert.equal(r.verdict,'ASSISTED_PILOT_ELIGIBLE');assert.equal(r.pilotEligible,true);
  assert.equal(r.productionAuthorized,false);
});
test('37 markdown não imprime segredos e destaca não autorização',()=>{
  const md=rolloutMarkdown(result(csvFixture()));
  assert.match(md,/Produção autorizada: \*\*NÃO\*\*/);
  assert.doesNotMatch(md,/operatorAlias|evidenceRef|customerEmail|cpf|token/i);
});
test('38 CLI demonstração offline funciona em caminhos absolutos',()=>{
  const out=nodeCli(['--demo']);assert.equal(out.status,0,out.stderr);
  assert.match(out.stdout,/Produção autorizada: NÃO/);
});
test('39 CLI não sobrescreve saída existente',async()=>directory(async d=>{
  const p=await fixtureOnDisk(d,{config:clone(example),sources:{}});
  const output=join(d,'relatorio.md');await writeFile(output,'VALOR ORIGINAL');
  const r=nodeCli(['--input',p,'--format','md','--output',output]);
  assert.equal(r.status,2,r.stderr);
  assert.equal(await readFile(output,'utf8'),'VALOR ORIGINAL');
}));
test('40 CLI gera relatório markdown sem credenciais',async()=>directory(async d=>{
  const p=await fixtureOnDisk(d,{config:clone(example),sources:{}});
  const output=join(d,'relatorio.md');
  const r=nodeCli(['--input',p,'--format','md','--output',output]);
  assert.equal(r.status,0,r.stderr);
  const text=await readFile(output,'utf8');assert.match(text,/Dossiê de implantação/);
  assert.match(text,/Produção autorizada: \*\*NÃO\*\*/);
  assert.equal((await stat(output)).isFile(),true);
}));
test('41 CLI retorna 3 para gate piloto pendente',async()=>directory(async d=>{
  const p=await fixtureOnDisk(d,{config:clone(example),sources:{}});
  const r=nodeCli(['--input',p,'--gate','pilot']);assert.equal(r.status,3,r.stderr);
}));
test('42 CLI retorna 3 para gate revisão pendente',async()=>directory(async d=>{
  const p=await fixtureOnDisk(d,{config:clone(example),sources:{}});
  const r=nodeCli(['--input',p,'--gate','review']);assert.equal(r.status,3,r.stderr);
}));
test('43 CLI bloqueia symlink de artefato',async t=>directory(async d=>{
  const f=csvFixture({withReport:false});const p=await fixtureOnDisk(d,f);
  const csv=join(d,f.config.artifacts.exportCsv);
  await rm(csv);
  try {await symlink(join(d,f.config.artifacts.exportManifest),csv);}
  catch(e) {if(['EPERM','EACCES','ENOTSUP'].includes(e?.code)){t.skip('Symlink desabilitado no Windows');return;}throw e;}
  const r=nodeCli(['--input',p]);assert.equal(r.status,2,r.stderr);
  assert.match(r.stderr,/EVIDENCE_FILE_INVALID/);
}));
test('44 CLI bloqueia artefato de outro cliente',async()=>directory(async d=>{
  const f=csvFixture();const p=await fixtureOnDisk(d,f);
  f.sources.manifest.storeId='22222222-2222-4222-8222-222222222222';
  await writeFile(join(d,f.config.artifacts.exportManifest),JSON.stringify(f.sources.manifest));
  const r=nodeCli(['--input',p]);assert.equal(r.status,2,r.stderr);
  assert.match(r.stderr,/TENANT_MISMATCH/);
}));
test('45 CLI saída não pode ser igual ao arquivo de configuração',async()=>directory(async d=>{
  const p=await fixtureOnDisk(d,{config:clone(example),sources:{}});
  const r=nodeCli(['--input',p,'--output',p]);assert.equal(r.status,2,r.stderr);
  assert.match(r.stderr,/OUTPUT_CONFLICT/);
}));
test('46 CLI impresso JSON não ecoa o binding completo da loja',async()=>directory(async d=>{
  const p=await fixtureOnDisk(d,{config:clone(example),sources:{}});
  const r=nodeCli(['--input',p,'--format','json']);assert.equal(r.status,0,r.stderr);
  const json=JSON.parse(r.stdout);assert.equal(json.productionAuthorized,false);
  assert.equal(Object.hasOwn(json,'binding'),false);
}));


test('47 modo CSV manual só é aceito para transporte CSV',()=>{
  const a=clone(example);a.manualCsvOrders=true;
  assert.throws(()=>validateRolloutConfig(a),error('ROLLOUT_MANUAL_CSV_SCOPE_INVALID'));
});
test('48 CSV manual sem manifesto mostra pendência sem aprovar revisão',()=>{
  const a=confirmed();a.assessment.provider='other';a.assessment.transport='csv';
  a.assessment.requiredFlows=['catalog_import','stock_import'];a.manualCsvOrders=true;
  const r=evaluateCommercialRollout(a);assert.equal(r.reviewEligible,false);
  assert.ok(r.nextActions.some(x=>x.code==='CSV_ORDER_EXPORT_NOT_DOCUMENTED'));
  assert.equal(r.productionAuthorized,false);
});
test('49 CSV manual sem conciliação não passa revisão comercial',()=>{
  const f=csvFixture({withReport:false});const r=result(f);
  assert.equal(r.reviewEligible,false);
  assert.ok(r.nextActions.some(x=>x.code==='CSV_ORDER_RECONCILIATION_NOT_DOCUMENTED'));
});
test('50 CSV com conciliação mas pedido incerto não passa revisão',()=>{
  const f=csvFixture();
  const receipt=clone(f.sources.reconciliationReport);
  receipt.decisions=[{orderId:f.sources.manifest.orderIds[0],result:'UNCERTAIN',reasonCode:'NO_EVIDENCE'}];
  // Recalcular somente a prévia por valor; não aceitar por simples alegação de importação.
  const binding={schema:1,storeId:receipt.storeId,integrationId:receipt.integrationId,batchId:receipt.batchId,
    exportSha256:receipt.exportSha256,operatorAlias:receipt.operatorAlias,verifiedAt:receipt.verifiedAt,
    evidenceRef:receipt.evidenceRef,decisions:receipt.decisions};
  receipt.previewSha256=createHash('sha256').update(JSON.stringify(binding)).digest('hex');
  f.sources.reconciliationReport=receipt;const r=result(f);
  assert.equal(r.reviewEligible,false);
  assert.ok(r.nextActions.some(x=>x.code==='CSV_ORDERS_REQUIRE_REVIEW'));
});
