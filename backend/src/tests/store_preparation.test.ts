import test from 'node:test';
import assert from 'node:assert/strict';
import {storeReadiness} from '../services/store_readiness.js';
import {clientConfigurationInput,clientArtifacts,profileForClient} from '../services/client_configuration.js';
import {clientArguments} from '../services/client_config_files.js';
import {provisionStore} from '../services/store_provisioning.js';
import type {Pool} from 'pg';

const id='10000000-0000-4000-8000-000000000001',owner='20000000-0000-4000-8000-000000000001';
const raw=()=>({schemaVersion:1,store:{name:'Vila Moda',slug:'vila-demo',mode:'DEMO',ownerEmail:'owner@example.invalid'},
  app:{apiBaseUrl:'https://api.example.invalid',applicationId:'br.com.vila.demo',displayName:'Vila Moda Demo',environment:'demo'}});
const ready=()=>({isDemo:false,publicDemoLogin:false,publishedProducts:2,availableVariants:3,missingParcels:0,
  originConfigured:true,members:1,profile:{displayName:'Vila Moda',logoUrl:'https://example.invalid/logo.png',
    supportPhone:'11999999999',offlineMethods:['PAY_ON_PICKUP'],privacyUrl:'https://example.invalid/p',termsUrl:'https://example.invalid/t',returnsUrl:'https://example.invalid/r'},
  fulfillment:{pickupAddress:'Rua da Loja, 20',pickupHours:'9h às 18h',localEnabled:true,localFeeCents:700,
    localEstimate:'Dois dias úteis',localPostalRanges:[{start:'01000000',end:'01999999'}]},
  onlineConfigured:false,carrierConfigured:false,carrierSandbox:true});

test('preparação considera pagamentos locais sem declarar gateway pronto',()=>{
  const value=storeReadiness(ready());
  assert.equal(value.channels.pickup,true);assert.equal(value.channels.offlinePayment,true);
  assert.equal(value.channels.onlinePayment,false);assert.equal(value.channels.localDelivery,false);
  assert.equal(value.progress.completed,6);
});
test('entrega local precisa de área, prazo e pagamento compatível; pagar na retirada não basta',()=>{
  const input=ready();input.profile.offlineMethods=['MANUAL_PIX'];
  assert.equal(storeReadiness(input).channels.localDelivery,true);
  input.fulfillment.localPostalRanges=[];assert.equal(storeReadiness(input).channels.localDelivery,false);
});
test('demo não declara canais reais mesmo com tokens cadastrados',()=>{
  const value=storeReadiness({...ready(),isDemo:true,publicDemoLogin:true,onlineConfigured:true,carrierConfigured:true,carrierSandbox:false});
  assert.equal(value.mode,'DEMO');assert.equal(value.channels.demoLogin,true);
  assert.equal(value.channels.onlinePayment,false);assert.equal(value.channels.carrierDelivery,false);
  assert.equal(value.channels.offlinePayment,false);assert.equal(value.channels.localDelivery,false);
});
test('transportadora exige origem, medidas, pagamento e ambiente fora do sandbox',()=>{
  const input={...ready(),onlineConfigured:true,carrierConfigured:true,carrierSandbox:false};
  assert.equal(storeReadiness(input).channels.carrierDelivery,true);
  assert.equal(storeReadiness({...input,missingParcels:1}).channels.carrierDelivery,false);
  assert.equal(storeReadiness({...input,carrierSandbox:true}).channels.carrierDelivery,false);
  assert.equal(storeReadiness({...input,originConfigured:false}).channels.carrierDelivery,false);
});
test('produto publicado sem estoque e perfil incompleto deixam pendências claras',()=>{
  const value=storeReadiness({...ready(),availableVariants:0,profile:{offlineMethods:[]}});
  assert.equal(value.checks.catalog,false);assert.equal(value.checks.identity,false);
  assert.equal(value.channels.pickup,false);
  assert.ok(value.steps.every(step=>step.route.startsWith('/admin/')));
});
test('configuração estrita rejeita segredos, modo contraditório, URL insegura e IDs compartilhados entre ambientes',()=>{
  const sample=raw();assert.equal(clientConfigurationInput.safeParse(sample).success,true);
  const bad=[{...sample,DATABASE_URL:'postgres://secret'},
    {...sample,app:{...sample.app,token:'private'}},
    {...sample,app:{...sample.app,apiBaseUrl:'https://user:password@example.invalid'}},
    {...sample,app:{...sample.app,apiBaseUrl:'http://example.invalid'}},
    {...sample,app:{...sample.app,apiBaseUrl:'not-a-url'}},
    {...sample,app:{...sample.app,environment:'producao'}},
    {...sample,app:{...sample.app,applicationId:'br.com.vila'}},
    {...sample,brand:{offlineMethods:['MANUAL_PIX']}}];
  for(const input of bad)assert.equal(clientConfigurationInput.safeParse(input).success,false);
});
test('artefatos do app contêm somente configuração pública e exigem UUID resolvido',()=>{
  const config=clientConfigurationInput.parse(raw());assert.throws(()=>clientArtifacts(config),/store.id/);
  config.store.id=id;
  const result=clientArtifacts(config);assert.equal(result.defines.LOJA_EXPECTED_STORE_ID,id);
  assert.equal(result.defines.LOJA_EXPECTED_STORE_MODE,'DEMO');assert.equal(result.android.useFirebase,false);
  assert.equal(JSON.stringify(result).includes(config.store.ownerEmail),false);
  assert.equal(profileForClient(config).displayName,'Vila Moda');
});
test('produção e homologação usam identificadores distintos e não alteram os parâmetros financeiros',()=>{
  const sample=raw();sample.store.mode='LIVE';sample.app.environment='homologacao';sample.app.applicationId='br.com.vila.hml';
  const config=clientConfigurationInput.parse(sample);config.store.id=id;
  assert.equal(clientArtifacts(config).defines.LOJA_EXPECTED_STORE_MODE,'LIVE');
  config.app.environment='producao';config.app.applicationId='br.com.vila';
  assert.equal(clientArtifacts(config).android.requireReleaseSigning,true);
  assert.equal(Object.keys(clientArtifacts(config).defines).some(k=>/TOKEN|SECRET|PASSWORD|PAYMENT/.test(k)),false);
});
test('provisionamento exige flag exata e não interpreta conteúdo do arquivo como comandos',()=>{
  assert.equal(clientArguments(['--config=loja.json'],true).apply,false);
  assert.equal(clientArguments(['--config=loja.json','--apply'],true).apply,true);
  assert.throws(()=>clientArguments(['--config=loja.json','--apply=false'],true));
  assert.throws(()=>clientArguments(['--config=a','--config=b']));
});

