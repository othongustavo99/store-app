import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBlingClient,createStoreClient,BlingConnectorError} from '../clients.mjs';
import {mapProduct,stockTotal,cents,validateSettings} from '../mapping.mjs';
import {authorizationUrl,validateCallback,tokenGrant,createTokenManager,startAuthorization,completeAuthorization} from '../auth.mjs';
import {loadState,atomicJson,lockFile,operationFor,markDone} from '../state.mjs';
import {synchronize} from '../sync.mjs';
const CATEGORY='11111111-1111-4111-8111-111111111111';
const VARIANT='22222222-2222-4222-8222-222222222222';
const PRODUCT='33333333-3333-4333-8333-333333333333';
const TOKEN=`f40i_${'X'.repeat(43)}`;
const product={id:1001,nome:'Camiseta Algodao',codigo:'CAMISETA-01',preco:49.90,gtin:'7894900011517',tipo:'P',formato:'S',situacao:'A'};
const settings={categoryId:CATEGORY,productIds:[1001],syncStock:false,stockSource:'TOTAL'};
const logs={log(){},error(){}};
const makeDir=async()=>mkdtemp(join(tmpdir(),'f40-bling-test-'));
const result=(data,status=200)=>({ok:status>=200&&status<300,status,headers:{get:()=>null},json:async()=>data});

