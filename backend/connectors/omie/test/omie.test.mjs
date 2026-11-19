import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOmieClient,createStoreClient,ConnectorError} from '../clients.mjs';
import {mapOmieProduct,readPhysicalStock,moneyToCents,validateSettings} from '../mapping.mjs';
import {prepareOperation,markDone,lockState,loadState,saveState} from '../state.mjs';
import {synchronize} from '../sync.mjs';
const CATEGORY='11111111-1111-4111-8111-111111111111';
const VARIANT='22222222-2222-4222-8222-222222222222';
const PRODUCT='33333333-3333-4333-8333-333333333333';
const TOKEN=`f40i_${'A'.repeat(43)}`;
const omieProduct={codigo_produto:123,codigo:'SKU-123',descricao:'Camiseta de Algodao',valor_unitario:49.9,ean:'7894900011517',inativo:'N'};
const settings={categoryId:CATEGORY,productIds:[123],syncStock:false};
const noop={log(){},error(){}};

test('valor monetario sem perda por arredondamento',()=>{
  assert.equal(moneyToCents('12.34'),1234);assert.equal(moneyToCents(12.3),1230);
  assert.throws(()=>moneyToCents(12.345),{code:'OMIE_PRICE_INVALID'});
  assert.throws(()=>moneyToCents(-1),{code:'OMIE_PRICE_INVALID'});
});
test('mapeia SKU/GTIN e nao publica produto novo automaticamente',()=>{
  const p=mapOmieProduct(omieProduct,CATEGORY);
  assert.equal(p.externalProductId,'123');assert.equal(p.variants[0].priceCents,4990);
  assert.equal(p.variants[0].gtin,'7894900011517');assert.equal(p.status,undefined);
});
test('nao importa variacoes ainda sem mapeamento e nao aceita GTIN invalido',()=>{
  assert.throws(()=>mapOmieProduct({...omieProduct,id_produto_variacao:10},CATEGORY),{code:'OMIE_VARIATION_REQUIRES_MAPPING'});
  assert.throws(()=>mapOmieProduct({...omieProduct,ean:'0000000000001'},CATEGORY),{code:'OMIE_GTIN_INVALID'});
});
test('estoque fisico e inteiro, sem confundir saldo/reservado',()=>{
  assert.equal(readPhysicalStock({produtos:[{nCodProd:123,codigo_local_estoque:2,fisico:7,nSaldo:3,reservado:4}]},123,2),7);
  assert.throws(()=>readPhysicalStock({produtos:[{nCodProd:123,fisico:2.5}]},123,null),{code:'OMIE_STOCK_NOT_INTEGER'});
  assert.throws(()=>readPhysicalStock({produtos:[{nCodProd:123}]},123,null),{code:'OMIE_STOCK_MISSING'});
  assert.throws(()=>readPhysicalStock({produtos:[]},123,null),{code:'OMIE_STOCK_NOT_UNIQUE'});
});
test('valida lista explicita e categoria para evitar importar a loja toda',()=>{
  assert.throws(()=>validateSettings({categoryId:CATEGORY,productIds:[123,123]}),{code:'INVALID_PRODUCT_IDS'});
  assert.throws(()=>validateSettings({categoryId:'nope',productIds:[123]}),{code:'INVALID_CATEGORY_ID'});
});
test('cliente Omie chama apenas endpoint aprovado com Bearer e lida com erro sem vazar credenciais',async()=>{
  let called=false;
  const client=createOmieClient({token:'segredo-de-teste-longuissimo',fetchImpl:async(url,opts)=>{
    called=true;assert.equal(url,'https://app.omie.com.br/api/v1/geral/produtos/');
    assert.equal(opts.headers.Authorization,'Bearer segredo-de-teste-longuissimo');
    assert.equal(JSON.parse(opts.body).call,'ConsultarProduto');return {ok:true,json:async()=>omieProduct};
  }});
  assert.equal((await client.call('products','ConsultarProduto',{codigo_produto:123})).descricao,omieProduct.descricao);
  assert.ok(called);await assert.rejects(client.call('products','ExcluirProduto',{}),{code:'OMIE_OPERATION_NOT_ALLOWED'});
});
test('API Store limita rota, autentica e proibe HTTP externo',async()=>{
  assert.throws(()=>createStoreClient({url:'http://example.com/',token:TOKEN}),{code:'INVALID_STORE_URL'});
  let methods=[];const client=createStoreClient({url:'https://store.example/',token:TOKEN,fetchImpl:async (url,opts)=>{
    methods.push(opts.method);assert.ok(url.startsWith('https://store.example/v1/external/'));return {ok:true,json:async()=>({ok:true})};
  }});
  await client.request('/v1/external/catalog/categories');
  await assert.rejects(client.request('/v1/admin/delete'),{code:'STORE_PATH_NOT_ALLOWED'});
  assert.deepEqual(methods,['GET']);
});
test('arquivo de estado preserva evento pendente e bloqueia dois processos',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'f40-omie-'));const file=join(dir,'state.json');
  const unlock=await lockState(file);
  await assert.rejects(lockState(file),{code:'STATE_LOCKED'});
  const s=await loadState(file);const a=prepareOperation(s,'catalog:123','hash1',1000);
  await saveState(file,s);
  assert.equal(prepareOperation(s,'catalog:123','hash1',1001).operation.eventId,a.operation.eventId);
  markDone(s,'catalog:123');await saveState(file,s);
  assert.equal(prepareOperation(s,'catalog:123','hash1',1002).skip,true);
  assert.ok(prepareOperation(s,'catalog:123','hash2',1003).operation.version>1000);
  await unlock();assert.equal((await readFile(file,'utf8')).includes('hash1'),true);
});
test('preview nunca escreve no Store App',async()=>{
  const omie={call:async()=>omieProduct};
  const r=await synchronize({omie,settings,apply:false,logger:noop,throttleMs:0});
  assert.deepEqual({mode:r.mode,examined:r.examined,skipped:r.skipped}, {mode:'PREVIEW',examined:1,skipped:0});
});
test('aplicacao unica e replay sem segundo POST para o mesmo hash',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'f40-omie-'));const file=join(dir,'state.json');
  const state=await loadState(file);let writes=0;
  const omie={call:async()=>omieProduct};
  const store={request:async (path,opts)=>{
    if(path==='/v1/external/catalog/products/upsert') {writes++;assert.equal(opts.method,'POST');return {externalProductId:'123',productId:PRODUCT};}
    if(path.includes('/catalog/variants?'))return {variants:[{externalId:'123',variantId:VARIANT}],hasMore:false};
    throw new Error('unrecognized path '+path);
  }};
  const a=await synchronize({omie,store,settings,apply:true,state,statePath:file,logger:noop,throttleMs:0});
  const b=await synchronize({omie,store,settings,apply:true,state,statePath:file,logger:noop,throttleMs:0});
  assert.equal(a.imported,1);assert.equal(b.imported,0);assert.equal(writes,1);
});
test('reenvia exatamente mesmo eventId apos resposta perdida',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'f40-omie-'));const file=join(dir,'state.json');
  const state=await loadState(file);let ids=[];
  const omie={call:async()=>omieProduct};
  const store={request:async(path,opts)=>{
    if(path==='/v1/external/catalog/products/upsert'){
      ids.push(opts.body.eventId);
      if(ids.length===1)throw new ConnectorError('STORE_NETWORK_ERROR',true);
      return {externalProductId:'123',productId:PRODUCT};
    }
    if(path.includes('/catalog/variants?'))return {variants:[{externalId:'123',variantId:VARIANT}],hasMore:false};
  }};
  const a=await synchronize({omie,store,settings,apply:true,state,statePath:file,logger:noop,throttleMs:0});
  const b=await synchronize({omie,store,settings,apply:true,state,statePath:file,logger:noop,throttleMs:0});
  assert.equal(a.skipped,1);assert.equal(b.imported,1);assert.equal(ids[0],ids[1]);
});
test('sincroniza estoque pela rota propria apos catalogo, preservando escopo',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'f40-omie-'));const file=join(dir,'state.json');
  const state=await loadState(file);let stockCalls=0;
  const omie={call:async(section)=>section==='products'?omieProduct:{produtos:[{nCodProd:123,codigo_local_estoque:1,fisico:5,reservado:2,nSaldo:3}]}};
  const store={request:async (path,opts)=>{
    if(path==='/v1/external/catalog/products/upsert')return {externalProductId:'123',productId:PRODUCT};
    if(path.includes('/catalog/variants?'))return {variants:[{externalId:'123',variantId:VARIANT}],hasMore:false};
    if(path===`/v1/external/inventory/${VARIANT}`){stockCalls++;assert.equal(opts.body.onHand,5);return {onHand:5};}
    throw Error('unexpected');
  }};
  const config={...settings,syncStock:true,warehouseId:1};
  const a=await synchronize({omie,store,settings:config,apply:true,state,statePath:file,logger:noop,throttleMs:0});
  const b=await synchronize({omie,store,settings:config,apply:true,state,statePath:file,logger:noop,throttleMs:0});
  assert.equal(a.inventoryUpdated,1);assert.equal(b.inventoryUpdated,0);assert.equal(stockCalls,1);
});