function db(options:{existing?:boolean;wrongOwner?:boolean;wrongMode?:boolean;missingOwner?:boolean;failProfile?:boolean}={}){
  const statements:{sql:string;values:unknown[]}[]=[];
  const query=async(sql:string,values:unknown[]=[])=>{
    statements.push({sql,values});const result=(rows:unknown[])=>({rowCount:rows.length,rows});
    if(sql.includes('FROM users'))return result(options.missingOwner?[]:[{id:owner}]);
    if(sql.includes('FROM stores WHERE slug'))return result(options.existing?[{id,name:'Loja preservada',status:'ACTIVE',is_demo:!options.wrongMode}]:[]);
    if(sql.includes('FROM store_memberships'))return result(options.wrongOwner?[]:[{}]);
    if(options.failProfile&&sql.includes('INSERT INTO store_profiles'))throw new Error('Falha simulada');
    return result([]);
  };
  return {pool:{connect:async()=>({query,release(){}})} as unknown as Pick<Pool,'connect'>,statements};
}
test('plano de loja nova executa transação somente leitura sem escrever',async()=>{
  const f=db();const result=await provisionStore(f.pool,clientConfigurationInput.parse(raw()));
  assert.equal(result.action,'CREATE_PLANNED');assert.equal(f.statements[0].sql,'BEGIN READ ONLY');
  assert.equal(f.statements.some(s=>/INSERT|UPDATE|DELETE/.test(s.sql)),false);
});
test('apply cria loja demo, perfil e proprietário, sem catálogo, senha ou pagamento',async()=>{
  const f=db();const result=await provisionStore(f.pool,clientConfigurationInput.parse(raw()),true);
  assert.equal(result.action,'CREATED');assert.ok(result.storeId);
  assert.equal(f.statements.find(s=>s.sql.includes('INSERT INTO stores('))!.values[3],true);
  assert.equal(f.statements.some(s=>/INSERT INTO (products|orders|payments|users)/.test(s.sql)),false);
  assert.ok(f.statements.some(s=>s.sql==='COMMIT'));
});
test('repetir com loja existente não sobrescreve perfil, equipe ou dados comerciais',async()=>{
  const f=db({existing:true});const result=await provisionStore(f.pool,clientConfigurationInput.parse(raw()),true);
  assert.equal(result.action,'EXISTING_UNCHANGED');assert.equal(result.applied,false);
  assert.equal(f.statements.some(s=>/INSERT|UPDATE|DELETE/.test(s.sql)),false);
});
for(const [name,options] of [['outro proprietário',{existing:true,wrongOwner:true}],
  ['modo comercial no slug demo',{existing:true,wrongMode:true}],['conta inexistente',{missingOwner:true}]] as const){
  test(`${name} impede provisionamento sem mudança parcial`,async()=>{
    const f=db(options);await assert.rejects(provisionStore(f.pool,clientConfigurationInput.parse(raw()),true));
    assert.equal(f.statements.some(s=>/INSERT|UPDATE|DELETE/.test(s.sql)),false);
    assert.ok(f.statements.some(s=>s.sql==='ROLLBACK'));
  });
}
test('falha ao criar perfil desfaz a transação inteira',async()=>{
  const f=db({failProfile:true});await assert.rejects(provisionStore(f.pool,clientConfigurationInput.parse(raw()),true));
  assert.equal(f.statements.some(s=>s.sql==='COMMIT'),false);
  assert.ok(f.statements.some(s=>s.sql==='ROLLBACK'));
});
