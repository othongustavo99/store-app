// F5.4: envio assistido de pedidos pagos, um por vez. Nunca retry cego de POST.
import {readFile} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {OlistConnectorError} from './clients.mjs';
import {createTokenManager} from './auth.mjs';
import {lockFile} from './state.mjs';
import {validateOrderExportSettings,prepareOrderExport,checkOlistOrderIdentity} from './order_export_rules.mjs';
import {createOlistOrderClient,createOrderStoreClient} from './order_export_clients.mjs';
import {loadOrderExportState,startCreate,setCreated,persistState,markUncertain} from './order_export_state.mjs';

const fail=code=>{throw new OlistConnectorError(code);};
const synced=(data,expected)=>{
  if(!data?.sync?.externalOrderId)return null;
  const external=Number(data.sync.externalOrderId);
  if(!Number.isSafeInteger(external)||external<1)fail('STORE_EXTERNAL_ID_INVALID');
  if(expected&&external!==expected)fail('STORE_EXTERNAL_ID_CONFLICT');
  return external;
};

export async function exportOne({store,olist,state,statePath,orderId,contactId,mode='PREVIEW',logger=console}){
  const snapshot=await store.request(`/v1/external/orders/${orderId}`);
  const plan=prepareOrderExport(snapshot,contactId);
  const existing=await store.request(`/v1/external/orders/${orderId}/sync`);
  const rec=state?.orders?.[orderId];
  const linkedId=synced(existing,rec?.erpId);
  if(mode==='PREVIEW'){
    // Nao imprimir dados pessoais nem dados fiscais nos logs.
    logger.log(`[preview] ${orderId} itens=${plan.body.itens.length} valorCentavos=${plan.totalCents} vinculado=${Boolean(linkedId)}`);
    return {orderId,preview:true,alreadyLinked:Boolean(linkedId),totalCents:plan.totalCents};
  }
  if(!state||!statePath)fail('ORDER_STATE_REQUIRED');
  if(linkedId){
    if(rec && !['CREATED','LINKED'].includes(rec.stage))fail('ORDER_STATE_CONFLICT');
    if(rec){rec.stage='LINKED';await persistState(statePath,state);}
    return {orderId,alreadyLinked:true,erpId:linkedId};
  }
  if(rec?.stage==='LINKED')fail('ORDER_LINK_MISSING_IN_STORE');
  if(rec?.stage==='CREATE_IN_FLIGHT'||rec?.stage==='NEEDS_RECONCILIATION')fail('ORDER_RECONCILIATION_REQUIRED');
  let current=rec;
  if(!current){
    current=startCreate(state,orderId,plan.reference);
    // Primeiro grava estado, depois tenta criar. Crash antes do POST gera revisao manual segura.
    await persistState(statePath,state);
    try {
      const created=await olist.create(plan.body);
      // Sucesso exige verificar ordem criada e referencia de origem.
      setCreated(current,created.id);
      await persistState(statePath,state);
    }catch(e){
      markUncertain(current);
      await persistState(statePath,state);
      throw e;
    }
  }
  if(current.stage!=='CREATED')fail('ORDER_STATE_INVALID');
  // Mesmo se o POST no Store App falhar, continuaremos desta etapa sem recriar no ERP.
  checkOlistOrderIdentity(await olist.find(current.erpId),plan.reference,current.erpId);
  const confirmation=await store.request(`/v1/external/orders/${orderId}/sync`,{method:'POST',body:{
    eventId:current.eventId,sourceVersion:current.sourceVersion,externalOrderId:String(current.erpId),externalStatus:'RECEIVED',
  }});
  if(confirmation.orderId!==orderId||confirmation.externalOrderId!==String(current.erpId))fail('STORE_LINK_NOT_CONFIRMED');
  current.stage='LINKED';await persistState(statePath,state);
  logger.log(`[linked] ${orderId} ERP=${current.erpId}`);
  return {orderId,erpId:current.erpId,linked:true};
}

