import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOlistClient,createStoreClient,OlistConnectorError} from '../clients.mjs';
import {mapProduct,stockTotal,cents,validateSettings} from '../mapping.mjs';
import {authorizationUrl,validateCallback,tokenGrant,createTokenManager,startAuthorization,completeAuthorization} from '../auth.mjs';
import {atomicJson,loadState,lockFile,operationFor,markDone} from '../state.mjs';
import {synchronize} from '../sync.mjs';
const CAT='11111111-1111-4111-8111-111111111111';
const VAR='22222222-2222-4222-8222-222222222222';
const PROD='33333333-3333-4333-8333-333333333333';
const TOKEN=`f40i_${'A'.repeat(43)}`;
const settings={categoryId:CAT,productIds:[42],stockSource:'TOTAL',syncStock:false};
const product={id:42,sku:'CAM-01',descricao:'Camiseta Algodao',tipo:'S',tipoVariacao:'N',situacao:'A',gtin:'7894900011517',precos:{preco:59.90},variacoes:[]};
const response=(data,status=200)=>({ok:status>=200&&status<300,status,headers:{get:()=>null},json:async()=>data});
const quiet={log(){},error(){}};
const temp=async()=>mkdtemp(join(tmpdir(),'f40-olist-'));

test('precos em centavos e validacao de entradas',()=>{
  assert.equal(cents(59.9),5990);assert.equal(cents('70.01'),7001);
  assert.throws(()=>cents(0),{code:'OLIST_PRICE_INVALID'});
  assert.throws(()=>cents(59.999),{code:'OLIST_PRICE_INVALID'});
  assert.throws(()=>cents(-1),{code:'OLIST_PRICE_INVALID'});
});
test('produto simples vira payload compatível Store App',()=>{
  const p=mapProduct(product,CAT);assert.equal(p.externalProductId,'42');assert.equal(p.variants[0].priceCents,5990);
  assert.equal(p.variants[0].gtin,'7894900011517');assert.equal(p.variants[0].sku,'CAM-01');
  assert.equal(p.variants[0].status,'ACTIVE');assert.equal(p.status,undefined);
});
test('bloqueia kit, grade, SKU e GTIN incorretos',()=>{
  for(const changed of [{tipo:'K'},{tipo:'V'},{tipoVariacao:'P'},{variacoes:[{id:5}]},{sku:'x'},{gtin:'0000000000001'},{precos:{preco:0}}])
    assert.throws(()=>mapProduct({...product,...changed},CAT));
});
test('estoque importa saldo fisico, nao reservado/disponivel, e bloqueia multideposito',()=>{
  assert.equal(stockTotal({id:42,saldo:9,reservado:2,disponivel:7,depositos:[{id:1}]},42),9);
  assert.throws(()=>stockTotal({id:42,saldo:9,depositos:[{id:1},{id:2}]},42),{code:'OLIST_MULTI_DEPOT_UNSUPPORTED'});
  assert.throws(()=>stockTotal({id:42,saldo:4.5,depositos:[]},42),{code:'OLIST_STOCK_NOT_INTEGER'});
  assert.throws(()=>stockTotal({id:41,saldo:9},42),{code:'OLIST_STOCK_MISMATCH'});
});
test('config exige IDs validos e evita duplicatas',()=>{
  assert.equal(validateSettings(settings).productIds[0],42);
  assert.throws(()=>validateSettings({...settings,productIds:[42,42]}),{code:'PRODUCT_IDS_INVALID'});
  assert.throws(()=>validateSettings({...settings,stockSource:'AVAILABLE'}),{code:'STOCK_SOURCE_UNSUPPORTED'});
});
test('consulta endpoints v3 oficiais e somente GET',async()=>{
  const urls=[];const client=createOlistClient({accessToken:async()=> 'token',fetchImpl:async(url,options)=>{
    urls.push(url);assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer token');
    return response(url.endsWith('/estoque/42')?{id:42,saldo:8,depositos:[]}:product);
  },minGapMs:0});
  assert.equal((await client.product(42)).id,42);assert.equal((await client.stock(42)).saldo,8);
  assert.deepEqual(urls,['https://api.tiny.com.br/public-api/v3/produtos/42','https://api.tiny.com.br/public-api/v3/estoque/42']);
});
test('consulta bloqueia resposta de ID diferente',async()=>{
  const client=createOlistClient({accessToken:async()=> 'token',fetchImpl:async()=>response({...product,id:43}),minGapMs:0});
  await assert.rejects(client.product(42),{code:'OLIST_PRODUCT_MISMATCH'});
});
test('retry de limite 429, mas nao de erro 400',async()=>{
  let n=0;const client=createOlistClient({accessToken:async()=> 'token',fetchImpl:async()=>++n===1?response({},429):response(product),sleep:async()=>{},minGapMs:0});
  assert.equal((await client.product(42)).id,42);assert.equal(n,2);
  const bad=createOlistClient({accessToken:async()=> 'token',fetchImpl:async()=>response({senha:'nao imprimir'},400),minGapMs:0});
  await assert.rejects(bad.product(42),{code:'OLIST_HTTP_400'});
});
test('HTTP 401 tenta refresh de token so uma vez',async()=>{
  let refreshes=0,requests=0;const client=createOlistClient({accessToken:async({force})=>{if(force)refreshes++;return 'token';},fetchImpl:async()=>{requests++;return response({},401);},minGapMs:0});
  await assert.rejects(client.product(42),{code:'OLIST_HTTP_401'});assert.equal(refreshes,1);assert.equal(requests,2);
});
test('OAuth URL e state em callback devem coincidir',()=>{
  const url=authorizationUrl('client-abc','https://empresa.example/callback','a'.repeat(40));
  assert.equal(new URL(url).hostname,'accounts.tiny.com.br');assert.equal(new URL(url).searchParams.get('response_type'),'code');
  const session={state:'a'.repeat(40),createdAt:1000};
  assert.equal(validateCallback('https://empresa.example/callback?state='+session.state+'&code=abc',session,'https://empresa.example/callback',1500),'abc');
  assert.throws(()=>validateCallback('https://empresa.example/callback?state=bad&code=abc',session,'https://empresa.example/callback',1500),{code:'OAUTH_STATE_MISMATCH'});
  assert.throws(()=>validateCallback('https://other.example/callback?state='+session.state+'&code=abc',session,'https://empresa.example/callback',1500),{code:'OAUTH_CALLBACK_MISMATCH'});
  assert.throws(()=>validateCallback('https://empresa.example/callback?state='+session.state+'&code=abc',session,'https://empresa.example/callback',400000),{code:'OAUTH_SESSION_EXPIRED'});
});
test('OAuth codigo e refresh usam endpoint correto e persistem tokens rotativos',async()=>{
  const dir=await temp(),file=join(dir,'tokens.json');let calls=0;
  const fetchImpl=async(url,options)=>{
    calls++;assert.equal(url,'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token');
    const form=new URLSearchParams(options.body);assert.equal(form.get('client_id'),'abc');assert.equal(form.get('client_secret'),'secret');
    if(calls===1){assert.equal(form.get('grant_type'),'authorization_code');assert.equal(form.get('redirect_uri'),'https://empresa.example/callback');}
    else{assert.equal(form.get('grant_type'),'refresh_token');assert.equal(form.get('refresh_token'),'refresh_token_1');}
    return response({access_token:'access_token_'+calls+'_long',refresh_token:'refresh_token_'+calls,expires_in:3600});
  };
  const tokens=await tokenGrant({clientId:'abc',clientSecret:'secret',grantType:'authorization_code',code:'xyz',redirectUri:'https://empresa.example/callback',fetchImpl});
  await atomicJson(file,tokens);
  const manager=createTokenManager({tokenPath:file,clientId:'abc',clientSecret:'secret',fetchImpl});
  assert.equal(await manager.accessToken(),tokens.accessToken);assert.equal(await manager.accessToken({force:true}),'access_token_2_long');
  assert.equal(JSON.parse(await readFile(file,'utf8')).refreshToken,'refresh_token_2');
});
test('OAuth start e finish tem state de uso unico',async()=>{
  const dir=await temp(),file=join(dir,'tokens.json'),pendingPath=file+'.pending.json';
  const url=await startAuthorization({clientId:'abc',redirectUri:'https://empresa.example/callback',pendingPath});
  const callback='https://empresa.example/callback?code=xyz&state='+new URL(url).searchParams.get('state');
  assert.deepEqual(await completeAuthorization({callback,pendingPath,tokenPath:file,clientId:'abc',clientSecret:'secret',redirectUri:'https://empresa.example/callback',fetchImpl:async()=>response({access_token:'access_token_valid_12345',refresh_token:'refresh_token_valid_12345',expires_in:3600})}),{authorized:true});
  await assert.rejects(completeAuthorization({callback,pendingPath,tokenPath:file,clientId:'abc',clientSecret:'secret',redirectUri:'https://empresa.example/callback',fetchImpl:async()=>{throw Error('cannot repeat');}}),{code:'OAUTH_SESSION_EXPIRED'});
});
test('Store App valida token e bloqueia outras rotas',async()=>{
  assert.throws(()=>createStoreClient({url:'http://erp.example/',token:TOKEN}),{code:'STORE_URL_INVALID'});
  assert.throws(()=>createStoreClient({url:'https://app.example/',token:'foo'}),{code:'STORE_TOKEN_INVALID'});
  const client=createStoreClient({url:'https://app.example/',token:TOKEN,fetchImpl:async()=>response({ok:true})});
  await assert.rejects(client.request('/v1/external/orders'),{code:'STORE_ROUTE_BLOCKED'});
  assert.deepEqual(await client.request('/v1/external/catalog/variants?limit=100'),{ok:true});
});
test('estado duravel impede execucao concorrente e repete mesmos ids',async()=>{
  const file=join(await temp(),'state.json'),unlock=await lockFile(file);
  await assert.rejects(lockFile(file),{code:'STATE_LOCKED'});
  const state=await loadState(file),a=operationFor(state,'catalog:42','hash1',1000);
  assert.equal(operationFor(state,'catalog:42','hash1',2000).operation.eventId,a.operation.eventId);
  markDone(state,'catalog:42');assert.equal(operationFor(state,'catalog:42','hash1',3000).skip,true);
  assert.ok(operationFor(state,'catalog:42','hash2',4000).operation.version>a.operation.version);
  await unlock();
});
test('preview nunca grava no Store App',async()=>{
  const out=await synchronize({olist:{product:async()=>product},settings,logger:quiet});
  assert.equal(out.productsUpdated,0);assert.equal(out.mode,'PREVIEW');
});
test('apply vincula produto e execucao repetida nao cria duplicatas',async()=>{
  const file=join(await temp(),'state.json'),state=await loadState(file);let writes=0;
  const store={request:async(path,opts)=>{
    if(path.includes('upsert')){writes++;assert.equal(opts.body.externalProductId,'42');return {externalProductId:'42',productId:PROD};}
    if(path.includes('variants?'))return {variants:[{externalId:'42',variantId:VAR}],hasMore:false};
    throw Error('unexpected:'+path);
  }};
  assert.equal((await synchronize({olist:{product:async()=>product},store,settings,apply:true,state,statePath:file,logger:quiet})).productsUpdated,1);
  assert.equal((await synchronize({olist:{product:async()=>product},store,settings,apply:true,state,statePath:file,logger:quiet})).productsUpdated,0);
  assert.equal(writes,1);
});
test('falha de rede usa mesmo eventId e sourceVersion na repeticao',async()=>{
  const file=join(await temp(),'state.json'),state=await loadState(file),seen=[];
  const store={request:async(path,opts)=>{
    if(path.includes('upsert')){seen.push([opts.body.eventId,opts.body.sourceVersion]);if(seen.length===1)throw new OlistConnectorError('STORE_NETWORK_ERROR');return {externalProductId:'42',productId:PROD};}
    if(path.includes('variants?'))return {variants:[{externalId:'42',variantId:VAR}],hasMore:false};
  }};
  assert.equal((await synchronize({olist:{product:async()=>product},store,settings,apply:true,state,statePath:file,logger:quiet})).skipped,1);
  assert.equal((await synchronize({olist:{product:async()=>product},store,settings,apply:true,state,statePath:file,logger:quiet})).skipped,0);
  assert.deepEqual(seen[0],seen[1]);
});
test('estoque somente pela rota apropriada e sem replicacao dupla',async()=>{
  const file=join(await temp(),'state.json'),state=await loadState(file);let updates=0;
  const store={request:async(path,opts)=>{
    if(path.includes('upsert'))return {externalProductId:'42',productId:PROD};
    if(path.includes('variants?'))return {variants:[{externalId:'42',variantId:VAR}],hasMore:false};
    if(path===`/v1/external/inventory/${VAR}`){updates++;assert.equal(opts.body.onHand,12);return {acceptedOnHand:12};}
    throw Error('unexpected');
  }};
  const p={olist:{product:async()=>product,stock:async()=>({id:42,saldo:12,reservado:2,disponivel:10,depositos:[{id:1}]})},store,settings:{...settings,syncStock:true},apply:true,state,statePath:file,logger:quiet};
  assert.equal((await synchronize(p)).stocksUpdated,1);
  assert.equal((await synchronize(p)).stocksUpdated,0);assert.equal(updates,1);
});
