/** Frequencia40 F5.14: importacao assistida por CSV. Nenhuma comunicacao com ERP externo. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {CsvIntegrationError,prepareCsvImport,validateConfig} from './mapping.mjs';
import {lockState,loadState,saveState,operationFor,markDone} from './state.mjs';
import {createStoreClient} from './store_client.mjs';
const fail=code=>{throw new CsvIntegrationError(code);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
async function loadVariantMappings(store,needed){
  const map=new Map();let after=null;
  for(let page=0;page<200;page++){
    const data=await store.request(`/v1/external/catalog/variants?limit=100${after?`&after=${after}`:''}`);
    if(!Array.isArray(data?.variants))fail('CSV_STORE_VARIANTS_INVALID');
    for(const v of data.variants){
      if(!needed.has(v.externalId))continue;
      if(map.has(v.externalId))fail('CSV_VARIANT_MAPPING_AMBIGUOUS');
      if(!uuid.test(v.variantId??''))fail('CSV_VARIANT_ID_INVALID');
      map.set(v.externalId,v.variantId);
    }
    if(data.hasMore!==true)return map;
    if(!uuid.test(data.nextAfter??'')||data.nextAfter===after)fail('CSV_PAGINATION_INVALID');
    after=data.nextAfter;
  }
  fail('CSV_PAGINATION_LIMIT');
}
export async function synchronizeCsv({content,config,apply=false,store=null,state=null,statePath=null}){
  const plan=prepareCsvImport(content,config); // TODA a entrada validada ANTES da primeira chamada HTTP.
  const result={phase:'5.14',provider:'csv',mode:apply?'APPLY':'PREVIEW',rows:plan.rowCount,
    products:plan.products.length,variants:plan.variantCount,stockMode:plan.stockMode,
    imported:0,unchanged:0,stockUpdated:0,errors:[],productionApproved:false};
  if(!apply)return result;
  if(!store||!state||!statePath)fail('CSV_STORE_STATE_REQUIRED');
  // Nao mistura checkpoints de clientes distintos, mesmo que o arquivo de estado seja reutilizado por engano.
  if(state.provider!=='csv'||state.storeId!==config.storeId||state.integrationId!==config.integrationId)fail('CSV_STATE_TENANT_MISMATCH');
  if(plan.stockMode==='PHYSICAL'){
    const inputHash=hash(plan.products.map(p=>[p.externalProductId,p.stocks]));
    if(state.lastStockSnapshot){
      const previous=state.lastStockSnapshot;
      if(config.snapshotAt<previous.at || config.snapshotAt===previous.at&&inputHash!==previous.hash)
        fail('CSV_PHYSICAL_SNAPSHOT_STALE_OR_CONFLICT');
    }
    // Salvar checkpoint de origem ANTES das operacoes. Em caso de falha permite repetir
    // exatamente o mesmo snapshot, nao importar saldo anterior ou snapshot alterado.
    state.lastStockSnapshot={at:config.snapshotAt,hash:inputHash};
    await saveState(statePath,state);
  }
  const importOK=[];
  for(const product of plan.products){
    try{
      const {stocks,...catalog}=product;
      const catalogKey=`catalog:${catalog.externalProductId}`;
      const {operation,skip}=operationFor(state,catalogKey,hash(catalog));
      if(!skip){
        await saveState(statePath,state);
        const response=await store.request('/v1/external/catalog/products/upsert',{
          method:'POST',body:{...catalog,eventId:operation.eventId,sourceVersion:operation.version},
        });
        if(response?.externalProductId!==catalog.externalProductId||!uuid.test(response.productId??''))fail('CSV_CATALOG_ACK_INVALID');
        markDone(state,catalogKey);await saveState(statePath,state);result.imported++;
      }else result.unchanged++;
      importOK.push(product);
    }catch(e){
      const code=e instanceof CsvIntegrationError?e.code:'CSV_UNEXPECTED_ERROR';
      result.errors.push({externalProductId:product.externalProductId,code});
    }
  }
  const allStock=importOK.flatMap(product=>product.stocks.map(stock=>({...stock,externalProductId:product.externalProductId})));
  if(allStock.length){
    let mapped;
    try{mapped=await loadVariantMappings(store,new Set(allStock.map(s=>s.externalVariantId)));}
    catch(e){result.errors.push({externalProductId:null,code:e instanceof CsvIntegrationError?e.code:'CSV_MAPPING_REQUEST_ERROR'});return result;}
    // Mapeamentos sao consultados UMA vez por arquivo; nao uma vez por SKU.
    for(const stock of allStock){
      try{
        const variantId=mapped.get(stock.externalVariantId);
        if(!variantId)fail('CSV_STOCK_MAPPING_MISSING');
        if(state.variantIds[stock.externalVariantId]&&state.variantIds[stock.externalVariantId]!==variantId)fail('CSV_STOCK_MAPPING_CHANGED');
        state.variantIds[stock.externalVariantId]=variantId;
        const key=`stock:${stock.externalVariantId}`;
        const {operation:op,skip}=operationFor(state,key,hash({variantId,onHand:stock.onHand}));
        if(skip){result.unchanged++;continue;}
        await saveState(statePath,state);
        const ack=await store.request(`/v1/external/inventory/${variantId}`,{
          method:'PUT',body:{eventId:op.eventId,sourceVersion:op.version,onHand:stock.onHand},
        });
        if(ack?.acceptedOnHand!==stock.onHand&&ack?.onHand!==stock.onHand)fail('CSV_STOCK_ACK_INVALID');
        markDone(state,key);await saveState(statePath,state);result.stockUpdated++;
      }catch(e){
        result.errors.push({externalProductId:stock.externalProductId,
          code:e instanceof CsvIntegrationError?e.code:'CSV_UNEXPECTED_ERROR'});
      }
    }
  }
  return result;
}
async function main(){
  const flags=process.argv.slice(2),apply=flags.length===1&&flags[0]==='--apply';
  if(flags.length>1||(flags.length===1&&!apply))fail('CSV_USAGE_PREVIEW_OR_APPLY');
  if(apply&&process.env.F40_APPLY!=='CONFIRMO_SINCRONIZACAO')fail('CSV_APPLY_NOT_CONFIRMED');
  const configPath=process.env.F40_CSV_CONFIG,inputPath=process.env.F40_CSV_INPUT;
  if(!isAbsolute(configPath??'')||!isAbsolute(inputPath??''))fail('CSV_ABSOLUTE_INPUT_PATHS_REQUIRED');
  const config=validateConfig(JSON.parse(await readFile(configPath,'utf8')));
  const bytes=await readFile(inputPath);
  if(bytes.byteLength>2_000_000)fail('CSV_FILE_INVALID');
  let content;
  try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('CSV_ENCODING_INVALID');}
  if(!apply){console.log(JSON.stringify(await synchronizeCsv({content,config}),null,2));return;}
  const statePath=process.env.F40_STATE_FILE;
  if(!isAbsolute(statePath??''))fail('CSV_STATE_ABSOLUTE_REQUIRED');
  const unlock=await lockState(statePath);
  try{
    const state=await loadState(statePath,config.storeId,config.integrationId);
    const store=createStoreClient({url:process.env.F40_API_URL,secret:process.env.F40_INTEGRATION_TOKEN});
    const out=await synchronizeCsv({content,config,apply:true,store,state,statePath});
    console.log(JSON.stringify(out,null,2));if(out.errors.length)process.exitCode=1;
  }finally{await unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error(e instanceof CsvIntegrationError?e.code:'CSV_CONFIG_OR_RUNTIME_ERROR');process.exitCode=1;});
}
