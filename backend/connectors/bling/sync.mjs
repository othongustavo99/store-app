// Bling -> Frequencia40 Store App. Primeira execucao e sempre PREVIEW.
// Nao sincroniza pedidos / nao altera dados no Bling / nao publica produtos automaticamente.
import {readFile} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {BlingConnectorError,createStoreClient,createBlingClient,validUuid} from './clients.mjs';
import {createTokenManager} from './auth.mjs';
import {mapProduct,stockTotal,validateSettings,fingerprint} from './mapping.mjs';
import {loadState,atomicJson,operationFor,markDone,lockFile} from './state.mjs';

async function mappedVariant(store,externalId) {
  let after=null;
  for(let page=0;page<200;page++){
    const path=`/v1/external/catalog/variants?limit=100${after?`&after=${after}`:''}`;
    const data=await store.request(path);
    if(!Array.isArray(data.variants))throw new BlingConnectorError('STORE_VARIANTS_INVALID');
    const found=data.variants.filter(v=>v.externalId===externalId);
    if(found.length>1)throw new BlingConnectorError('STORE_MAPPING_NOT_UNIQUE');
    if(found.length===1){if(!validUuid(found[0].variantId))throw new BlingConnectorError('STORE_VARIANT_ID_INVALID');return found[0].variantId;}
    if(!data.hasMore)return null;
    if(!validUuid(data.nextAfter)||data.nextAfter===after)throw new BlingConnectorError('STORE_CURSOR_INVALID');
    after=data.nextAfter;
  }
  throw new BlingConnectorError('STORE_CURSOR_LIMIT');
}
export async function synchronize({bling,store=null,settings,apply=false,state=null,statePath=null,logger=console}) {
  validateSettings(settings);
  if(apply&&(!store||!state||!statePath))throw new BlingConnectorError('STORE_AND_STATE_REQUIRED');
  const stats={mode:apply?'APPLY':'PREVIEW',examined:0,productsUpdated:0,stocksUpdated:0,unchanged:0,skipped:0,errors:[]};
  for(const id of settings.productIds){
    stats.examined++;
    try{
      const row=await bling.product(id);
      const product=mapProduct(row,settings.categoryId,settings.variants?.[String(id)]??{});
      const key=`catalog:${id}`,hash=fingerprint(product);
      let variantId=state?.variantIds?.[id]??null;
      if(apply){
        const {operation,skip}=operationFor(state,key,hash);
        if(!skip){
          await atomicJson(statePath,state); // Primeiro persistir a versao/eventId do envio.
          const response=await store.request('/v1/external/catalog/products/upsert',{
            method:'POST',body:{...product,eventId:operation.eventId,sourceVersion:operation.version},
          });
          if(response.externalProductId!==String(id)||!validUuid(response.productId))throw new BlingConnectorError('STORE_PRODUCT_ACK_INVALID');
          markDone(state,key);await atomicJson(statePath,state);stats.productsUpdated++;
        }else stats.unchanged++;
        const liveVariantId=await mappedVariant(store,String(id));
        if(!liveVariantId)throw new BlingConnectorError('STORE_MAPPING_REQUIRED');
        if(variantId&&variantId!==liveVariantId)throw new BlingConnectorError('STORE_MAPPING_CHANGED');
        variantId=liveVariantId;
        state.variantIds[id]=variantId;await atomicJson(statePath,state);
      }else logger.log(`[preview] Bling ${id} SKU=${product.variants[0].sku} precoCentavos=${product.variants[0].priceCents}`);
      if(!settings.syncStock)continue;
      const stock=stockTotal(await bling.physicalStock(id),id);
      if(!apply){logger.log(`[preview] Bling ${id} saldoFisicoTotal=${stock}`);continue;}
      const stockKey=`stock:${id}`,stockHash=fingerprint({variantId,onHand:stock});
      const {operation,skip}=operationFor(state,stockKey,stockHash);
      if(skip){stats.unchanged++;continue;}
      await atomicJson(statePath,state);
      const response=await store.request(`/v1/external/inventory/${variantId}`,{
        method:'PUT',body:{eventId:operation.eventId,sourceVersion:operation.version,onHand:stock},
      });
      if(response.acceptedOnHand!==stock&&response.onHand!==stock)throw new BlingConnectorError('STORE_STOCK_ACK_INVALID');
      markDone(state,stockKey);await atomicJson(statePath,state);stats.stocksUpdated++;
    }catch(e){
      const code=e instanceof BlingConnectorError?e.code:'UNEXPECTED_CONNECTOR_ERROR';
      stats.skipped++;stats.errors.push({blingProductId:id,code});logger.error(`[bling] ${id}: ${code}`);
    }
  }
  return stats;
}
async function main() {
  const flags=process.argv.slice(2),apply=flags.length===1&&flags[0]==='--apply';
  if(flags.length>1||(flags.length===1&&!apply))throw new BlingConnectorError('USAGE_PREVIEW_OR_APPLY');
  if(apply&&process.env.F40_APPLY!=='CONFIRMO_SINCRONIZACAO')throw new BlingConnectorError('APPLY_NOT_CONFIRMED');
  const configPath=process.env.F40_BLING_CONFIG,tokenPath=process.env.F40_BLING_TOKENS_FILE;
  if(!configPath||!isAbsolute(configPath)||!tokenPath||!isAbsolute(tokenPath))throw new BlingConnectorError('ABSOLUTE_CONFIG_AND_TOKEN_PATHS_REQUIRED');
  const settings=validateSettings(JSON.parse(await readFile(configPath,'utf8')));
  const tokenManager=createTokenManager({tokenPath,clientId:process.env.BLING_CLIENT_ID,clientSecret:process.env.BLING_CLIENT_SECRET});
  const bling=createBlingClient({accessToken:args=>tokenManager.accessToken(args)});
  if(!apply){
    const result=await synchronize({bling,settings,apply:false});
    console.log(JSON.stringify(result,null,2));if(result.errors.length)process.exitCode=1;return;
  }
  const statePath=process.env.F40_STATE_FILE;
  if(!statePath||!isAbsolute(statePath))throw new BlingConnectorError('STATE_FILE_ABSOLUTE_REQUIRED');
  // Bloqueia sincronizacoes concorrentes (inclusive refresh JWT em paralelo na mesma loja).
  const unlock=await lockFile(statePath);
  try{
    const state=await loadState(statePath);
    const store=createStoreClient({url:process.env.F40_API_URL,token:process.env.F40_INTEGRATION_TOKEN});
    const result=await synchronize({bling,store,settings,apply,state,statePath});
    console.log(JSON.stringify(result,null,2));if(result.errors.length)process.exitCode=1;
  }finally{await unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error('[bling]',e instanceof BlingConnectorError?e.code:'RUNTIME_ERROR');process.exitCode=1;});
}
