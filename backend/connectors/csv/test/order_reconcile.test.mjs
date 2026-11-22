import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareOrderExport,CsvOrderExportError} from '../order_export.mjs';
import {createOrderExportFiles,loadOrderExportState,lockOrderExportState} from '../order_export_state.mjs';
import {prepareManualReconciliation,validateManualReceipt,validateReconciliationManifest,createManualReconciliationReport,sha256Bytes} from '../order_reconcile.mjs';
import {previewReconciliation,recordReconciliation} from '../order_reconcile_state.mjs';
const sample=JSON.parse(await readFile(new URL('../orders.example.json',import.meta.url),'utf8'));
const clone=x=>structuredClone(x);
const SETTINGS=sample.settings,ORDER=SETTINGS.orderIds[0],STORE=SETTINGS.storeId,INTEGRATION=SETTINGS.integrationId;
const SECOND='44444444-4444-4444-8444-444444444444';
const CREATED='2026-11-22T18:00:00.000Z',VERIFIED='2026-11-22T18:20:00.000Z';
const CLOCK=()=>new Date('2026-11-22T18:30:00.000Z');
const err=code=>e=>e instanceof CsvOrderExportError&&e.code===code;
const samplePlan=()=>prepareOrderExport(clone(sample.snapshots),clone(SETTINGS));
const local=(args,env={})=>spawnSync(process.execPath,[fileURLToPath(new URL('../order_reconcile_cli.mjs',import.meta.url)),...args],
  {encoding:'utf8',env:{...process.env,...env},timeout:8000});

async function fixture(fn,{multi=false}={}){
  const dir=await mkdtemp(join(tmpdir(),'f40-reconcile-'));
  const statePath=join(dir,'state.json'),csvPath=join(dir,'lote.csv'),manifestPath=`${csvPath}.manifest.json`;
  const receiptPath=join(dir,'receipt.json'),reportPath=join(dir,'reconciliation.json');
  const settings=clone(SETTINGS),snapshots=clone(sample.snapshots);
  if(multi){settings.orderIds.push(SECOND);const s=clone(snapshots[0]);s.order.id=SECOND;snapshots.push(s);}
  const plan=prepareOrderExport(snapshots,settings);
  try{
    await createOrderExportFiles({plan,config:settings,statePath,outputPath:csvPath,clock:()=>new Date(CREATED)});
    const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
    const receipt={schema:1,storeId:STORE,integrationId:INTEGRATION,batchId:manifest.batchId,
      exportSha256:manifest.sha256,operatorAlias:'operador01',verifiedAt:VERIFIED,evidenceRef:'PROTOCOLO-LOTE-001',
      acknowledgement:'CONFIRMO_CONFERENCIA_NO_ERP',
      decisions:settings.orderIds.map((orderId,i)=>i===0?{orderId,result:'IMPORTED',externalOrderId:'ERP-LOTE-001',
        checks:{reference:true,items:true,total:true}}:{orderId,result:'UNCERTAIN',reasonCode:'NO_EVIDENCE'})};
    await writeFile(receiptPath,JSON.stringify(receipt));
    const paths={csvPath,manifestPath,receiptPath,statePath,reportPath};
    return await fn({paths,manifest,receipt,plan,settings,dir,statePath,csvPath,reportPath,receiptPath});
  }finally{await rm(dir,{recursive:true,force:true});}
}
async function putReceipt(path,receipt){await writeFile(path,JSON.stringify(receipt));}
async function preview(paths){return previewReconciliation(paths,{clock:CLOCK});}
async function commit(paths,sha,extras={}){return recordReconciliation(paths,{clock:CLOCK,confirmed:true,expectedSha256:sha,...extras});}

