// CLI guarded runner. The connector does not consume queue events and never auto-ACKs them.
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {createStoreOrderClient,exportOrder,reconcileOrder,lockState,loadState,validateSettings,fail,OrderExportError} from './safe_order_export.mjs';
export async function runOrderCLI({provider,createErp,configKey,argv=process.argv.slice(2),env=process.env,logger=console}){
  const mode=argv.length===0?'PREVIEW':argv.length===1&&argv[0]==='--apply'?'APPLY':
    argv.length===3&&argv[0]==='--reconcile'?'RECONCILE':null;
  if(!mode)fail('USAGE_PREVIEW_APPLY_RECONCILE');
  if(mode!=='PREVIEW'&&(env.F40_APPLY!=='CONFIRMO_ENVIO_PEDIDOS'||env.F40_ORDER_PROVIDER_CONTRACT_CONFIRMED!=='SIM_HOMOLOGACAO'))
    fail('ORDER_WRITE_REQUIRES_EXPLICIT_HOMOLOGATION_CONFIRMATION');
  const settingsPath=env[configKey];
  if(typeof settingsPath!=='string'||!isAbsolute(settingsPath))fail('ORDER_CONFIG_ABSOLUTE_REQUIRED');
  let settings;try{settings=validateSettings(JSON.parse(await readFile(settingsPath,'utf8')));}catch(e){if(e instanceof OrderExportError)throw e;fail('ORDER_CONFIG_UNREADABLE');}
  const path=env.F40_ORDER_STATE_FILE;
  if(mode!=='PREVIEW'&&!isAbsolute(path??''))fail('ORDER_STATE_ABSOLUTE_REQUIRED');
  const store=createStoreOrderClient({url:env.F40_API_URL,token:env.F40_INTEGRATION_TOKEN});
  const erp=mode==='PREVIEW'?null:await createErp(env);
  const unlock=mode==='PREVIEW'?null:await lockState(path);
  try{
    const state=mode==='PREVIEW'?null:await loadState(path,provider.id,settings.storeId);
    if(mode==='RECONCILE'){
      const [orderId,id]=argv.slice(1),erpId=Number(id);
      if(!settings.orderIds.includes(orderId)||!Number.isSafeInteger(erpId)||erpId<=0)fail('RECONCILIATION_ARGUMENT_INVALID');
      const result=await reconcileOrder({provider,store,erp,state,statePath:path,orderId,erpId});
      logger.log(JSON.stringify(result));return {mode,results:[result]};
    }
    const results=[];
    for(const orderId of settings.orderIds){
      try{results.push(await exportOrder({provider,store,erp,settings,orderId,state,statePath:path,apply:mode==='APPLY',logger}));}
      catch(e){const code=e instanceof OrderExportError?e.code:'UNEXPECTED_ERROR';
        logger.error(`[${provider.id}-orders] ${orderId}: ${code}`);results.push({orderId,error:code});}
    }
    if(results.some(x=>x.error))process.exitCode=1;
    logger.log(JSON.stringify({mode,results},null,2));return {mode,results};
  }finally{if(unlock)await unlock();}
}
