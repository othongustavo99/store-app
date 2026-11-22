import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {assessProfile, validateProfile, MATRIX, reportMarkdown} from '../assessment.mjs';

const cliPath=fileURLToPath(new URL('../cli.mjs',import.meta.url));
const examplePath=fileURLToPath(new URL('../example_bling.json',import.meta.url));
const sample=JSON.parse(await readFile(new URL('../example_bling.json',import.meta.url),'utf8'));
const clone=(p=sample)=>structuredClone(p);
const has=(result,code)=>result.hardBlockers.some(x=>x.code===code);
const pending=(result,code)=>result.pendingChecks.some(x=>x.code===code);

test('URL de arquivo no Windows conserva a unidade sem duplicar C:',()=>{
 const url=new URL('file:///C:/Users/Teste%20Usuario/projeto/cli.mjs');
 assert.equal(fileURLToPath(url,{windows:true}), 'C:\\Users\\Teste Usuario\\projeto\\cli.mjs');
});

test('valida o exemplo oficial e devolve parecer offline conservador',()=>{
 const r=assessProfile(sample);
 assert.equal(r.verdict,'DISCOVERY_PENDING');
 assert.equal(r.productionAuthorized,false);
 assert.equal(r.summary.hardBlockers,0);
 assert.ok(pending(r,'EVIDENCE_PENDING_ACCESSVALIDATED'));
});
test('sem interface autorizada fica bloqueado',()=>{
 const p=clone();p.transport='none';assert.ok(has(assessProfile(p),'NO_INTERFACE'));
});
test('API de outro fornecedor requer conector individual',()=>{
 const p=clone();p.transport='api';p.provider='other';assert.ok(has(assessProfile(p),'API_CUSTOM_CONNECTOR'));
});
test('conector não pode ser atribuído a fornecedor desconhecido',()=>{
 const p=clone();p.provider='other';assert.throws(()=>validateProfile(p),/CONECTOR_NAO_EXISTE/);
});
test('CSV nao envia pedidos automaticamente, apenas gera arquivo assistido',async()=>{
 const csv=JSON.parse(await readFile(new URL('../example_csv.json',import.meta.url),'utf8'));
 assert.ok(has(assessProfile(csv),'UNSUPPORTED_ORDER_EXPORT'));
 assert.ok(has(assessProfile(csv),'PROVIDER_UNSUPPORTED_ORDER_EXPORT'));
 assert.match(assessProfile(csv).implementation.note,/importação MANUAL/);
});
test('CSV aceita grades sem marcar adaptação de grades obrigatória',()=>{
 const p=clone();p.provider='other';p.transport='csv';p.operation.variants=true;
 assert.equal(has(assessProfile(p),'VARIANTS_VENDOR_CONNECTOR'),false);
});
test('grade de ERP com API simples exige adaptação',()=>{
 const p=clone();p.operation.variants=true;assert.ok(has(assessProfile(p),'VARIANTS_VENDOR_CONNECTOR'));
});
test('estoque por vários depósitos exige suporte específico',()=>{
 const p=clone();p.operation.multipleWarehouses=true;assert.ok(has(assessProfile(p),'MULTI_WAREHOUSE_STOCK'));
});
test('estoque fracionário não pode ser importado',()=>{
 const p=clone();p.operation.fractionalStock=true;assert.ok(has(assessProfile(p),'FRACTIONAL_STOCK'));
});
for(const [key,code] of [['delivery','ORDER_DELIVERY'],['discounts','ORDER_DISCOUNTS'],['splitPayments','ORDER_SPLIT_PAYMENTS']]) {
 test(`pedido com ${key} sinaliza escopo ausente`,()=>{
   const p=clone();p.operation[key]=true;assert.ok(has(assessProfile(p),code));
 });
}
test('fiscal nunca é classificado como homologado pelo conector',()=>{
 const p=clone();p.requiredFlows.push('fiscal_reference');
 p.vendorCapabilities.fiscal_reference='confirmed';
 assert.ok(has(assessProfile(p),'FISCAL_NOT_IMPLEMENTED'));
});
test('fornecedor informa fluxo indisponível e bloqueia',()=>{
 const p=clone();p.vendorCapabilities.stock_import='unsupported';
 assert.ok(has(assessProfile(p),'PROVIDER_UNSUPPORTED_STOCK_IMPORT'));
});
test('sem evidência de origem oficial do estoque há pendência',()=>{
 const p=clone();assert.ok(pending(assessProfile(p),'EVIDENCE_PENDING_STOCKAUTHORITYDEFINED'));
});
test('dados de comprador dependem de autorização',()=>{
 const p=clone();p.evidence.customerDataAuthorization='unsupported';
 assert.ok(has(assessProfile(p),'EVIDENCE_UNAVAILABLE_CUSTOMERDATAAUTHORIZATION'));
});
test('escopo atendido e evidência pronta ainda exige piloto',()=>{
 const p=clone();Object.keys(p.vendorCapabilities).forEach(k=>p.vendorCapabilities[k]='confirmed');
 Object.keys(p.evidence).forEach(k=>p.evidence[k]='confirmed');p.evidence.pilotReconciled='unconfirmed';
 assert.equal(assessProfile(p).verdict,'READY_FOR_ASSISTED_PILOT');
 assert.equal(assessProfile(p).productionAuthorized,false);
});
test('piloto reconciliado só permite revisão humana',()=>{
 const p=clone();Object.keys(p.vendorCapabilities).forEach(k=>p.vendorCapabilities[k]='confirmed');
 Object.keys(p.evidence).forEach(k=>p.evidence[k]='confirmed');
 assert.equal(assessProfile(p).verdict,'MANUAL_PRODUCTION_REVIEW');
 assert.equal(assessProfile(p).productionAuthorized,false);
});
test('piloto reprovado é impeditivo',()=>{
 const p=clone();p.evidence.pilotReconciled='unsupported';
 assert.ok(has(assessProfile(p),'PILOT_FAILED_OR_UNAVAILABLE'));
});
test('campo desconhecido/senha é rejeitado',()=>{
 const p=clone();p.apiToken='supersecret';assert.throws(()=>validateProfile(p),/CAMPOS_NAO_PERMITIDOS/);
});
test('campo token aninhado é rejeitado',()=>{
 const p=clone();p.evidence.refreshToken='abc';assert.throws(()=>validateProfile(p),/CAMPOS_NAO_PERMITIDOS/);
});
test('alias não aceita email CPF espaço ou caracteres especiais',()=>{
 for(const name of ['contato@loja.com','12345678900','Loja Cliente','abc/../segredo','ab']){
  const p=clone();p.storeAlias=name;assert.throws(()=>validateProfile(p),/ALIAS_INVALIDO/);
 }
});
test('não aceita fluxo repetido',()=>{
 const p=clone();p.requiredFlows.push('stock_import');assert.throws(()=>validateProfile(p),/LISTA_INVALIDA/);
});
test('não aceita status não verificados inventados',()=>{
 const p=clone();p.evidence.accessValidated='probably';assert.throws(()=>validateProfile(p),/VALOR_INVALIDO/);
});
test('não ecoa dados do perfil original no relatório',()=>{
 const r=JSON.stringify(assessProfile(sample));assert.doesNotMatch(r,/token|authorization: bearer|@example\.com/i);
});
test('relatório markdown contém bloqueios e produção desautorizada',()=>{
 const r=reportMarkdown(assessProfile(sample));
 assert.match(r,/Produção autorizada: \*\*NÃO\*\*/);
 assert.match(r,/Evidências pendentes/);
});
test('matriz inclui os três ERPs e CSV, sem declarar fiscal',()=>{
 for(const k of ['bling','omie','olist','csv']) assert.ok(MATRIX[k]);
 for(const item of Object.values(MATRIX)) assert.ok(!item.flows.includes('fiscal_reference'));
});
test('CLI JSON gera parecer sem fazer requisições',()=>{
 const result=spawnSync(process.execPath,[cliPath,'--input',examplePath,'--format','json'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const doc=JSON.parse(result.stdout);assert.equal(doc.productionAuthorized,false);
});
test('CLI falha fechado quando arquivo é inexistente',()=>{
 const result=spawnSync(process.execPath,[cliPath,'--input','/__arquivo_que_nao_existe__.json'],{encoding:'utf8'});
 assert.equal(result.status,2);assert.match(result.stderr,/ENTRADA_OU_SAIDA_INVALIDA/);
});
test('CLI não sobrescreve arquivo existente',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'f40-assess-'));
 try{
  const args=[cliPath,'--input',examplePath,'--format','md','--output',join(dir,'relatorio.md')];
  assert.equal(spawnSync(process.execPath,args,{encoding:'utf8'}).status,0);
  const again=spawnSync(process.execPath,args,{encoding:'utf8'});
  assert.equal(again.status,2);assert.match(again.stderr,/ARQUIVO_SAIDA_JA_EXISTE/);
 } finally { await rm(dir,{recursive:true,force:true}); }
});

test('gate de piloto bloqueia perfil com descoberta pendente',()=>{
 const proc=spawnSync(process.execPath,[cliPath,'--input',examplePath,'--gate','pilot'],{encoding:'utf8'});
 assert.equal(proc.status,3);assert.match(proc.stdout,/DISCOVERY_PENDING/);
});
test('gate de revisão exige piloto reconciliado',()=>{
 const proc=spawnSync(process.execPath,[cliPath,'--input',examplePath,'--gate','review'],{encoding:'utf8'});
 assert.equal(proc.status,3);
});