test('01 gera previa offline com resultado reportado, nao aceite API',async()=>fixture(async({paths})=>{
  const x=await preview(paths);assert.equal(x.mode,'PREVIEW');assert.equal(x.reportedImported,1);
  assert.equal(x.productionApproved,false);assert.equal(x.externalApiVerified,false);assert.equal(x.reexportAuthorized,false);
  assert.match(x.previewSha256,/^[a-f0-9]{64}$/);
}));
test('02 demonstracao CLI completamente offline sem persistir arquivos',()=>{
  const result=local(['--demo'],{F40_API_URL:'',F40_INTEGRATION_TOKEN:''});
  assert.equal(result.status,0,result.stderr);const r=JSON.parse(result.stdout);
  assert.equal(r.networkUsed,false);assert.equal(r.filesCreated,false);assert.equal(r.mode,'DEMO');
});
test('03 manifesto corresponde ao formato exato de exportacao F5.16',async()=>fixture(async({manifest})=>{
  assert.equal(validateReconciliationManifest(manifest).erpReceived,false);
}));
test('04 comprovante precisa de confirmacao explicita humana',async()=>fixture(async({receipt,manifest})=>{
  const bad={...receipt,acknowledgement:'SIM'};
  assert.throws(()=>validateManualReceipt(bad,manifest),err('CSV_RECONCILE_RECEIPT_INVALID'));
}));
test('05 objeto de comprovante bloqueia propriedades nao autorizadas/token',async()=>fixture(async({receipt,receiptPath,paths})=>{
  await putReceipt(receiptPath,{...receipt,token:'segredo'});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_RECEIPT_INVALID'));
}));
test('06 ids de loja nao podem trocar na entrada',async()=>fixture(async({receipt,receiptPath,paths})=>{
  await putReceipt(receiptPath,{...receipt,storeId:SECOND});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_RECEIPT_INVALID'));
}));
test('07 id de integracao nao pode trocar',async()=>fixture(async({receipt,receiptPath,paths})=>{
  await putReceipt(receiptPath,{...receipt,integrationId:SECOND});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_RECEIPT_INVALID'));
}));
test('08 id de lote nao pode trocar',async()=>fixture(async({receipt,receiptPath,paths})=>{
  await putReceipt(receiptPath,{...receipt,batchId:SECOND});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_RECEIPT_INVALID'));
}));
test('09 hash do arquivo CSV deve coincidir com manifesto',async()=>fixture(async({csvPath,paths})=>{
  await writeFile(csvPath,'arquivo adulterado');
  await assert.rejects(preview(paths),err('CSV_RECONCILE_CSV_HASH_MISMATCH'));
}));
test('10 estado reservado sem arquivo gerado nao pode ser atestado',async()=>fixture(async({statePath,paths})=>{
  const state=JSON.parse(await readFile(statePath,'utf8'));state.orders[ORDER].stage='RESERVED';
  await writeFile(statePath,JSON.stringify(state));
  await assert.rejects(preview(paths),err('CSV_RECONCILE_STATE_NOT_READY'));
}));
test('11 estado com hash divergente impede atestado',async()=>fixture(async({statePath,paths})=>{
  const state=JSON.parse(await readFile(statePath,'utf8'));state.orders[ORDER].sha256='0'.repeat(64);
  await writeFile(statePath,JSON.stringify(state));
  await assert.rejects(preview(paths),err('CSV_RECONCILE_STATE_NOT_READY'));
}));
test('12 nao aceita decisao faltante, mesmo em lote parcial',async()=>fixture(async({receipt,receiptPath,paths})=>{
  await putReceipt(receiptPath,{...receipt,decisions:[]});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_RECEIPT_INVALID'));
},{multi:true}));
test('13 rejeita pedido estranho ou decisao duplicada',async()=>fixture(async({receipt,receiptPath,paths})=>{
  await putReceipt(receiptPath,{...receipt,decisions:[{orderId:SECOND,result:'UNCERTAIN',reasonCode:'UNKNOWN'},
    {orderId:'66666666-6666-4666-8666-666666666666',result:'UNCERTAIN',reasonCode:'UNKNOWN'}]});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_DECISION_INVALID'));
  await putReceipt(receiptPath,{...receipt,decisions:[receipt.decisions[0],receipt.decisions[0]]});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_DECISION_INVALID'));
},{multi:true}));
test('14 somente importado exige referencia externa unica',async()=>fixture(async({receipt,receiptPath,paths})=>{
  await putReceipt(receiptPath,{...receipt,decisions:[{orderId:ORDER,result:'IMPORTED'}]});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_EXTERNAL_REF_INVALID'));
  await putReceipt(receiptPath,{...receipt,decisions:[{orderId:ORDER,result:'UNCERTAIN',externalOrderId:'ERP-1',reasonCode:'UNKNOWN'}]});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_EXTERNAL_REF_INVALID'));
}));
test('15 nao permite duas vendas com mesma referencia ERP',async()=>fixture(async({receipt,receiptPath,paths})=>{
  const d=receipt.decisions.map(x=>({orderId:x.orderId,result:'IMPORTED',externalOrderId:'ERP-LOTE-001',
    checks:{reference:true,items:true,total:true}}));
  await putReceipt(receiptPath,{...receipt,decisions:d});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_EXTERNAL_REF_INVALID'));
},{multi:true}));
test('16 recebido e rejeitado continuam relatados, sem autorizar reexportacao',async()=>fixture(async({receipt,receiptPath,paths})=>{
  const d=receipt.decisions.map((x,i)=>i===1?{orderId:x.orderId,result:'REJECTED',reasonCode:'ERP_REJECTED'}:x);
  await putReceipt(receiptPath,{...receipt,decisions:d});
  const p=await preview(paths);assert.equal(p.reportedRejected,1);assert.equal(p.reexportAuthorized,false);
},{multi:true}));
test('17 data humana futura exige nova conferencia',async()=>fixture(async({receipt,receiptPath,paths})=>{
  await putReceipt(receiptPath,{...receipt,verifiedAt:'2030-01-01T00:00:00Z'});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_VERIFICATION_TIME_INVALID'));
}));
test('18 data de conferencia anterior a exportacao nao e valida',async()=>fixture(async({receipt,receiptPath,paths})=>{
  await putReceipt(receiptPath,{...receipt,verifiedAt:'2026-11-20T00:00:00Z'});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_VERIFICATION_TIME_INVALID'));
}));
test('19 preview nunca grava relatorio nem modifica estado',async()=>fixture(async({paths,statePath,reportPath})=>{
  const before=await readFile(statePath,'utf8');await preview(paths);
  assert.equal(await readFile(statePath,'utf8'),before);
  await assert.rejects(access(reportPath),{code:'ENOENT'});
}));
test('20 gravacao requer dupla confirmacao e SHA valido',async()=>fixture(async({paths,statePath,reportPath})=>{
  const x=await preview(paths);await assert.rejects(recordReconciliation(paths,{clock:CLOCK,
    expectedSha256:x.previewSha256}),err('CSV_RECONCILE_CONFIRM_REQUIRED'));
  await assert.rejects(commit(paths,'0'.repeat(64)),err('CSV_RECONCILE_PREVIEW_CHANGED'));
  await assert.rejects(access(reportPath),{code:'ENOENT'});
  assert.equal((await readFile(statePath,'utf8')).includes('MANUALLY_REVIEWED'),false);
}));
test('21 gravacao gera relatorio sem ACK e sem permitir repeticao do pedido',async()=>fixture(async({paths,statePath,reportPath,settings,dir,plan})=>{
  const x=await preview(paths);const r=await commit(paths,x.previewSha256);
  assert.equal(r.mode,'MANUALLY_REVIEWED');assert.equal(r.externalApiVerified,false);
  const report=JSON.parse(await readFile(reportPath,'utf8'));
  assert.equal(report.erpReceivedConfirmedByApi,false);assert.equal(report.productionApproved,false);
  assert.equal(report.reexportAuthorized,false);assert.equal(report.decisions[0].externalOrderId,'ERP-LOTE-001');
  assert.match(r.reportSha256,/^[a-f0-9]{64}$/);
  assert.equal(r.reportSha256,sha256Bytes(await readFile(reportPath)));
  const state=await loadOrderExportState(statePath,settings);
  assert.equal(state.orders[ORDER].stage,'MANUALLY_REVIEWED');
  assert.equal(state.orders[ORDER].reconciliation.externalApiVerified,false);
  assert.equal(state.orders[ORDER].reconciliation.reportSha256,r.reportSha256);
  await assert.rejects(createOrderExportFiles({plan,config:settings,statePath,outputPath:join(dir,'saida-2.csv')}),
    err('CSV_ORDER_ALREADY_PREPARED_OR_UNCERTAIN'));
}));
test('22 revoga nova conciliacao do mesmo lote, sem sobrescrever arquivos',async()=>fixture(async({paths,reportPath})=>{
  const x=await preview(paths);await commit(paths,x.previewSha256);
  const contents=await readFile(reportPath,'utf8');
  await assert.rejects(commit(paths,x.previewSha256),err('CSV_RECONCILE_REPORT_EXISTS'));
  assert.equal(await readFile(reportPath,'utf8'),contents);
}));
test('23 se receipt mudar apos previa, nao grava',async()=>fixture(async({paths,receipt,receiptPath})=>{
  const before=await preview(paths);
  await putReceipt(receiptPath,{...receipt,evidenceRef:'NOVO-PROTOCOLO'});
  await assert.rejects(commit(paths,before.previewSha256),err('CSV_RECONCILE_PREVIEW_CHANGED'));
}));
test('24 trava de lote previne operadores concorrentes',async()=>fixture(async({paths,statePath})=>{
  const hash=(await preview(paths)).previewSha256;
  const release=await lockOrderExportState(statePath);
  try{await assert.rejects(commit(paths,hash),err('CSV_ORDER_STATE_LOCKED'));}
  finally{await release();}
}));
test('25 arquivo relatorio existente bloqueia antes de mudar estado',async()=>fixture(async({paths,statePath,reportPath})=>{
  const hash=(await preview(paths)).previewSha256;
  await writeFile(reportPath,'relatorio antigo');
  await assert.rejects(commit(paths,hash),err('CSV_RECONCILE_REPORT_EXISTS'));
  assert.equal(await readFile(reportPath,'utf8'),'relatorio antigo');
  assert.equal((await loadOrderExportState(statePath,SETTINGS)).orders[ORDER].stage,'FILE_CREATED');
}));
test('26 caminhos relativos ou report igual a csv sao proibidos',async()=>fixture(async({paths})=>{
  await assert.rejects(preview({...paths,csvPath:'saida.csv'}),err('CSV_RECONCILE_PATHS_INVALID'));
  await assert.rejects(commit({...paths,reportPath:paths.csvPath},'f'.repeat(64)),err('CSV_RECONCILE_PATHS_INVALID'));
}));
test('27 caminho do manifesto deve acompanhar exatamente o CSV',async()=>fixture(async({paths,dir})=>{
  await assert.rejects(preview({...paths,manifestPath:join(dir,'outro.json')}),err('CSV_RECONCILE_PATHS_INVALID'));
}));
test('28 proibe recibo com email/CPF ou propriedade suspeita',async()=>fixture(async({paths,receipt,receiptPath})=>{
  await putReceipt(receiptPath,{...receipt,operatorAlias:'pessoa@empresa.com'});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_RECEIPT_INVALID'));
  await putReceipt(receiptPath,{...receipt,buyerCpf:'12345678900'});
  await assert.rejects(preview(paths),err('CSV_RECONCILE_RECEIPT_INVALID'));
}));
test('29 relatorio gerado e marcado apenas como declaracao humana',async()=>fixture(async({paths})=>{
  const m=JSON.parse(await readFile(paths.manifestPath,'utf8'));
  const s=JSON.parse(await readFile(paths.statePath,'utf8'));
  const r=JSON.parse(await readFile(paths.receiptPath,'utf8'));
  const bytes=await readFile(paths.csvPath);
  const plan=prepareManualReconciliation({manifest:m,csvBytes:bytes,state:s,receipt:r,now:CLOCK()});
  const report=createManualReconciliationReport(plan);
  assert.equal(report.manualOnly,true);assert.equal(report.externalApiVerified,false);
  assert.ok(!Object.keys(report).includes('customerEmail'));
}));
test('30 CLI --record sem confirmacao falha sem acessar arquivos',()=>{
  const res=local(['--record'],{F40_CSV_RECONCILE_CONFIRM:''});
  assert.equal(res.status,1);assert.match(res.stderr,/CSV_RECONCILE_PATHS_INVALID/);
});
test('31 erros CLI nao ecoam dados sensiveis de ambiente',()=>{
  const res=local(['--preview'],{F40_INTEGRATION_TOKEN:'SENHA_ULTRA_SIGILOSA'});
  assert.equal(res.status,1);assert.doesNotMatch(res.stderr,/SENHA_ULTRA_SIGILOSA/);
});
test('32 manifest divergente nao cria estado',async()=>fixture(async({paths,manifest})=>{
  await writeFile(paths.manifestPath,JSON.stringify({...manifest,storeId:SECOND}));
  await assert.rejects(preview(paths),err('CSV_ORDER_STATE_TENANT_MISMATCH'));
}));
test('33 hash de conciliacao igual para mesma entrada reordenada por pedido',async()=>fixture(async({paths,receipt,receiptPath})=>{
  const x=await preview(paths);
  await putReceipt(receiptPath,{...receipt,decisions:[...receipt.decisions].reverse()});
  assert.equal((await preview(paths)).previewSha256,x.previewSha256);
},{multi:true}));
test('34 lote misto grava todos os estados sem declarar recebimento por API',async()=>fixture(async({paths,statePath,settings})=>{
  const x=await preview(paths);assert.equal(x.reportedImported,1);assert.equal(x.uncertain,1);
  await commit(paths,x.previewSha256);
  const state=await loadOrderExportState(statePath,settings);
  assert.equal(state.orders[ORDER].reconciliation.result,'IMPORTED');
  assert.equal(state.orders[SECOND].reconciliation.result,'UNCERTAIN');
  assert.equal(state.orders[SECOND].reconciliation.reexportAuthorized,false);
},{multi:true}));
test('35 CLI preview e gravacao real de arquivos locais com hash, sem rede',async()=>fixture(async({paths})=>{
  const env={F40_CSV_RECONCILE_CSV:paths.csvPath,F40_CSV_RECONCILE_MANIFEST:paths.manifestPath,
    F40_CSV_RECONCILE_RECEIPT:paths.receiptPath,F40_CSV_RECONCILE_STATE:paths.statePath,
    F40_CSV_RECONCILE_REPORT:paths.reportPath};
  const p=local(['--preview'],env);assert.equal(p.status,0,p.stderr);
  const hash=JSON.parse(p.stdout).previewSha256;
  const denied=local(['--record'],env);assert.equal(denied.status,1);
  assert.match(denied.stderr,/CSV_RECONCILE_CONFIRM_REQUIRED/);
  const yes=local(['--record'],{...env,F40_CSV_RECONCILE_CONFIRM:'CONFIRMO_REGISTRO_MANUAL',
    F40_CSV_RECONCILE_EXPECTED_SHA256:hash});
  assert.equal(yes.status,0,yes.stderr);
  assert.equal(JSON.parse(yes.stdout).externalApiVerified,false);
  const again=local(['--record'],{...env,F40_CSV_RECONCILE_CONFIRM:'CONFIRMO_REGISTRO_MANUAL',
    F40_CSV_RECONCILE_EXPECTED_SHA256:hash});
  assert.equal(again.status,1);
  assert.match(again.stderr,/CSV_RECONCILE_REPORT_EXISTS/);
}));

