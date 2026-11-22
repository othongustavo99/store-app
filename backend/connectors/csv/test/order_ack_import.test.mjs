import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CsvOrderExportError,prepareOrderExport} from '../order_export.mjs';
import {createOrderExportFiles} from '../order_export_state.mjs';
import {validateManualReceipt} from '../order_reconcile.mjs';
import {assessErpReturn,parseStrictCsv,validateAckSettings} from '../order_ack_import.mjs';
const sample=JSON.parse(await readFile(new URL('../orders.example.json',import.meta.url),'utf8'));
const ack=JSON.parse(await readFile(new URL('../ack.settings.example.json',import.meta.url),'utf8'));
const clone=x=>structuredClone(x);
const ID=sample.settings.orderIds[0],SECOND='44444444-4444-4444-8444-444444444444';
const err=code=>e=>e instanceof CsvOrderExportError&&e.code===code;
const format=c=>`${Math.floor(c/100)},${String(c%100).padStart(2,'0')}`;
const line=(id,{ext='ERP-EXEMPLO-001',status='IMPORTADO',total='119,90',count='1'}={})=>
  `"F40-${id}";"${ext}";"${status}";"${total}";"${count}"`;
const header='"referencia";"codigo_erp";"situacao";"total";"linhas"';
const csv=(...lines)=>Buffer.from([header,...lines].join('\r\n')+'\r\n');
const nodeCli=(flags,env={})=>spawnSync(process.execPath,[fileURLToPath(new URL('../order_ack_import_cli.mjs',import.meta.url)),...flags],
  {env:{...process.env,...env},encoding:'utf8',timeout:10000});

function fixtureMemory({multi=false,ackOverrides={},exportOverrides={},stateOverrides={},returnBytes=null}={}){
  const settings=clone(sample.settings),snapshots=clone(sample.snapshots);
  if(multi){settings.orderIds.push(SECOND);const s=clone(snapshots[0]);s.order.id=SECOND;snapshots.push(s);}
  Object.assign(settings,exportOverrides);
  const plan=prepareOrderExport(snapshots,settings);
  const createdAt='2026-11-22T18:00:00.000Z',batchId='99999999-9999-4999-8999-999999999999';
  const manifest={schema:1,batchId,storeId:settings.storeId,integrationId:settings.integrationId,
    orderIds:plan.orderIds,createdAt,sha256:plan.sha256,rows:plan.summary.lines,
    erpReceived:false,erpOrderCreated:false,note:'Teste local'};
  const state={schema:1,provider:'csv-orders',storeId:settings.storeId,integrationId:settings.integrationId,
    orders:Object.fromEntries(plan.orderIds.map(id=>[id,{stage:'FILE_CREATED',batchId,sha256:plan.sha256,createdAt}]))};
  Object.assign(state,stateOverrides);
  const erpCsv=returnBytes??csv(...plan.orderIds.map((id,i)=>line(id,{ext:`ERP-EXEMPLO-${i+1}`,
    total:format(Number(snapshots[i].order.totalCents)),count:String(snapshots[i].order.items.length)})));
  const input={manifest,exportCsv:Buffer.from(plan.contents),exportSettings:settings,
    erpCsv,settings:{...clone(ack),...ackOverrides},state};
  return input;
}
async function diskFixture(fn){
  const dir=await mkdtemp(join(tmpdir(),'f40-ack-'));
  try{
    const f=fixtureMemory();
    const csvPath=join(dir,'lote.csv'),manifestPath=`${csvPath}.manifest.json`,statePath=join(dir,'estado.json');
    const erpPath=join(dir,'erp.csv'),settingsPath=join(dir,'ack.json'),exportSettingsPath=join(dir,'export-settings.json'),draftPath=join(dir,'rascunho.json');
    const plan=prepareOrderExport(clone(sample.snapshots),clone(sample.settings));
    await createOrderExportFiles({plan,config:sample.settings,outputPath:csvPath,statePath,
      clock:()=>new Date('2026-11-22T18:00:00.000Z')});
    await writeFile(erpPath,f.erpCsv);await writeFile(settingsPath,JSON.stringify(f.settings));
    await writeFile(exportSettingsPath,JSON.stringify(sample.settings));
    const env={F40_CSV_ACK_ERP_FILE:erpPath,F40_CSV_ACK_SETTINGS:settingsPath,
      F40_CSV_ACK_EXPORT_CSV:csvPath,F40_CSV_ACK_EXPORT_SETTINGS:exportSettingsPath,
      F40_CSV_ACK_EXPORT_MANIFEST:manifestPath,F40_CSV_ACK_STATE:statePath,F40_CSV_ACK_DRAFT:draftPath};
    return await fn({dir,env,paths:{csvPath,manifestPath,statePath,erpPath,settingsPath,exportSettingsPath,draftPath}});
  }finally{await rm(dir,{recursive:true,force:true});}
}

