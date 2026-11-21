import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStoreOrderClient,loadState,saveState,lockState,validateSettings} from './safe_order_export.mjs';
import {createOrderStoreClient} from '../olist/order_export_clients.mjs';
import {loadOrderExportState,persistState} from '../olist/order_export_state.mjs';
import {lockFile} from '../olist/state.mjs';
import {StatusError,reconcileStatuses,validateStatusMap} from './order_status_core.mjs';
const fail=x=>{throw new StatusError(x)};
async function writeReport(file,data){
  if(!file)return;
  if(!isAbsolute(file))fail('STATUS_REPORT_PATH_INVALID');
  const temp=`${file}.${randomUUID()}.tmp`;
  await writeFile(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});
  try{await rename(temp,file);}catch{await unlink(temp).catch(()=>{});fail('STATUS_REPORT_WRITE_FAILED');}
}
export async function runStatusCLI({provider,configKey,createErp,verify,argv=process.argv.slice(2),
  env=process.env,logger=console}){
  const apply=argv.length===1&&argv[0]==='--apply-status';
  if(argv.length!==0&&!apply)fail('STATUS_USAGE_INVALID');
  if(apply&&(env.F40_STATUS_WRITE_ENABLED!=='CONFIRMO_STATUS_ERP'||
    env.F40_ORDER_PROVIDER_CONTRACT_CONFIRMED!=='SIM_HOMOLOGACAO'||
    env.F40_ORDER_STATUS_MAP_CONFIRMED!=='SIM'))fail('STATUS_WRITE_NOT_AUTHORIZED');
  if(!isAbsolute(env[configKey]??''))fail('STATUS_SETTINGS_PATH_INVALID');
  if(!isAbsolute(env.F40_ORDER_STATE_FILE??''))fail('STATUS_STATE_PATH_INVALID');
  const settings=validateSettings(JSON.parse(await readFile(env[configKey],'utf8')));
  const statusMap=validateStatusMap(settings.statusMap);
  const path=env.F40_ORDER_STATE_FILE;
  // Mesmo lock do executor de pedidos: o relatorio nunca roda enquanto outra tarefa escreve o estado.
  const unlock=provider==='olist'?await lockFile(path):await lockState(path);
  try{
    const state=provider==='olist'?await loadOrderExportState(path,settings.storeId):
      await loadState(path,provider,settings.storeId);
    const store=provider==='olist'?createOrderStoreClient({url:env.F40_API_URL,token:env.F40_INTEGRATION_TOKEN}):
      createStoreOrderClient({url:env.F40_API_URL,token:env.F40_INTEGRATION_TOKEN});
    const erp=await createErp(env);
    const report=await reconcileStatuses({provider,storeId:settings.storeId,store,erp,state,orderIds:settings.orderIds,
      statusMap,verify,apply,persist:()=>provider==='olist'?persistState(path,state):saveState(path,state)});
    await writeReport(env.F40_STATUS_REPORT_FILE,report);
    logger.log(JSON.stringify(report,null,2));
    return report;
  }finally{await unlock();}
}
