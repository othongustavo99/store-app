// Runner para Bling e Omie, reutilizando o MESMO registro de exportacao da F5.5.
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {createLeasedQueueClient,QueueError} from './leased_queue_client.mjs';
import {createConnectorHealthClient} from './connector_health_client.mjs';
import {consumeOrderBatch,runOrderQueue} from './order_queue_core.mjs';
import {createStoreOrderClient,exportOrder,loadState,lockState,validateSettings} from './safe_order_export.mjs';
export function queueOptions(env=process.env,argv=process.argv.slice(2)){
  if(argv.length>1||argv.length===1&&argv[0]!=='--once')throw new QueueError('QUEUE_USAGE_INVALID');
  if(env.F40_QUEUE_ENABLED!=='SIM_HOMOLOGADO'||env.F40_APPLY!=='CONFIRMO_ENVIO_PEDIDOS'||
    env.F40_ORDER_PROVIDER_CONTRACT_CONFIRMED!=='SIM_HOMOLOGACAO')throw new QueueError('QUEUE_WRITE_NOT_AUTHORIZED');
  const intervalMs=Number(env.F40_QUEUE_INTERVAL_MS??'10000');
  const limit=Number(env.F40_QUEUE_BATCH_LIMIT??'5');
  if(!Number.isSafeInteger(intervalMs)||intervalMs<5000||intervalMs>60000||
    !Number.isSafeInteger(limit)||limit<1||limit>10)throw new QueueError('QUEUE_TIMING_INVALID');
  return {once:argv[0]==='--once',intervalMs,limit};
}
export async function runQueueCLI({provider,configKey,createErp,env=process.env,argv=process.argv.slice(2),logger=console}){
  const options=queueOptions(env,argv);
  const path=env[configKey],statePath=env.F40_ORDER_STATE_FILE;
  if(!isAbsolute(path??'')||!isAbsolute(statePath??''))throw new QueueError('QUEUE_PATH_INVALID');
  const settings=validateSettings(JSON.parse(await readFile(path,'utf8')));
  const store=createStoreOrderClient({url:env.F40_API_URL,token:env.F40_INTEGRATION_TOKEN});
  const queue=createLeasedQueueClient({url:env.F40_API_URL,token:env.F40_INTEGRATION_TOKEN});
  const onCycle=createConnectorHealthClient({url:env.F40_API_URL,token:env.F40_INTEGRATION_TOKEN});
  // Lock compartilhado com CLI assistido; armazenamento deve sobreviver a restart e deploy.
  const unlock=await lockState(statePath);
  let stop=false;
  const onStop=()=>{stop=true;};
  process.once('SIGINT',onStop);process.once('SIGTERM',onStop);
  try{
    const state=await loadState(statePath,provider.id,settings.storeId);
    const erp=await createErp(env);
    return await runOrderQueue({...options,logger,stopping:()=>stop,onCycle,
      batch:()=>consumeOrderBatch({queue,limit:options.limit,logger,
        allowedOrderIds:new Set(settings.orderIds),
        getSnapshot:id=>store.request(`/v1/external/orders/${id}`),
        exportOne:id=>exportOrder({provider,store,erp,settings,orderId:id,state,statePath,apply:true,logger})})});
  }finally{
    process.removeListener('SIGINT',onStop);process.removeListener('SIGTERM',onStop);
    await unlock();
  }
}