test('01 parser aceita CSV BOM, CRLF, aspas e LF',()=>{
  const b=Buffer.from('\uFEFF"referencia";"situacao"\r\n"F40-1";"IMPORTADO"\r\n');
  assert.deepEqual(parseStrictCsv(b,';'),[['referencia','situacao'],['F40-1','IMPORTADO']]);
  assert.deepEqual(parseStrictCsv('"referencia";"situacao"\n"F40-1";"IMPORTADO"\n',';').length,2);
});
test('02 parser preserva aspas escapadas',()=>{
  assert.deepEqual(parseStrictCsv('nome;estado\n"cod""igo";ok\n',';')[1],['cod"igo','ok']);
});
test('03 parser rejeita aspas incompletas',()=>{
  assert.throws(()=>parseStrictCsv('nome;estado\n"quebrado;ok',';'),err('CSV_ACK_UNCLOSED_QUOTE'));
});
test('04 parser rejeita texto apos aspas de fechamento',()=>{
  assert.throws(()=>parseStrictCsv('nome;estado\n"abc"x;ok',';'),err('CSV_ACK_MALFORMED_QUOTE'));
});
test('05 parser rejeita UTF-8 invalido',()=>{
  assert.throws(()=>parseStrictCsv(Buffer.from([0xff,0xfe]),';'),err('CSV_ACK_UTF8_INVALID'));
});
test('06 parser rejeita cabeçalhos repetidos',()=>{
  assert.throws(()=>parseStrictCsv('nome;NOME\nx;y\n',';'),err('CSV_ACK_HEADER_INVALID'));
});
test('07 parser rejeita colunas em quantidade diferente',()=>{
  assert.throws(()=>parseStrictCsv('nome;estado\nabc\n',';'),err('CSV_ACK_ROW_INVALID'));
});
test('08 parser rejeita quebra de linha dentro do campo',()=>{
  assert.throws(()=>parseStrictCsv('nome;estado\n"a\nb";ok',';'),err('CSV_ACK_MULTILINE_FORBIDDEN'));
});
test('09 parser rejeita controle NUL',()=>{
  assert.throws(()=>parseStrictCsv('nome;estado\na;\0\n',';'),err('CSV_ACK_FILE_INVALID'));
});
test('10 exemplo de mapeamento é válido',()=>assert.equal(validateAckSettings(ack).schema,1));
test('11 formato de status duplicado bloqueado',()=>{
  const s=clone(ack);s.statusValues.pending=['IMPORTADO'];
  assert.throws(()=>validateAckSettings(s),err('CSV_ACK_STATUSES_INVALID'));
});
test('12 mapeamento com senha/token rejeitado',()=>{
  const s=clone(ack);s.token='segredo';
  assert.throws(()=>validateAckSettings(s),err('CSV_ACK_SETTINGS_INVALID'));
});
test('13 fonte feliz produz sugestoes, mas todos ficam incertos',()=>{
  const f=fixtureMemory(),x=assessErpReturn(f);
  assert.equal(x.summary.reportedImported,1);assert.equal(x.summary.withFindings,0);
  assert.equal(x.draft.decisions[0].result,'UNCERTAIN');
  assert.equal(x.draft.decisions[0].reasonCode,'UNKNOWN');
  assert.equal(Object.hasOwn(x.draft,'acknowledgement'),false);
  assert.equal(x.draft.operatorAlias,'');assert.equal(x.summary.erpReceivedConfirmedByApi,false);
  assert.throws(()=>validateManualReceipt(x.draft,f.manifest),err('CSV_RECONCILE_RECEIPT_INVALID'));
});
test('14 valor diferente do esperado sinalizado, sem aceitar como importado',()=>{
  const f=fixtureMemory({returnBytes:csv(line(ID,{total:'120,90'}))});
  const x=assessErpReturn(f);
  assert.deepEqual(x.results[0].findings,['VALUE_DIVERGENCE']);
  assert.equal(x.draft.decisions[0].reasonCode,'VALUE_DIVERGENCE');
});
test('15 numero de linhas divergente sinalizado',()=>{
  const f=fixtureMemory({returnBytes:csv(line(ID,{count:'2'}))}),x=assessErpReturn(f);
  assert.deepEqual(x.results[0].findings,['QUANTITY_DIVERGENCE']);
});
test('16 status rejeitado é apenas suspeita de rejeicao',()=>{
  const f=fixtureMemory({returnBytes:csv(line(ID,{status:'REJEITADO',ext:''}))}),x=assessErpReturn(f);
  assert.equal(x.summary.reportedRejected,1);assert.equal(x.draft.decisions[0].result,'UNCERTAIN');
  assert.equal(x.draft.decisions[0].reasonCode,'ERP_REJECTED');
});
test('17 status pendente nao confirma nada',()=>{
  const f=fixtureMemory({returnBytes:csv(line(ID,{status:'PENDENTE',ext:''}))}),x=assessErpReturn(f);
  assert.equal(x.summary.reportedPending,1);assert.equal(x.draft.decisions[0].result,'UNCERTAIN');
});
test('18 um pedido ausente recebe NO_EVIDENCE',()=>{
  const f=fixtureMemory({multi:true,returnBytes:csv(line(ID))}),x=assessErpReturn(f);
  assert.equal(x.summary.missingFromReturn,1);assert.equal(x.draft.decisions[1].reasonCode,'NO_EVIDENCE');
});
test('19 nao aceita referencia de outro pedido/loja',()=>{
  const f=fixtureMemory({returnBytes:csv(line(SECOND))});
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_UNKNOWN_REFERENCE'));
});
test('20 bloqueia pedido duplicado no retorno',()=>{
  const f=fixtureMemory({returnBytes:csv(line(ID),line(ID,{ext:'ERP-OUTRO-0001'}))});
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_DUPLICATE_REFERENCE'));
});
test('21 bloqueia referencia externa duplicada entre pedidos',()=>{
  const f=fixtureMemory({multi:true,returnBytes:csv(line(ID),line(SECOND))});
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_EXTERNAL_REF_INVALID'));
});
test('22 rejeita formula como codigo externo',()=>{
  const f=fixtureMemory({returnBytes:csv(line(ID,{ext:'=HYPERLINK(1)'}))});
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_EXTERNAL_REF_INVALID'));
});
test('23 fonte com situação desconhecida bloqueia',()=>{
  const f=fixtureMemory({returnBytes:csv(line(ID,{status:'APROVADO_POR_IA'}))});
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_UNKNOWN_STATUS'));
});
test('24 separador errado bloqueia',()=>{
  const f=fixtureMemory({ackOverrides:{delimiter:','}});
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_SETTINGS_INVALID'));
});
test('25 origem do lote incorreta bloqueia',()=>{
  const f=fixtureMemory();f.manifest.storeId=SECOND;
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_TENANT_OR_BATCH_MISMATCH'));
});
test('26 hash do original adulterado bloqueia',()=>{
  const f=fixtureMemory();f.exportCsv=Buffer.from('alterado');
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_EXPORT_HASH_MISMATCH'));
});
test('27 estado reservado nao autoriza leitura',()=>{
  const f=fixtureMemory();f.state.orders[ID].stage='RESERVED';
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_STATE_NOT_READY'));
});
test('28 estado ja conciliado nao pode gerar novo parecer',()=>{
  const f=fixtureMemory();f.state.orders[ID].reconciliation={result:'IMPORTED'};
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_STATE_NOT_READY'));
});
test('29 isolamento por integracao, mesmo quando loja coincide',()=>{
  const f=fixtureMemory();f.settings.integrationId=SECOND;
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_TENANT_OR_BATCH_MISMATCH'));
});
test('30 sem montantes nem contagens, sinaliza falta de dados',()=>{
  const f=fixtureMemory();delete f.settings.columns.orderTotal;delete f.settings.columns.itemCount;
  f.erpCsv=Buffer.from(`referencia;codigo_erp;situacao\nF40-${ID};ERP-TESTE-0001;IMPORTADO\n`);
  const x=assessErpReturn(f);
  assert.deepEqual(x.results[0].findings,['TOTAL_NOT_PROVIDED','ITEM_COUNT_NOT_PROVIDED']);
});
test('31 saida nao inclui PII nem texto bruto do retorno',()=>{
  const f=fixtureMemory(),x=assessErpReturn(f);
  const str=JSON.stringify(x);
  assert.doesNotMatch(str,/nome_cliente|customerEmail|CPF|token/);
  assert.match(x.sourceSha256,/^[a-f0-9]{64}$/);
});
test('32 edicao no retorno muda hash da previa',()=>{
  const a=fixtureMemory(),b=fixtureMemory({returnBytes:csv(line(ID,{status:'PENDENTE'}))});
  assert.notEqual(assessErpReturn(a).previewSha256,assessErpReturn(b).previewSha256);
});
test('33 CLI demo e inteiramente offline',()=>{
  const r=nodeCli(['--demo']);assert.equal(r.status,0,r.stderr);
  const x=JSON.parse(r.stdout);assert.equal(x.filesCreated,false);assert.equal(x.networkUsed,false);
});
test('34 CLI sem paths falha sem revelar segredo',()=>{
  const r=nodeCli(['--preview'],{F40_API_TOKEN:'SUPERSIGILOSO'});
  assert.equal(r.status,1);assert.match(r.stderr,/CSV_ACK_PATHS_INVALID/);
  assert.doesNotMatch(r.stderr,/SUPERSIGILOSO/);
});
test('35 CLI preview nao cria nem altera arquivos',()=>diskFixture(async({env,paths})=>{
  const before=await readFile(paths.statePath,'utf8');const r=nodeCli(['--preview'],env);
  assert.equal(r.status,0,r.stderr);const x=JSON.parse(r.stdout);
  assert.equal(x.summary.reportedImported,1);assert.equal(x.results.length,1);
  await assert.rejects(access(paths.draftPath),{code:'ENOENT'});
  assert.equal(await readFile(paths.statePath,'utf8'),before);
}));
test('36 CLI --draft exige confirmacao explícita',()=>diskFixture(async({env,paths})=>{
  const r=nodeCli(['--draft'],env);assert.equal(r.status,1);
  assert.match(r.stderr,/CSV_ACK_CONFIRM_REQUIRED/);
  await assert.rejects(access(paths.draftPath),{code:'ENOENT'});
}));
test('37 CLI --draft exige hash correto',()=>diskFixture(async({env,paths})=>{
  const r=nodeCli(['--draft'],{...env,F40_CSV_ACK_CONFIRM:'CONFIRMO_APENAS_RASCUNHO',
    F40_CSV_ACK_EXPECTED_SHA256:'0'.repeat(64)});
  assert.equal(r.status,1);assert.match(r.stderr,/CSV_ACK_PREVIEW_CHANGED/);
  await assert.rejects(access(paths.draftPath),{code:'ENOENT'});
}));
test('38 CLI cria somente rascunho e nunca edita journal',()=>diskFixture(async({env,paths})=>{
  const before=await readFile(paths.statePath,'utf8');
  const preview=JSON.parse(nodeCli(['--preview'],env).stdout).summary;
  const r=nodeCli(['--draft'],{...env,F40_CSV_ACK_CONFIRM:'CONFIRMO_APENAS_RASCUNHO',
    F40_CSV_ACK_EXPECTED_SHA256:preview.previewSha256});
  assert.equal(r.status,0,r.stderr);
  const draft=JSON.parse(await readFile(paths.draftPath,'utf8'));
  assert.equal(draft.decisions[0].result,'UNCERTAIN');
  assert.equal(Object.hasOwn(draft,'acknowledgement'),false);
  assert.equal(await readFile(paths.statePath,'utf8'),before);
}));
test('39 CLI nunca sobrescreve rascunho existente',()=>diskFixture(async({env,paths})=>{
  const preview=JSON.parse(nodeCli(['--preview'],env).stdout).summary;
  await writeFile(paths.draftPath,'arquivo antigo');
  const r=nodeCli(['--draft'],{...env,F40_CSV_ACK_CONFIRM:'CONFIRMO_APENAS_RASCUNHO',
    F40_CSV_ACK_EXPECTED_SHA256:preview.previewSha256});
  assert.equal(r.status,1);assert.match(r.stderr,/CSV_ACK_DRAFT_EXISTS/);
  assert.equal(await readFile(paths.draftPath,'utf8'),'arquivo antigo');
}));
test('40 CLI exige manifesto no caminho exato do CSV',()=>diskFixture(async({env})=>{
  const r=nodeCli(['--preview'],{...env,F40_CSV_ACK_EXPORT_MANIFEST:env.F40_CSV_ACK_SETTINGS});
  assert.equal(r.status,1);assert.match(r.stderr,/CSV_ACK_PATHS_INVALID/);
}));

test('41 aceita cabecalhos brasileiros com acentos e simbolos',()=>{
  const f=fixtureMemory();
  f.settings.columns={orderReference:'Número do Pedido',externalOrderId:'Nº ERP',status:'Situação',
    orderTotal:'Valor (R$)',itemCount:'Qtde. Itens'};
  f.erpCsv=Buffer.from(`"Número do Pedido";"Nº ERP";"Situação";"Valor (R$)";"Qtde. Itens"\r\n"F40-${ID}";"ERP-EXEMPLO-001";"IMPORTADO";"119,90";"1"\r\n`);
  assert.equal(assessErpReturn(f).summary.withFindings,0);
});
test('42 aceita R$ com agrupamento monetario valido e rejeita agrupamento incorreto',()=>{
  const f=fixtureMemory({returnBytes:csv(line(ID,{total:'R$ 119,90'}))});
  assert.equal(assessErpReturn(f).summary.withFindings,0);
  f.erpCsv=csv(line(ID,{total:'1.19,90'}));
  assert.throws(()=>assessErpReturn(f),err('CSV_ACK_AMOUNT_INVALID'));
});