test('converte centavos sem float e rejeita preco fracionario fora do contrato',()=>{
  assert.equal(cents(49.9),4990);assert.equal(cents('120.01'),12001);
  assert.throws(()=>cents(25.899),{code:'BLING_PRICE_INVALID'});
  assert.throws(()=>cents(-1),{code:'BLING_PRICE_INVALID'});
});
test('mapeia produto simples Bling, GTIN e SKU sem alterar publicacao',()=>{
  const p=mapProduct(product,CATEGORY);
  assert.equal(p.externalProductId,'1001');assert.equal(p.variants[0].priceCents,4990);
  assert.equal(p.variants[0].gtin,'7894900011517');assert.equal(p.status,undefined);
});
test('falha para variacao, kit, servico e campo desconhecido',()=>{
  for(const data of [{...product,formato:'V'},{...product,formato:'E'},
    {...product,tipo:'S'},{...product,formato:undefined}]){
    assert.throws(()=>mapProduct(data,CATEGORY),{code:'BLING_PRODUCT_UNSUPPORTED_TYPE'});
  }
  assert.throws(()=>mapProduct({...product,gtin:'7894900011518'},CATEGORY),{code:'BLING_GTIN_INVALID'});
  assert.throws(()=>mapProduct({...product,situacao:'X'},CATEGORY),{code:'BLING_SITUATION_UNKNOWN'});
});
test('estoque utiliza apenas saldo fisico total inteiro do produto exato',()=>{
  assert.equal(stockTotal({data:[{produto:{id:1001},saldoFisicoTotal:7,saldoVirtualTotal:3}]},1001),7);
  assert.throws(()=>stockTotal({data:[{produto:{id:1001},saldoFisicoTotal:5.5}]},1001),{code:'BLING_STOCK_NOT_INTEGER'});
  assert.throws(()=>stockTotal({data:[{produto:{id:1002},saldoFisicoTotal:7}]},1001),{code:'BLING_STOCK_AMBIGUOUS'});
});
test('configuracao explicita evita toda loja e rejeita deposito ainda nao homologado',()=>{
  assert.throws(()=>validateSettings({...settings,productIds:[]}),{code:'PRODUCT_IDS_INVALID'});
  assert.throws(()=>validateSettings({...settings,productIds:[1001,1001]}),{code:'PRODUCT_IDS_INVALID'});
  assert.throws(()=>validateSettings({...settings,stockSource:'DEPOSIT'}),{code:'STOCK_SOURCE_UNSUPPORTED'});
});
test('cliente Bling faz apenas GET de produto e saldo e envia JWT no header',async()=>{
  const paths=[];
  const client=createBlingClient({accessToken:async()=> 'jwt-token',fetchImpl:async(url,options)=>{
    paths.push(url);assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer jwt-token');
    assert.equal(options.headers['enable-jwt'],'1');
    return result(url.includes('/estoques/saldos')?{data:[{produto:{id:1001},saldoFisicoTotal:8}]}:{data:product});
  },minGapMs:0});
  assert.equal((await client.product(1001)).nome,product.nome);
  assert.equal(stockTotal(await client.physicalStock(1001),1001),8);
  assert.deepEqual(paths,['https://api.bling.com.br/Api/v3/produtos/1001','https://api.bling.com.br/Api/v3/estoques/saldos?idsProdutos%5B%5D=1001']);
});
test('cliente rejeita retorno de produto errado e erro de autenticacao persistente',async()=>{
  const client=createBlingClient({accessToken:async()=> 'jwt-token',fetchImpl:async()=>result({data:{...product,id:88}}),minGapMs:0});
  await assert.rejects(client.product(1001),{code:'BLING_PRODUCT_RESPONSE_MISMATCH'});
  let n=0;
  const bad=createBlingClient({accessToken:async ({force})=>{if(force)n++;return 'token';},fetchImpl:async()=>result({error:'secret'},401),minGapMs:0});
  await assert.rejects(bad.product(1001),{code:'BLING_HTTP_401'});assert.equal(n,1);
});
test('retry de 429 respeita status sem expor payload de erro',async()=>{
  let calls=0,delays=[];
  const client=createBlingClient({accessToken:async()=> 'jwt',fetchImpl:async()=>++calls===1?result({message:'dados privados'},429):result({data:product}),
    sleep:async ms=>delays.push(ms),minGapMs:0});
  assert.equal((await client.product(1001)).id,1001);assert.equal(calls,2);
  assert.ok(delays.some(x=>x>=1000));
});
test('OAuth cria URL com state, verifica callback e impede reutilizacao cruzada',()=>{
  const url=authorizationUrl('app-id','a'.repeat(40));assert.ok(url.includes('response_type=code'));
  const pending={state:'a'.repeat(40),createdAt:1000};
  assert.equal(validateCallback('https://site.example/callback?code=abc&state='+pending.state,pending,'https://site.example/callback',1100),'abc');
  assert.throws(()=>validateCallback('https://site.example/callback?code=abc&state=outra',pending,'https://site.example/callback',1100),{code:'OAUTH_STATE_MISMATCH'});
  assert.throws(()=>validateCallback('https://outra.example/callback?code=abc&state='+pending.state,pending,'https://site.example/callback',1100),{code:'OAUTH_CALLBACK_MISMATCH'});
  assert.throws(()=>validateCallback('https://site.example/callback?code=abc&state='+pending.state,pending,'https://site.example/callback',700000),{code:'OAUTH_SESSION_EXPIRED'});
});
test('OAuth usa basic e enable-jwt e persiste refresh token rotativo',async()=>{
  const dir=await makeDir();const file=join(dir,'tokens.json');let calls=0;
  const fetchImpl=async(url,options)=>{
    calls++;assert.equal(url,'https://api.bling.com.br/Api/v3/oauth/token');
    assert.equal(options.headers.Authorization,`Basic ${Buffer.from('client123:secret123').toString('base64')}`);
    assert.equal(options.headers['enable-jwt'],'1');
    const body=new URLSearchParams(options.body);
    if(calls===1){assert.equal(body.get('grant_type'),'authorization_code');assert.equal(body.get('code'),'code123');}
    if(calls===2){assert.equal(body.get('grant_type'),'refresh_token');assert.equal(body.get('refresh_token'),'refresh1');}
    return result({access_token:'jwt-access-'+calls+'123456',refresh_token:'refresh'+calls,expires_in:3600});
  };
  const saved=await tokenGrant({clientId:'client123',clientSecret:'secret123',grantType:'authorization_code',code:'code123',fetchImpl});
  await atomicJson(file,saved);
  const manager=createTokenManager({tokenPath:file,clientId:'client123',clientSecret:'secret123',fetchImpl});
  assert.equal(await manager.accessToken(),saved.accessToken);
  assert.equal(await manager.accessToken({force:true}),'jwt-access-2123456');
  const fresh=JSON.parse(await readFile(file,'utf8'));assert.equal(fresh.refreshToken,'refresh2');
});
test('OAuth start e finish escrevem token sem imprimir o segredo',async()=>{
  const dir=await makeDir(),file=join(dir,'tokens.json'),pendingPath=file+'.pending.json';
  const url=await startAuthorization({clientId:'client123',pendingPath});
  const state=new URL(url).searchParams.get('state');
  const callback='https://site.example/callback?code=valid_code&state='+state;
  const res=await completeAuthorization({callback,pendingPath,tokenPath:file,clientId:'client123',clientSecret:'secret123',redirectUri:'https://site.example/callback',
    fetchImpl:async()=>result({access_token:'jwt-access-123456',refresh_token:'refresh-123456',expires_in:3600})});
  assert.equal(res.authorized,true);assert.equal((await loadState(join(dir,'state.json'))).schema,1);
  assert.equal((JSON.parse(await readFile(file,'utf8'))).accessToken,'jwt-access-123456');
  await assert.rejects(completeAuthorization({callback,pendingPath,tokenPath:file,clientId:'client123',clientSecret:'secret123',redirectUri:'https://site.example/callback',fetchImpl:async()=>{throw Error('must not be called');}}),{code:'OAUTH_SESSION_EXPIRED'});
});
test('token invalido de Store App e HTTP externo bloqueados',async()=>{
  assert.throws(()=>createStoreClient({url:'http://loja.example/',token:TOKEN}),{code:'STORE_URL_INVALID'});
  assert.throws(()=>createStoreClient({url:'https://loja.example/',token:'INVALID'}),{code:'STORE_TOKEN_INVALID'});
  const client=createStoreClient({url:'https://loja.example/',token:TOKEN,fetchImpl:async(_url,options)=>{assert.ok(options.headers.Authorization.endsWith(TOKEN));return result({ok:true});}});
  await assert.rejects(client.request('/v1/external/orders/123'),{code:'STORE_ROUTE_BLOCKED'});
  assert.deepEqual(await client.request('/v1/external/catalog/variants?limit=100'),{ok:true});
});
test('estado duravel preserva id de replay, protege execucao concorrente',async()=>{
  const dir=await makeDir(),file=join(dir,'state.json'),unlock=await lockFile(file);
  await assert.rejects(lockFile(file),{code:'STATE_LOCKED'});
  const state=await loadState(file),a=operationFor(state,'catalog:1001','hash1',1000);
  await atomicJson(file,state);
  assert.equal(operationFor(state,'catalog:1001','hash1',2000).operation.eventId,a.operation.eventId);
  markDone(state,'catalog:1001');assert.equal(operationFor(state,'catalog:1001','hash1',3000).skip,true);
  assert.ok(operationFor(state,'catalog:1001','hash2',4000).operation.version>a.operation.version);
  await unlock();
});
test('preview consulta Bling mas nunca escreve no Store App',async()=>{
  const bling={product:async()=>product};const results=await synchronize({bling,settings,logger:logs});
  assert.equal(results.mode,'PREVIEW');assert.equal(results.examined,1);assert.equal(results.productsUpdated,0);
});
test('sincronizacao repetida nao cria produtos duas vezes e mantem mapeamento',async()=>{
  const dir=await makeDir(),file=join(dir,'state.json'),state=await loadState(file);
  let writes=0;
  const bling={product:async()=>product};
  const store={request:async (path,opts)=>{
    if(path.includes('upsert')){writes++;assert.equal(opts.body.externalProductId,'1001');return {externalProductId:'1001',productId:PRODUCT};}
    if(path.includes('variants?'))return {variants:[{externalId:'1001',variantId:VARIANT}],hasMore:false};
    throw Error('Unexpected: '+path);
  }};
  const a=await synchronize({bling,store,settings,apply:true,state,statePath:file,logger:logs});
  const b=await synchronize({bling,store,settings,apply:true,state,statePath:file,logger:logs});
  assert.equal(a.productsUpdated,1);assert.equal(b.productsUpdated,0);assert.equal(writes,1);
});
test('reenvio de falha de rede usa mesmo eventId e version',async()=>{
  const dir=await makeDir(),file=join(dir,'state.json'),state=await loadState(file),events=[];
  const bling={product:async()=>product};
  const store={request:async(path,opts)=>{
    if(path.includes('upsert')){
      events.push([opts.body.eventId,opts.body.sourceVersion]);
      if(events.length===1)throw new BlingConnectorError('STORE_NETWORK_ERROR');
      return {externalProductId:'1001',productId:PRODUCT};
    }
    if(path.includes('variants?'))return {variants:[{externalId:'1001',variantId:VARIANT}],hasMore:false};
  }};
  assert.equal((await synchronize({bling,store,settings,apply:true,state,statePath:file,logger:logs})).skipped,1);
  assert.equal((await synchronize({bling,store,settings,apply:true,state,statePath:file,logger:logs})).skipped,0);
  assert.deepEqual(events[0],events[1]);
});
test('estoque apenas na rota de inventario, versao duravel e sem repetir',async()=>{
  const dir=await makeDir(),file=join(dir,'state.json'),state=await loadState(file);
  let stockWrites=0;
  const bling={product:async()=>product,physicalStock:async()=>({data:[{produto:{id:1001},saldoFisicoTotal:9}]})};
  const store={request:async(path,opts)=>{
    if(path.includes('upsert'))return {externalProductId:'1001',productId:PRODUCT};
    if(path.includes('variants?'))return {variants:[{externalId:'1001',variantId:VARIANT}],hasMore:false};
    if(path===`/v1/external/inventory/${VARIANT}`){stockWrites++;assert.equal(opts.body.onHand,9);return {acceptedOnHand:9};}
    throw Error('Unexpected route '+path);
  }};
  const params={bling,store,settings:{...settings,syncStock:true},apply:true,state,statePath:file,logger:logs};
  assert.equal((await synchronize(params)).stocksUpdated,1);
  assert.equal((await synchronize(params)).stocksUpdated,0);assert.equal(stockWrites,1);
});
test('OAuth listener local recebe callback e troca code sem colar no terminal',async()=>{
  const {createServer}=await import('node:http');
  const d=await makeDir(),file=join(d,'tokens.json');
  const server=createServer();
  await new Promise(res=>server.listen(0,'127.0.0.1',res));
  const port=server.address().port;await new Promise(res=>server.close(res));
  const {authorizeLoopback}=await import('../auth.mjs');
  const url=`http://127.0.0.1:${port}/callback`;
  const resultAuth=await authorizeLoopback({
    clientId:'client123',clientSecret:'secret123',redirectUri:url,tokenPath:file,pendingPath:file+'.pending.json',timeoutMs:5000,
    onUrl:(authUrl)=>{
      const state=new URL(authUrl).searchParams.get('state');
      queueMicrotask(async()=>{
        const resp=await fetch(url+'?code=xyz&state='+encodeURIComponent(state));
        assert.equal(resp.status,200);
      });
    },
    fetchImpl:async()=>result({access_token:'jwt-access-123456',refresh_token:'refresh-123456',expires_in:3600}),
  });
  assert.equal(resultAuth.authorized,true);
  assert.equal((JSON.parse(await readFile(file,'utf8'))).refreshToken,'refresh-123456');
});