export async function reconcileOne({store,olist,state,statePath,orderId,erpId}){
  const record=state.orders[orderId];
  if(!record||!['NEEDS_RECONCILIATION','CREATE_IN_FLIGHT','CREATED'].includes(record.stage))fail('ORDER_RECONCILIATION_INVALID');
  if(record.erpId&&record.erpId!==erpId)fail('ORDER_RECONCILIATION_ID_CONFLICT');
  const remote=await olist.find(erpId);
  checkOlistOrderIdentity(remote,`F40-${orderId}`,erpId);
  setCreated(record,erpId);await persistState(statePath,state);
  const existing=await store.request(`/v1/external/orders/${orderId}/sync`);
  if(synced(existing,erpId)){
    record.stage='LINKED';await persistState(statePath,state);
    return {orderId,erpId,linked:true};
  }
  const ack=await store.request(`/v1/external/orders/${orderId}/sync`,{method:'POST',body:{
    eventId:record.eventId,sourceVersion:record.sourceVersion,externalOrderId:String(erpId),externalStatus:'RECEIVED',
  }});
  if(ack.orderId!==orderId||ack.externalOrderId!==String(erpId))fail('STORE_LINK_NOT_CONFIRMED');
  record.stage='LINKED';await persistState(statePath,state);
  return {orderId,erpId,linked:true};
}

async function main(){
  const argv=process.argv.slice(2);
  const mode=argv.length===0?'PREVIEW':argv.length===1&&argv[0]==='--apply'?'APPLY':argv.length===3&&argv[0]==='--reconcile'?'RECONCILE':null;
  if(!mode)fail('ORDER_USAGE_INVALID');
  if(mode!=='PREVIEW'&&process.env.F40_APPLY!=='CONFIRMO_ENVIO_PEDIDOS')fail('ORDER_APPLY_NOT_CONFIRMED');
  const settingsPath=process.env.F40_OLIST_ORDERS_CONFIG;
  if(!isAbsolute(settingsPath??''))fail('ORDER_CONFIG_ABSOLUTE_REQUIRED');
  const settings=validateOrderExportSettings(JSON.parse(await readFile(settingsPath,'utf8')));
  const statePath=process.env.F40_ORDER_STATE_FILE;
  if(mode!=='PREVIEW'&&!isAbsolute(statePath??''))fail('ORDER_STATE_ABSOLUTE_REQUIRED');
  const store=createOrderStoreClient({url:process.env.F40_API_URL,token:process.env.F40_INTEGRATION_TOKEN});
  const tokenPath=process.env.F40_OLIST_TOKENS_FILE;
  if(!isAbsolute(tokenPath??''))fail('OLIST_TOKEN_FILE_ABSOLUTE_REQUIRED');
  const mgr=createTokenManager({tokenPath,clientId:process.env.OLIST_CLIENT_ID,clientSecret:process.env.OLIST_CLIENT_SECRET});
  const olist=createOlistOrderClient({accessToken:opts=>mgr.accessToken(opts)});
  const unlock=mode==='PREVIEW'?null:await lockFile(statePath);
  try{
    const state=mode==='PREVIEW'?null:await loadOrderExportState(statePath,settings.storeId);
    if(mode==='RECONCILE'){
      const [orderId,id]=argv.slice(1),erpId=Number(id);
      if(!settings.orderIds.includes(orderId)||!Number.isSafeInteger(erpId)||erpId<1)fail('ORDER_RECONCILIATION_INPUT_INVALID');
      console.log(JSON.stringify(await reconcileOne({store,olist,state,statePath,orderId,erpId})));return;
    }
    const results=[];
    for(const orderId of settings.orderIds){
      try{
        results.push(await exportOne({store,olist,state,statePath,orderId,contactId:settings.contactIds[orderId],mode}));
      }catch(e){
        console.error(`[olist-orders] ${orderId}: ${e instanceof OlistConnectorError?e.code:'ORDER_UNEXPECTED_ERROR'}`);
        results.push({orderId,error:e instanceof OlistConnectorError?e.code:'ORDER_UNEXPECTED_ERROR'});
      }
    }
    console.log(JSON.stringify({mode,results},null,2));
    if(results.some(x=>x.error))process.exitCode=1;
  }finally{if(unlock)await unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error('[olist-orders]',e instanceof OlistConnectorError?e.code:'ORDER_RUNTIME_ERROR');process.exitCode=1;});
}
