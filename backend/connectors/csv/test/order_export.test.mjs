import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateOrderExportConfig,prepareOrderExport,CsvOrderExportError} from '../order_export.mjs';
import {loadOrderExportState,lockOrderExportState,createOrderExportFiles} from '../order_export_state.mjs';
import {createStoreOrderClient} from '../../shared/safe_order_export.mjs';
const demo=JSON.parse(await readFile(new URL('../orders.example.json',import.meta.url),'utf8'));
const base=()=>structuredClone(demo.settings),snapshot=()=>structuredClone(demo.snapshots[0]);
const ORDER=demo.settings.orderIds[0],STORE=demo.settings.storeId,CONN=demo.settings.integrationId;
const NEXT='44444444-4444-4444-8444-444444444444';
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof CsvOrderExportError&&e.code===code);
const plan=()=>prepareOrderExport([snapshot()],base());
const withTmp=async fn=>{const dir=await mkdtemp(join(tmpdir(),'f40csvorders-'));
  try{return await fn({dir,statePath:join(dir,'orders-state.json'),outputPath:join(dir,'saida.csv')});}
  finally{await rm(dir,{recursive:true,force:true});}
};
const local=(argv=[],env={})=>spawnSync(process.execPath,[fileURLToPath(new URL('../order_export_cli.mjs',import.meta.url)),...argv],
  {encoding:'utf8',env:{...process.env,...env},timeout:12000});

