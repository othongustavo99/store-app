import {readFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createTokenManager} from './auth.mjs';
import {createOrderStoreClient,createOlistOrderClient} from './order_export_clients.mjs';
import {validateOrderExportSettings} from './order_export_rules.mjs';
import {loadOrderExportState} from './order_export_state.mjs';
import {exportOne} from './order_export.mjs';
import {lockFile} from './state.mjs';
import {createLeasedQueueClient,QueueError} from '../shared/leased_queue_client.mjs';
import {createConnectorHealthClient} from '../shared/connector_health_client.mjs';
import {consumeOrderBatch,runOrderQueue} from '../shared/order_queue_core.mjs';
import {queueOptions} from '../shared/order_queue_cli.mjs';
export async function main(){
  const env=process.env,opts=queueOptions(env);
  const configPath=env.F40_OLIST_ORDERS_CONFIG,statePath=env.F40_ORDER_STATE_FILE;
  if(!isAbsolute(configPath??'')||!isAbsolute(statePath??'')||!isAbsolute(env.F40_OLIST_TOKENS_FILE??''))
    throw new QueueError('QUEUE_PATH_INVALID');
  const settings=validateOrderExportSettings(JSON.parse(await readFile(configPath,'utf8')));
  const store=createOrderStoreClient({url:env.F40_API_URL,token:env.F40_INTEGRATION_TOKEN});
  const queue=createLeasedQueueClient({url:env.F40_API_URL,token:env.F40_INTEGRATION_TOKEN});
  const onCycle=createConnectorHealthClient({url:env.F40_API_URL,token:env.F40_INTEGRATION_TOKEN});
  const manager=createTokenManager({tokenPath:env.F40_OLIST_TOKENS_FILE,clientId:env.OLIST_CLIENT_ID,clientSecret:env.OLIST_CLIENT_SECRET});
  const olist=createOlistOrderClient({accessToken:options=>manager.accessToken(options)});
  const unlock=await lockFile(statePath);
  let stop=false;
  const onStop=()=>{stop=true;};
  process.once('SIGINT',onStop);process.once('SIGTERM',onStop);
  try{
    const state=await loadOrderExportState(statePath,settings.storeId);
    return await runOrderQueue({...opts,stopping:()=>stop,onCycle,
      batch:()=>consumeOrderBatch({queue,limit:opts.limit,allowedOrderIds:new Set(settings.orderIds),
        getSnapshot:id=>store.request(`/v1/external/orders/${id}`),
        exportOne:id=>exportOne({store,olist,state,statePath,orderId:id,
          contactId:settings.contactIds[id],mode:'APPLY'})})});
  }finally{
    process.removeListener('SIGINT',onStop);process.removeListener('SIGTERM',onStop);
    await unlock();
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error('[olist-queue]',error?.code??'QUEUE_RUNTIME_ERROR');process.exitCode=1;});
}
