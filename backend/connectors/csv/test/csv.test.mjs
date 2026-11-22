import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CsvIntegrationError,parseCsv,toCents,prepareCsvImport,validateConfig,checkGtin} from '../mapping.mjs';
import {loadState,saveState,operationFor,markDone,lockState} from '../state.mjs';
import {createStoreClient} from '../store_client.mjs';
import {synchronizeCsv} from '../sync.mjs';
const STORE='11111111-1111-4111-8111-111111111111';
const CONN='55555555-5555-4555-8555-555555555555';
const CAT='22222222-2222-4222-8222-222222222222';
const PID='33333333-3333-4333-8333-333333333333';
const VID='44444444-4444-4444-8444-444444444444';
const config=(extra={})=>({schema:1,storeId:STORE,integrationId:CONN,categoryId:CAT,delimiter:';',decimalSeparator:',',stockMode:'DISABLED',
  columns:{externalProductId:'produto',externalVariantId:'variante',sku:'sku',name:'descricao',price:'preco',stock:'saldo'},...extra});
const csv=(price='129,90',stock='5')=>`produto;variante;sku;descricao;preco;saldo\nP01;V01;CAMISA-P;Camiseta basica;${price};${stock}\n`;
const physical=()=>config({stockMode:'PHYSICAL',physicalStockConfirmed:true,snapshotAt:'2026-11-21T10:00:00Z'});
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof CsvIntegrationError&&e.code===code);
function mockStore(){
  const calls=[];
  return {calls,request:async(path,opts={})=>{
    calls.push({path,...opts});
    if(path.includes('/catalog/products/upsert'))return {externalProductId:'P01',productId:PID};
    if(path.startsWith('/v1/external/catalog/variants'))return {variants:[{externalId:'V01',variantId:VID}],hasMore:false};
    if(path.includes('/inventory/'))return {onHand:opts.body.onHand};
    throw Error('Unexpected path');
  }};
}
async function withState(callback){
  const dir=await mkdtemp(join(tmpdir(),'f40csv-'));const path=join(dir,'state.json');
  try{return await callback({path,dir,state:await loadState(path,STORE,CONN)});}
  finally{await rm(dir,{recursive:true,force:true});}
}
test('01 CSV com aspas, delimitador e BOM UTF-8',()=>{
  const obj=parseCsv('\ufeffid;nome\r\n1;"Camisa; gola ""V"""\r\n');
  assert.deepEqual(obj.rows,[['1','Camisa; gola "V"']]);
});
test('02 arquivos malformados nao sao aceitos',()=>{
  reject(()=>parseCsv('a;b\n1;"incompleto'),'CSV_QUOTE_UNCLOSED');
  reject(()=>parseCsv('a;b\n1;2;3'),'CSV_ROW_COLUMNS_MISMATCH');
  reject(()=>parseCsv('a;a\n1;2'),'CSV_HEADER_INVALID');
});
test('03 layout de colunas configuravel sem adivinhar mapeamentos',()=>{
  assert.equal(prepareCsvImport(csv(),config()).products[0].variants[0].sku,'CAMISA-P');
  reject(()=>prepareCsvImport(csv(),config({columns:{...config().columns,name:'titulo'}})),'CSV_MAPPED_HEADER_NOT_FOUND');
  reject(()=>validateConfig(config({columns:{externalProductId:'id',externalVariantId:'id',sku:'sku',name:'nome',price:'preco'}})),'CSV_COLUMN_MAP_COLLISION');
});
test('04 centavos no formato brasileiro, sem separador de milhar',()=>{
  assert.equal(toCents('129,90',','),12990);
  assert.equal(toCents('5',','),500);
  reject(()=>toCents('1.299,90',','),'CSV_PRICE_INVALID');
  reject(()=>toCents('1,999',','),'CSV_PRICE_INVALID');
  reject(()=>toCents('0,00',','),'CSV_PRICE_INVALID');
});
test('05 estoque fisico deve ser inteiro nao negativo',()=>{
  assert.equal(prepareCsvImport(csv(),physical()).products[0].stocks[0].onHand,5);
  reject(()=>prepareCsvImport(csv('129,90','2,5'),physical()),'CSV_STOCK_INVALID');
  reject(()=>prepareCsvImport(csv('129,90','-1'),physical()),'CSV_STOCK_INVALID');
});
test('06 SKU e variantes duplicados sao rejeitados antes de escrita',()=>{
  const twice=csv()+`P02;V01;CAMISA-M;Outra camiseta;99,90;5\n`;
  reject(()=>prepareCsvImport(twice,config()),'CSV_DUPLICATE_VARIANT');
  const sameSku=csv()+`P02;V02;CAMISA-P;Outra camiseta;99,90;5\n`;
  reject(()=>prepareCsvImport(sameSku,config()),'CSV_DUPLICATE_VARIANT');
});
test('07 produto com multiplas variantes forma um unico upsert',()=>{
  const content=csv().replace('preco;saldo','preco;saldo;tamanho').replace('129,90;5','129,90;5;P')+`P01;V02;CAMISA-M;Camiseta basica;129,90;3;M\n`;
  const plan=prepareCsvImport(content,config({columns:{...config().columns,size:'tamanho'}}));
  assert.equal(plan.products.length,1);assert.equal(plan.variantCount,2);assert.equal(plan.products[0].variants.length,2);
});
test('08 rejeita produto com nomes divergentes e varias combinacoes iguais',()=>{
  reject(()=>prepareCsvImport(csv()+`P01;V02;CAMISA-M;Outra;120,00;2\n`,config()),'CSV_PRODUCT_NAME_CONFLICT');
  reject(()=>prepareCsvImport(csv()+`P01;V02;CAMISA-M;Camiseta basica;120,00;2\n`,config()),'CSV_VARIANT_COMBINATION_DUPLICATE');
});
test('09 GTIN de controle; nao aceitar GTIN malformado',()=>{
  assert.equal(checkGtin('96385074'),true);
  assert.equal(checkGtin('96385075'),false);
  const withGtin={...config(),columns:{...config().columns,gtin:'ean'}};
  const c=csv().replace('preco;saldo','preco;saldo;ean').replace('129,90;5','129,90;5;96385075');
  reject(()=>prepareCsvImport(c,withGtin),'CSV_GTIN_INVALID');
});
test('10 status somente com mapeamento explicitamente conhecido',()=>{
  const settings=config({columns:{...config().columns,status:'status'},statusValues:{active:['A'],inactive:['I']}});
  const c=csv().replace('preco;saldo','preco;saldo;status').replace('129,90;5','129,90;5;A');
  assert.equal(prepareCsvImport(c,settings).products[0].variants[0].status,'ACTIVE');
  reject(()=>prepareCsvImport(c.replace(';A\n',';DESCONHECIDO\n'),settings),'CSV_STATUS_UNKNOWN');
});
test('11 preview nao faz rede, nao grava estoque nem cria estado',async()=>{
  const output=await synchronizeCsv({content:csv(),config:config(),apply:false});
  assert.equal(output.mode,'PREVIEW');assert.equal(output.imported,0);assert.equal(output.products,1);
});
test('12 aplicar importa uma vez e repetir nao duplica',async()=>withState(async({path,state})=>{
  const store=mockStore();
  const one=await synchronizeCsv({content:csv(),config:config(),apply:true,store,state,statePath:path});
  const two=await synchronizeCsv({content:csv(),config:config(),apply:true,store,state,statePath:path});
  assert.equal(one.imported,1);assert.equal(two.unchanged,1);
  assert.equal(store.calls.filter(c=>c.method==='POST').length,1);
}));
test('13 arquivo alterado exige nova versao e novo evento',async()=>withState(async({path,state})=>{
  const store=mockStore();
  await synchronizeCsv({content:csv(),config:config(),apply:true,store,state,statePath:path});
  await synchronizeCsv({content:csv('139,90'),config:config(),apply:true,store,state,statePath:path});
  const posts=store.calls.filter(c=>c.method==='POST');
  assert.equal(posts.length,2);
  assert.notEqual(posts[0].body.eventId,posts[1].body.eventId);
  assert.ok(posts[1].body.sourceVersion>posts[0].body.sourceVersion);
}));
test('14 queda apos POST reutiliza a mesma chave idempotente',async()=>withState(async({path,state})=>{
  const calls=[];let first=true;
  const store={request:async(path,opts)=>{calls.push(opts.body);if(first){first=false;throw Error('timeout simulado');}return {externalProductId:'P01',productId:PID};}};
  const a=await synchronizeCsv({content:csv(),config:config(),apply:true,store,state,statePath:path});
  const b=await synchronizeCsv({content:csv(),config:config(),apply:true,store,state,statePath:path});
  assert.equal(a.errors.length,1);assert.equal(b.imported,1);
  assert.equal(calls[0].eventId,calls[1].eventId);
  assert.equal(calls[0].sourceVersion,calls[1].sourceVersion);
}));
test('15 nao substitui evento pendente por arquivo alterado',async()=>withState(async({path,state})=>{
  const store={request:async()=>{throw Error('timeout');}};
  await synchronizeCsv({content:csv(),config:config(),apply:true,store,state,statePath:path});
  const result=await synchronizeCsv({content:csv('149,90'),config:config(),apply:true,store,state,statePath:path});
  assert.equal(result.errors[0].code,'CSV_PREVIOUS_OPERATION_PENDING');
}));
test('16 estoque altera apenas por endpoint dedicado com UUID resolvido',async()=>withState(async({path,state})=>{
  const store=mockStore();
  const out=await synchronizeCsv({content:csv(),config:physical(),apply:true,store,state,statePath:path});
  assert.equal(out.stockUpdated,1);
  const post=store.calls.find(c=>c.method==='POST');
  assert.equal(post.body.variants[0].onHand,undefined);
  const put=store.calls.find(c=>c.method==='PUT');
  assert.equal(put.path,`/v1/external/inventory/${VID}`);assert.equal(put.body.onHand,5);
}));
test('17 falha de estoque nunca marca sincronizacao concluida',async()=>withState(async({path,state})=>{
  const core=mockStore();
  const store={request:async(p,o)=>p.includes('/inventory/')?Promise.reject(Error('reservado > fisico')):core.request(p,o)};
  const result=await synchronizeCsv({content:csv(),config:physical(),apply:true,store,state,statePath:path});
  assert.equal(result.stockUpdated,0);assert.equal(result.errors.length,1);
  assert.equal(state.operations['stock:V01'].done,false);
}));
test('18 journal nao pode ser usado em outra loja ou conector',async()=>withState(async({path,state})=>{
  await saveState(path,state);
  await assert.rejects(()=>loadState(path,CAT,CONN),{code:'CSV_STATE_TENANT_MISMATCH'});
  const parsed=JSON.parse(await readFile(path,'utf8'));parsed.provider='omie';await saveState(path,parsed);
  await assert.rejects(()=>loadState(path,STORE,CONN),{code:'CSV_STATE_TENANT_MISMATCH'});
}));
test('19 um worker de cada vez por caminho de estado',async()=>withState(async({path})=>{
  const unlock=await lockState(path);
  try{await assert.rejects(lockState(path),{code:'CSV_STATE_LOCKED'});}finally{await unlock();}
}));
test('20 cliente HTTP bloqueia URL nao segura e rotas nao autorizadas',async()=>{
  const secret='f40i_'+'A'.repeat(43);
  reject(()=>createStoreClient({url:'http://servidor.com/',secret}),'CSV_STORE_URL_INVALID');
  reject(()=>createStoreClient({url:'https://lojista.com/?token=abc',secret}),'CSV_STORE_URL_INVALID');
  const client=createStoreClient({url:'https://lojista.com/',secret,fetchImpl:async()=>({ok:true,json:async()=>({})})});
  await assert.rejects(client.request('/v1/stores/segredos'),{code:'CSV_STORE_ROUTE_NOT_ALLOWED'});
});
test('21 importacao invalida falha antes de qualquer escrita remota',async()=>withState(async({path,state})=>{
  const store=mockStore();
  await assert.rejects(synchronizeCsv({content:csv('1.222,00'),config:physical(),apply:true,store,state,statePath:path}),
    {code:'CSV_PRICE_INVALID'});
  assert.equal(store.calls.length,0);
}));
test('22 estado nao mistura duas integracoes da mesma loja',async()=>withState(async({path,state})=>{
  await saveState(path,state);
  await assert.rejects(()=>loadState(path,STORE,CAT),{code:'CSV_STATE_TENANT_MISMATCH'});
}));
test('23 resolucao de variantes faz uma unica varredura por arquivo',async()=>withState(async({path,state})=>{
  const content=csv().replace('preco;saldo','preco;saldo;tamanho').replace('129,90;5','129,90;5;P')+`P01;V02;CAMISA-M;Camiseta basica;129,90;3;M\n`;
  const cfg=physical();cfg.columns={...cfg.columns,size:'tamanho'};
  const calls=[];
  const store={request:async(path,opts={})=>{
    calls.push({path,...opts});
    if(opts.method==='POST')return {externalProductId:'P01',productId:PID};
    if(path.includes('/catalog/variants'))return {variants:[{externalId:'V01',variantId:VID},{externalId:'V02',variantId:CAT}],hasMore:false};
    return {onHand:opts.body.onHand};
  }};
  const out=await synchronizeCsv({content,config:cfg,apply:true,store,state,statePath:path});
  assert.equal(out.errors.length,0);assert.equal(out.stockUpdated,2);
  assert.equal(calls.filter(c=>c.path.includes('/catalog/variants')).length,1);
}));
test('24 identificador externo nao pode contaminar o prototipo do journal',async()=>withState(async({path,state})=>{
  const input=csv().replace('V01','__proto__');
  const store={request:async(p,o)=>{
    if(o?.method==='POST')return {externalProductId:'P01',productId:PID};
    if(p.includes('/catalog/variants'))return {variants:[{externalId:'__proto__',variantId:VID}],hasMore:false};
    return {onHand:5};
  }};
  const out=await synchronizeCsv({content:input,config:physical(),apply:true,store,state,statePath:path});
  assert.equal(out.errors.length,0);
  assert.equal(Object.getPrototypeOf(state.variantIds),null);
  assert.equal(state.variantIds['__proto__'],VID);
}));
test('25 estoque so pode importar snapshot expressamente confirmado',()=>{
  reject(()=>validateConfig(config({stockMode:'PHYSICAL'})),'CSV_PHYSICAL_SNAPSHOT_CONFIRMATION_REQUIRED');
  reject(()=>validateConfig(config({stockMode:'PHYSICAL',physicalStockConfirmed:true,snapshotAt:'ontem'})),'CSV_PHYSICAL_SNAPSHOT_CONFIRMATION_REQUIRED');
});
test('26 impede reimportacao de snapshot de estoque antigo',async()=>withState(async({path,state})=>{
  const store=mockStore();
  await synchronizeCsv({content:csv(),config:physical(),apply:true,store,state,statePath:path});
  const old={...physical(),snapshotAt:'2026-11-20T10:00:00Z'};
  await assert.rejects(synchronizeCsv({content:csv(),config:old,apply:true,store,state,statePath:path}),
    {code:'CSV_PHYSICAL_SNAPSHOT_STALE_OR_CONFLICT'});
}));
test('27 mesmo horario com saldo diferente exige novo snapshot',async()=>withState(async({path,state})=>{
  const store=mockStore();
  await synchronizeCsv({content:csv(),config:physical(),apply:true,store,state,statePath:path});
  await assert.rejects(synchronizeCsv({content:csv('129,90','7'),config:physical(),apply:true,store,state,statePath:path}),
    {code:'CSV_PHYSICAL_SNAPSHOT_STALE_OR_CONFLICT'});
}));