test('01 exemplo pronto, colunas mapeadas por cliente',()=>{
  assert.equal(validateOrderExportConfig(base()).schema,1);
  const result=plan();assert.equal(result.summary.orders,1);assert.equal(result.summary.lines,1);
  assert.match(result.contents,/"pedido";"id_pedido";"data"/);
  assert.match(result.contents,/"119,90"/);
});
test('02 rejeita credenciais e chaves desconhecidas no arquivo de perfil',()=>{
  reject(()=>validateOrderExportConfig({...base(),token:'segredo'}),'CSV_ORDER_SETTINGS_INVALID');
  reject(()=>validateOrderExportConfig({...base(),customerEmail:'x@y'}),'CSV_ORDER_SETTINGS_INVALID');
});
test('03 IDs de loja e integracao estritos',()=>{
  reject(()=>validateOrderExportConfig({...base(),storeId:'x'}),'CSV_ORDER_SETTINGS_INVALID');
  reject(()=>validateOrderExportConfig({...base(),integrationId:'x'}),'CSV_ORDER_SETTINGS_INVALID');
});
test('04 selecao explicita sem pedido repetido',()=>{
  reject(()=>validateOrderExportConfig({...base(),orderIds:[ORDER,ORDER]}),'CSV_ORDER_SETTINGS_INVALID');
  reject(()=>validateOrderExportConfig({...base(),orderIds:[]}), 'CSV_ORDER_SETTINGS_INVALID');
});
test('05 CSV com virgula exige decimal ponto; BOM desativavel',()=>{
  const s=base();s.delimiter=',';s.decimalSeparator='.';s.utf8Bom=false;
  const result=prepareOrderExport([snapshot()],s);
  assert.match(result.contents,/"119\.90"/);assert.ok(!result.contents.startsWith('\uFEFF'));
  reject(()=>validateOrderExportConfig({...s,decimalSeparator:','}),'CSV_ORDER_SEPARATORS_INVALID');
});
test('06 colunas obrigatorias, headers perigosos e duplicados nao aceitos',()=>{
  const x=base();delete x.columns.unitPrice;
  reject(()=>validateOrderExportConfig(x),'CSV_ORDER_COLUMN_REQUIRED');
  const y=base();y.columns.productCode='=SOMA(1)';
  reject(()=>validateOrderExportConfig(y),'CSV_ORDER_COLUMNS_INVALID');
  const z=base();z.columns.orderId=z.columns.orderReference.toUpperCase();
  reject(()=>validateOrderExportConfig(z),'CSV_ORDER_COLUMNS_INVALID');
});
test('07 nao exporta pedidos nao pagos, demo, entrega e status cancelado',()=>{
  for(const change of [{paymentStatus:'PENDING'},{isDemo:true},{fulfillmentMethod:'DELIVERY'},
    {status:'CANCELED'},{status:'REFUNDED'},{shippingServiceId:'qualquer'}]){
    const x=snapshot();Object.assign(x.order,change);
    reject(()=>prepareOrderExport([x],base()),'CSV_ORDER_NOT_ELIGIBLE');
  }
});
test('08 aceita PAID e PREPARING com pagamento aprovado',()=>{
  const x=snapshot();x.order.status='PREPARING';
  assert.equal(prepareOrderExport([x],base()).summary.orders,1);
});
test('09 nao distribui desconto, frete nem total divergente',()=>{
  for(const change of [{shippingCents:'100',totalCents:'12090'},{discountCents:'100',totalCents:'11890'},
    {subtotalCents:'11991'},{totalCents:'12000'}]){
    const x=snapshot();Object.assign(x.order,change);
    assert.throws(()=>prepareOrderExport([x],base()),e=>e instanceof CsvOrderExportError);
  }
});
test('10 identificador de variante deve estar previamente mapeado',()=>{
  for(const externalVariantId of [null,'','=2+3','+1','-3','@cmd','']){
    const x=snapshot();x.order.items[0].externalVariantId=externalVariantId;
    reject(()=>prepareOrderExport([x],base()),'CSV_ORDER_MAPPING_REQUIRED');
  }
});
test('11 rejeita quantidade negativa, valores zero e dinheiro fora do limite',()=>{
  const cases=[{quantity:-1},{quantity:0},{quantity:1.5},{unitPriceCents:'0'},
    {unitPriceCents:'1,00'},{unitPriceCents:'999999999999999999'}];
  for(const change of cases){const x=snapshot();Object.assign(x.order.items[0],change);
    assert.throws(()=>prepareOrderExport([x],base()));}
});
test('12 rejeita quantidade de snapshot diferente da selecao',()=>{
  reject(()=>prepareOrderExport([],base()),'CSV_ORDER_SNAPSHOT_COUNT_INVALID');
});
test('13 nao aceita ID de pedido divergente ou repetido',()=>{
  const x=snapshot();x.order.id=NEXT;
  reject(()=>prepareOrderExport([x],base()),'CSV_ORDER_UNEXPECTED_ID');
  const settings=base();settings.orderIds=[ORDER,NEXT];
  reject(()=>prepareOrderExport([snapshot(),snapshot()],settings),'CSV_ORDER_UNEXPECTED_ID');
});
test('14 codigo externo com zeros a esquerda permanece texto',()=>{
  const x=snapshot();x.order.items[0].externalVariantId='00000123';
  assert.match(prepareOrderExport([x],base()).contents,/"00000123"/);
});
test('15 escape de aspas e neutralizacao de formula em descricao',()=>{
  const x=snapshot();x.order.items[0].productName='=HYPERLINK("x";"y")';
  assert.match(prepareOrderExport([x],base()).contents,/"'=HYPERLINK\(""x"";""y""\)"/);
  x.order.items[0].productName='  @calc';
  assert.match(prepareOrderExport([x],base()).contents,/"'  @calc"/);
});
test('16 quebra de linha e controle em produto nao podem afetar CSV',()=>{
  const x=snapshot();x.order.items[0].productName='camisa\nexterna';
  reject(()=>prepareOrderExport([x],base()),'CSV_ORDER_PRODUCT_TEXT_INVALID');
});
test('17 agregacao de dois pedidos, soma sem arredondamentos float',()=>{
  const settings=base();settings.orderIds=[ORDER,NEXT];
  const y=snapshot();y.order.id=NEXT;
  const result=prepareOrderExport([y,snapshot()],settings);
  assert.equal(result.summary.orders,2);assert.equal(result.summary.lines,2);
  assert.equal(result.summary.totalCents,23980);
  assert.match(result.contents,/F40-44444444-4444-4444-8444-444444444444/);
});
test('18 checkout sem data valida nao pode gerar CSV',()=>{
  const x=snapshot();x.order.createdAt='amanha';
  reject(()=>prepareOrderExport([x],base()),'CSV_ORDER_DATE_INVALID');
});
test('19 rejeita data de calendario inexistente',()=>{
  const x=snapshot();x.order.createdAt='2026-02-30T12:00:00Z';
  reject(()=>prepareOrderExport([x],base()),'CSV_ORDER_DATE_INVALID');
});
test('20 preview puro gera hash deterministico, sem arquivo e sem contato com ERP',()=>{
  assert.equal(plan().sha256,plan().sha256);
  assert.equal(plan().summary.erpReceived,false);
  assert.equal(plan().summary.productionApproved,false);
});
test('21 estado nao pode mudar de cliente ou credencial',async()=>withTmp(async({statePath})=>{
  const state=await loadOrderExportState(statePath,base());
  await writeFile(statePath,JSON.stringify(state));
  await assert.rejects(loadOrderExportState(statePath,{...base(),storeId:NEXT}),{code:'CSV_ORDER_STATE_TENANT_MISMATCH'});
  await assert.rejects(loadOrderExportState(statePath,{...base(),integrationId:NEXT}),{code:'CSV_ORDER_STATE_TENANT_MISMATCH'});
}));
test('22 cria arquivo e manifesto sem declarar aceite pelo ERP',async()=>withTmp(async({statePath,outputPath})=>{
  const result=await createOrderExportFiles({plan:plan(),config:base(),statePath,outputPath});
  assert.equal(result.mode,'FILE_CREATED');assert.equal(result.erpReceived,false);
  const csv=await readFile(outputPath,'utf8'),manifest=JSON.parse(await readFile(outputPath+'.manifest.json','utf8'));
  assert.equal(csv,plan().contents);assert.equal(manifest.erpReceived,false);
  assert.equal(manifest.sha256,plan().sha256);
  assert.equal((await loadOrderExportState(statePath,base())).orders[ORDER].stage,'FILE_CREATED');
}));
test('23 impede geracao repetida do mesmo pedido em outro nome de arquivo',async()=>withTmp(async({dir,statePath,outputPath})=>{
  await createOrderExportFiles({plan:plan(),config:base(),statePath,outputPath});
  await assert.rejects(createOrderExportFiles({plan:plan(),config:base(),statePath,outputPath:join(dir,'outro.csv')}),
    {code:'CSV_ORDER_ALREADY_PREPARED_OR_UNCERTAIN'});
}));
test('24 arquivo existente nunca e sobrescrito nem reserva pedido',async()=>withTmp(async({statePath,outputPath})=>{
  await writeFile(outputPath,'original');
  await assert.rejects(createOrderExportFiles({plan:plan(),config:base(),statePath,outputPath}),
    {code:'CSV_ORDER_OUTPUT_ALREADY_EXISTS'});
  assert.equal(await readFile(outputPath,'utf8'),'original');
  await assert.rejects(readFile(statePath),{code:'ENOENT'});
}));
test('25 arquivo manifesto existente nunca e sobrescrito',async()=>withTmp(async({statePath,outputPath})=>{
  await writeFile(outputPath+'.manifest.json','original');
  await assert.rejects(createOrderExportFiles({plan:plan(),config:base(),statePath,outputPath}),
    {code:'CSV_ORDER_OUTPUT_ALREADY_EXISTS'});
  assert.equal(await readFile(outputPath+'.manifest.json','utf8'),'original');
}));
test('26 reserva anterior sem arquivo impede retry automatico',async()=>withTmp(async({statePath,outputPath})=>{
  await writeFile(statePath,JSON.stringify({schema:1,provider:'csv-orders',storeId:STORE,
    integrationId:CONN,orders:{[ORDER]:{stage:'RESERVED',batchId:'abc'}}}));
  await assert.rejects(createOrderExportFiles({plan:plan(),config:base(),statePath,outputPath}),
    {code:'CSV_ORDER_ALREADY_PREPARED_OR_UNCERTAIN'});
}));
test('27 lock impede execucao paralela na mesma loja',async()=>withTmp(async({statePath,outputPath})=>{
  const release=await lockOrderExportState(statePath);
  try{await assert.rejects(createOrderExportFiles({plan:plan(),config:base(),statePath,outputPath}),
    {code:'CSV_ORDER_STATE_LOCKED'});}
  finally{await release();}
}));
test('28 nao aceita saida relativa ou igual ao estado',async()=>withTmp(async({statePath})=>{
  await assert.rejects(createOrderExportFiles({plan:plan(),config:base(),statePath,outputPath:'orders.csv'}),
    {code:'CSV_ORDER_OUTPUT_PATH_INVALID'});
}));
test('29 demo CLI usa caminho multiplataforma e nao precisa token',()=>{
  const res=local(['--demo'],{F40_API_URL:'',F40_INTEGRATION_TOKEN:''});
  assert.equal(res.status,0,res.stderr);const output=JSON.parse(res.stdout);
  assert.equal(output.mode,'DEMO');assert.equal(output.networkUsed,false);
  assert.equal(output.filesCreated,false);
});
test('30 CLI --write exige confirmacao antes de fazer requisicao',async()=>withTmp(async({dir})=>{
  const configPath=join(dir,'config.json');await writeFile(configPath,JSON.stringify(base()));
  const res=local(['--write'],{F40_CSV_ORDERS_CONFIG:configPath,F40_CSV_ORDER_EXPORT_CONFIRM:''});
  assert.equal(res.status,1);assert.match(res.stderr,/CSV_ORDER_WRITE_CONFIRM_REQUIRED/);
}));
test('31 CLI nao revela token ao falhar em configuracao',async()=>withTmp(async({dir})=>{
  const configPath=join(dir,'config.json');await writeFile(configPath,JSON.stringify({...base(),apiToken:'secreto'}));
  const res=local(['--preview'],{F40_CSV_ORDERS_CONFIG:configPath,F40_INTEGRATION_TOKEN:'segredo'});
  assert.equal(res.status,1);assert.ok(!res.stderr.includes('segredo'));
  assert.match(res.stderr,/CSV_ORDER_SETTINGS_INVALID/);
}));
test('32 HTTP de pedidos continua restrito a rotas conhecidas',async()=>{
  const client=createStoreOrderClient({url:'https://store.test/',token:`f40i_${'a'.repeat(43)}`,
    fetchImpl:async()=>({ok:true,json:async()=>({order:{id:ORDER}})})});
  await assert.rejects(client.request('/v1/external/customers'),{code:'STORE_ROUTE_FORBIDDEN'});
});

