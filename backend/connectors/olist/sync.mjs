// Olist/Tiny API V3 -> Frequencia40 Store App. PREVIEW por padrao; nao cria vendas no ERP.
import {readFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {OlistConnectorError,createOlistClient,createStoreClient,validUuid} from './clients.mjs';
import {createTokenManager} from './auth.mjs';
import {validateSettings,mapProduct,stockTotal,fingerprint} from './mapping.mjs';
import {loadState,atomicJson,operationFor,markDone,lockFile} from './state.mjs';

async function mappedVariant(store,externalId){
  let cursor=null;
  for(let i=0;i<200;i++){
    const data=await store.request(`/v1/external/catalog/variants?limit=100${cursor?`&after=${cursor}`:''}`);
    if(!Array.isArray(data?.variants))throw new OlistConnectorError('STORE_VARIANTS_INVALID');
    const found=data.variants.filter(x=>x.externalId===externalId);
    if(found.length>1)throw new OlistConnectorError('STORE_MAPPING_AMBIGUOUS');
    if(found.length===1){if(!validUuid(found[0].variantId))throw new OlistConnectorError('STORE_VARIANT_ID_INVALID');return found[0].variantId;}
    if(!data.hasMore)return null;
    if(!validUuid(data.nextAfter)||data.nextAfter===cursor)throw new OlistConnectorError('STORE_CURSOR_INVALID');cursor=data.nextAfter;
  }
  throw new OlistConnectorError('STORE_CURSOR_LIMIT');
}
export async function synchronize({olist,store=null,settings,apply=false,state=null,statePath=null,logger=console}){
  validateSettings(settings);
  if(apply&&(!store||!state||!statePath))throw new OlistConnectorError('STORE_AND_STATE_REQUIRED');
  const stats={mode:apply?'APPLY':'PREVIEW',examined:0,productsUpdated:0,stocksUpdated:0,unchanged:0,skipped:0,errors:[]};
  for(const id of settings.productIds){
    stats.examined++;
    try{
      const remote=await olist.product(id);
      const product=mapProduct(remote,settings.categoryId,settings.variants?.[String(id)]??{});
      let variantId=state?.variantIds?.[String(id)]??null;
      const key=`catalog:${id}`,hash=fingerprint(product);
      if(apply){
        const {operation,skip}=operationFor(state,key,hash);
        if(!skip){
          await atomicJson(statePath,state);
          const response=await store.request('/v1/external/catalog/products/upsert',{method:'POST',body:{...product,eventId:operation.eventId,sourceVersion:operation.version}});
          if(response.externalProductId!==String(id)||!validUuid(response.productId))throw new OlistConnectorError('STORE_CATALOG_ACK_INVALID');
          markDone(state,key);await atomicJson(statePath,state);stats.productsUpdated++;
        }else stats.unchanged++;
        const current=await mappedVariant(store,String(id));
        if(!current)throw new OlistConnectorError('STORE_MAPPING_MISSING');
        if(variantId&&current!==variantId)throw new OlistConnectorError('STORE_MAPPING_CHANGED');
        variantId=current;state.variantIds[String(id)]=current;await atomicJson(statePath,state);
      }else logger.log(`[preview] Olist/Tiny produto=${id} sku=${product.variants[0].sku} precoCentavos=${product.variants[0].priceCents}`);
      if(!settings.syncStock)continue;
      const stock=stockTotal(await olist.stock(id),id);
      if(!apply){logger.log(`[preview] Olist/Tiny produto=${id} saldoFisico=${stock}`);continue;}
      const stockKey=`stock:${id}`,stockHash=fingerprint({variantId,onHand:stock});
      const {operation,skip}=operationFor(state,stockKey,stockHash);
      if(skip){stats.unchanged++;continue;}
      await atomicJson(statePath,state);
      const result=await store.request(`/v1/external/inventory/${variantId}`,{method:'PUT',body:{eventId:operation.eventId,sourceVersion:operation.version,onHand:stock}});
      if(result.acceptedOnHand!==stock&&result.onHand!==stock)throw new OlistConnectorError('STORE_STOCK_ACK_INVALID');
      markDone(state,stockKey);await atomicJson(statePath,state);stats.stocksUpdated++;
    }catch(error){const code=error instanceof OlistConnectorError?error.code:'UNEXPECTED_CONNECTOR_ERROR';
      stats.skipped++;stats.errors.push({olistProductId:id,code});logger.error(`[olist] produto=${id} codigo=${code}`);
    }
  }
  return stats;
}
export async function main(env=process.env,args=process.argv.slice(2)){
  const apply=args.length===1&&args[0]==='--apply';
  if(args.length>1||(args.length===1&&!apply))throw new OlistConnectorError('USE_PREVIEW_OR_APPLY');
  if(apply&&env.F40_APPLY!=='CONFIRMO_SINCRONIZACAO')throw new OlistConnectorError('APPLY_NOT_CONFIRMED');
  const configPath=env.F40_OLIST_CONFIG,tokenPath=env.F40_OLIST_TOKENS_FILE;
  if(!configPath||!isAbsolute(configPath)||!tokenPath||!isAbsolute(tokenPath))throw new OlistConnectorError('ABSOLUTE_CONFIG_AND_TOKEN_PATHS_REQUIRED');
  const settings=validateSettings(JSON.parse(await readFile(configPath,'utf8')));
  const tokenManager=createTokenManager({tokenPath,clientId:env.OLIST_CLIENT_ID,clientSecret:env.OLIST_CLIENT_SECRET});
  const olist=createOlistClient({accessToken:args=>tokenManager.accessToken(args)});
  if(!apply){const out=await synchronize({olist,settings});console.log(JSON.stringify(out,null,2));if(out.errors.length)process.exitCode=1;return;}
  const statePath=env.F40_STATE_FILE;
  if(!statePath||!isAbsolute(statePath))throw new OlistConnectorError('STATE_FILE_ABSOLUTE_REQUIRED');
  const unlock=await lockFile(statePath);
  try{
    const state=await loadState(statePath),store=createStoreClient({url:env.F40_API_URL,token:env.F40_INTEGRATION_TOKEN});
    const out=await synchronize({olist,store,settings,apply,state,statePath});
    console.log(JSON.stringify(out,null,2));if(out.errors.length)process.exitCode=1;
  }finally{await unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error('[olist]',e instanceof OlistConnectorError?e.code:'RUN_FAILED');process.exitCode=1;});
}