test('36 declaracao de importado exige conferencia de referencia, itens e total',async()=>fixture(async({paths,receipt,receiptPath})=>{
  const invalid=clone(receipt);invalid.decisions[0].checks.total=false;
  await putReceipt(receiptPath,invalid);
  await assert.rejects(preview(paths),err('CSV_RECONCILE_IMPORTED_CHECKS_REQUIRED'));
  delete invalid.decisions[0].checks.items;
  await putReceipt(receiptPath,invalid);
  await assert.rejects(preview(paths),err('CSV_RECONCILE_IMPORTED_CHECKS_REQUIRED'));
}));
test('37 pedidos nao importados exigem motivo padronizado',async()=>fixture(async({paths,receipt,receiptPath})=>{
  const invalid=clone(receipt);invalid.decisions[0]={orderId:ORDER,result:'REJECTED'};
  await putReceipt(receiptPath,invalid);
  await assert.rejects(preview(paths),err('CSV_RECONCILE_REASON_REQUIRED'));
}));
test('38 detecta divergencia declarada e nao autoriza retry',async()=>fixture(async({paths,receipt,receiptPath})=>{
  const r=clone(receipt);r.decisions[0]={orderId:ORDER,result:'UNCERTAIN',reasonCode:'VALUE_DIVERGENCE'};
  await putReceipt(receiptPath,r);const p=await preview(paths);
  assert.equal(p.divergent,1);assert.equal(p.reexportAuthorized,false);assert.equal(p.reportedImported,0);
}));
test('39 nem com checks de igualdade pode marcar rejeitado como importado',async()=>fixture(async({paths,receipt,receiptPath})=>{
  const r=clone(receipt);r.decisions[0]={orderId:ORDER,result:'REJECTED',reasonCode:'ERP_REJECTED',
    checks:{reference:true,items:true,total:true}};
  await putReceipt(receiptPath,r);
  await assert.rejects(preview(paths),err('CSV_RECONCILE_REASON_REQUIRED'));
}));
test('40 manifesto com quantidade de linhas alterada bloqueia conciliacao',async()=>fixture(async({paths,manifest})=>{
  await writeFile(paths.manifestPath,JSON.stringify({...manifest,rows:manifest.rows+1}));
  await assert.rejects(preview(paths),err('CSV_RECONCILE_ROW_COUNT_MISMATCH'));
}));
test('41 duplicidade de referencia ERP entre lotes da mesma loja bloqueia',async()=>fixture(async({paths,statePath})=>{
  const state=JSON.parse(await readFile(statePath,'utf8'));
  state.orders[SECOND]={stage:'MANUALLY_REVIEWED',reconciliation:{externalOrderId:'ERP-LOTE-001'}};
  await writeFile(statePath,JSON.stringify(state));
  await assert.rejects(preview(paths),err('CSV_RECONCILE_EXTERNAL_REF_ALREADY_USED'));
}));
test('42 comprovante com valores externos nao confiaveis nao e aceito como ID',async()=>fixture(async({paths,receipt,receiptPath})=>{
  const r=clone(receipt);r.decisions[0].externalOrderId='=HYPERLINK(1)';
  await putReceipt(receiptPath,r);
  await assert.rejects(preview(paths),err('CSV_RECONCILE_EXTERNAL_REF_INVALID'));
}));
