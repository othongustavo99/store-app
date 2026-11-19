// Omie -> Frequencia40: importacao assistida de produtos simples e estoque fisico.
// PREVIEW e padrao. Nunca executa um loop automatico; cada execucao tem lista explicita de IDs.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve,isAbsolute} from 'node:path';
import {ConnectorError,createOmieClient,createStoreClient,validateUuid} from './clients.mjs';
import {mapOmieProduct,readPhysicalStock,fingerprint,validateSettings} from './mapping.mjs';
import {lockState,loadState,saveState,prepareOperation,markDone} from './state.mjs';

const delay=(ms)=>new Promise(r=>setTimeout(r,ms));
const safeId=(id)=>Number.isSafeInteger(id)&&id>0;
function asProduct(data,id) {
  const row = Array.isArray(data?.produto_servico_cadastro) ? data.produto_servico_cadastro[0]
    : data?.produto_servico_cadastro ?? data;
  if(!row || Number(row.codigo_produto)!==id)throw new ConnectorError('OMIE_PRODUCT_MISMATCH');
  return row;
}
async function resolveVariant(store,externalId) {
  let after=null;
  for(let page=0;page<200;page++) {
    const url=`/v1/external/catalog/variants?limit=100${after?`&after=${after}`:''}`;
    const data=await store.request(url);
    if(!Array.isArray(data.variants))throw new ConnectorError('STORE_VARIANTS_INVALID');
    const variant=data.variants.find(v=>v.externalId===externalId);
    if(variant) {
      if(!validateUuid(variant.variantId))throw new ConnectorError('STORE_VARIANT_ID_INVALID');
      return variant.variantId;
    }
    if(!data.hasMore)return null;
    if(!validateUuid(data.nextAfter)||data.nextAfter===after)throw new ConnectorError('STORE_PAGINATION_INVALID');
    after=data.nextAfter;
  }
  throw new ConnectorError('STORE_PAGINATION_LIMIT');
}
export async function synchronize({omie,store=null,settings,apply=false,state=null,statePath=null,logger=console,throttleMs=200}) {
  validateSettings(settings);
  if(!settings.productIds?.length)throw new ConnectorError('PRODUCT_IDS_REQUIRED');
  if(apply && (!store || !state || !statePath))throw new ConnectorError('STATE_AND_STORE_REQUIRED');
  const result={mode:apply?'APPLY':'PREVIEW',examined:0,imported:0,inventoryUpdated:0,unchanged:0,skipped:0,errors:[]};
  for(const id of settings.productIds) {
    result.examined++;
    try {
      const response=await omie.call('products','ConsultarProduto',{codigo_produto:id,codigo_produto_integracao:'',codigo:''});
      const row=asProduct(response,id);
      const product=mapOmieProduct(row,settings.categoryId,settings.variants?.[id]??{});
      const catalogKey=`catalog:${id}`;
      const catalogHash=fingerprint(product);
      let variantId=state?.variantIds?.[id]??null;
      if(apply) {
        let {operation,skip}=prepareOperation(state,catalogKey,catalogHash);
        if(!skip) {
          await saveState(statePath,state); // Grava ID do evento ANTES da chamada remota.
          const data=await store.request('/v1/external/catalog/products/upsert',{
            method:'POST',body:{...product,eventId:operation.eventId,sourceVersion:operation.version},
          });
          if(data.externalProductId!==String(id)||!validateUuid(data.productId))throw new ConnectorError('STORE_CATALOG_ACK_INVALID');
          markDone(state,catalogKey);await saveState(statePath,state);
          result.imported++;
        } else result.unchanged++;
        const liveVariantId=await resolveVariant(store,String(id));
        if(!liveVariantId)throw new ConnectorError('STORE_MAPPING_MISSING');
        if(variantId && variantId!==liveVariantId)throw new ConnectorError('STORE_MAPPING_CHANGED');
        variantId=liveVariantId;
        state.variantIds[id]=variantId;await saveState(statePath,state);
      } else {logger.log(`[preview] produto Omie ${id}: SKU=${product.variants[0].sku} precoCentavos=${product.variants[0].priceCents}`);}
      if(settings.syncStock !== true)continue;
      const stockData=await omie.call('inventory','ListarPosEstoque',{
        nPagina:1,nRegPorPagina:10,cExibeTodos:'S',
        lista_produtos:[{nCodProd:id}],
        ...(settings.warehouseId?{codigo_local_estoque:settings.warehouseId}:{}),
      });
      const physical=readPhysicalStock(stockData,id,settings.warehouseId??null);
      if(!apply){logger.log(`[preview] produto Omie ${id}: estoqueFisico=${physical}`);continue;}
      const stockKey=`stock:${id}`;
      const stockHash=fingerprint({variantId,onHand:physical});
      const {operation:stockOperation,skip:skipStock}=prepareOperation(state,stockKey,stockHash);
      if(skipStock){result.unchanged++;continue;}
      await saveState(statePath,state);
      const updated=await store.request(`/v1/external/inventory/${variantId}`,{
        method:'PUT',body:{eventId:stockOperation.eventId,sourceVersion:stockOperation.version,onHand:physical},
      });
      if(updated.acceptedOnHand!==physical && updated.onHand!==physical)throw new ConnectorError('STORE_STOCK_ACK_INVALID');
      markDone(state,stockKey);await saveState(statePath,state);
      result.inventoryUpdated++;
    }catch(error){
      const code=error instanceof ConnectorError?error.code:'UNEXPECTED_CONNECTOR_ERROR';
      result.errors.push({omieProductId:id,code});result.skipped++;
      logger.error(`[omie] produto ${id}: ${code}`);
    }
    if(throttleMs)await delay(throttleMs);
  }
  return result;
}
async function main() {
  const flags=process.argv.slice(2);
  if(flags.length>1 || (flags.length && flags[0]!=='--apply'))throw new ConnectorError('USAGE_PREVIEW_OR_APPLY');
  const apply=flags[0]==='--apply';
  if(apply && process.env.F40_APPLY!=='CONFIRMO_SINCRONIZACAO')throw new ConnectorError('APPLY_NOT_CONFIRMED');
  const configFile=process.env.F40_OMIE_CONFIG;
  if(!configFile || !isAbsolute(configFile))throw new ConnectorError('CONFIG_FILE_REQUIRED');
  const settings=validateSettings(JSON.parse(await readFile(configFile,'utf8')));
  const omie=createOmieClient({token:process.env.OMIE_APP_TOKEN});
  if(!apply){
    const results=await synchronize({omie,settings});
    console.log(JSON.stringify(results,null,2));
    if(results.errors.length)process.exitCode=1;
    return;
  }
  const path=process.env.F40_STATE_FILE;
  if(!path)throw new ConnectorError('STATE_FILE_REQUIRED');
  const unlock=await lockState(path);
  try {
    const state=await loadState(path);
    const store=createStoreClient({url:process.env.F40_API_URL,token:process.env.F40_INTEGRATION_TOKEN});
    const results=await synchronize({omie,store,settings,apply,state,statePath:path});
    console.log(JSON.stringify(results,null,2));
    if(results.errors.length)process.exitCode=1;
  }finally{await unlock();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error(`[omie] ${e instanceof ConnectorError?e.code:'CONFIG_OR_RUNTIME_ERROR'}`);process.exitCode=1;});
}