// Fluxo real CLI -> HTTP Store simulado -> preview -> confirmacao de hash -> arquivo local.
// Sem rede com fornecedor real e sem alteracao no backend.
test('33 CLI faz preview HTTP somente leitura e grava CSV apenas com aceite e hash',async()=>withTmp(async({dir,statePath,outputPath})=>{
  const {createServer}=await import('node:http');
  const {spawn}=await import('node:child_process');
  const configPath=join(dir,'orders.json');await writeFile(configPath,JSON.stringify(base()));
  const hits=[];
  const server=createServer((req,res)=>{
    hits.push([req.method,req.url]);
    if(req.method!=='GET'||req.url!==`/v1/external/orders/${ORDER}`){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(snapshot()));
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const url=`http://127.0.0.1:${server.address().port}/`;
  const env={F40_CSV_ORDERS_CONFIG:configPath,F40_API_URL:url,
    F40_INTEGRATION_TOKEN:`f40i_${'a'.repeat(43)}`,F40_CSV_ORDERS_STATE:statePath,
    F40_CSV_ORDERS_OUTPUT:outputPath,F40_CSV_ORDER_EXPORT_CONFIRM:'CONFIRMO_GERACAO_MANUAL'};
  function run(argv,extra={}){
    return new Promise((resolve,reject)=>{
      const proc=spawn(process.execPath,[fileURLToPath(new URL('../order_export_cli.mjs',import.meta.url)),...argv],
        {env:{...process.env,...env,...extra},windowsHide:true});
      let stdout='',stderr='';proc.stdout.on('data',d=>stdout+=d);
      proc.stderr.on('data',d=>stderr+=d);proc.on('error',reject);
      proc.on('close',code=>resolve({code,stdout,stderr}));
    });
  }
  try{
    const preview=await run(['--preview']);assert.equal(preview.code,0,preview.stderr);
    const digest=JSON.parse(preview.stdout).sha256;
    const withoutHash=await run(['--write']);
    assert.equal(withoutHash.code,1);assert.match(withoutHash.stderr,/CSV_ORDER_PREVIEW_CHANGED_OR_NOT_CONFIRMED/);
    const written=await run(['--write'],{F40_CSV_ORDERS_EXPECTED_SHA256:digest});
    assert.equal(written.code,0,written.stderr);
    assert.equal(JSON.parse(written.stdout).erpReceived,false);
    assert.match(await readFile(outputPath,'utf8'),/CAMISA-M-AZUL/);
    assert.equal(hits.length,3);
    assert.ok(hits.every(([method])=>method==='GET'));
    const repeated=await run(['--write'],{F40_CSV_ORDERS_EXPECTED_SHA256:digest});
    assert.equal(repeated.code,1);
    assert.match(repeated.stderr,/CSV_ORDER_ALREADY_PREPARED_OR_UNCERTAIN/);
  }finally{await new Promise(ok=>server.close(ok));}
}));

test('34 data de pedido respeita fuso horario declarado pela loja',()=>{
  const x=snapshot();x.order.createdAt='2026-11-23T01:30:00.000Z';
  const local=prepareOrderExport([x],base());
  assert.match(local.contents,/\"2026-11-22\"/);
  const utc=base();utc.dateTimeZone='UTC';
  assert.match(prepareOrderExport([x],utc).contents,/\"2026-11-23\"/);
});
test('35 fuso inexistente nao e aceito',()=>{
  reject(()=>validateOrderExportConfig({...base(),dateTimeZone:'Nao_Existe'}),'CSV_ORDER_TIMEZONE_INVALID');
});
test('36 hash de preview muda se dados de pedido forem alterados',()=>{
  const before=plan();const changed=snapshot();changed.order.items[0].productName='Produto atualizado';
  const after=prepareOrderExport([changed],base());
  assert.notEqual(before.sha256,after.sha256);
});
