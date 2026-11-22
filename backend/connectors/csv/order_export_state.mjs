/** Estado local de arquivos de pedidos; jamais indica aceite pelo ERP. */
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,open,rename,unlink} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {CsvOrderExportError} from './order_export.mjs';
const fail=code=>{throw new CsvOrderExportError(code);};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export async function loadOrderExportState(path,config){
  if(!isAbsolute(path??''))fail('CSV_ORDER_STATE_ABSOLUTE_REQUIRED');
  let state;
  try{state=JSON.parse(await readFile(path,'utf8'));}
  catch(e){if(e?.code==='ENOENT')return {schema:1,provider:'csv-orders',storeId:config.storeId,
    integrationId:config.integrationId,orders:Object.create(null)};fail('CSV_ORDER_STATE_READ_INVALID');}
  if(state?.schema!==1||state.provider!=='csv-orders'||state.storeId!==config.storeId||
    state.integrationId!==config.integrationId||!plain(state.orders))fail('CSV_ORDER_STATE_TENANT_MISMATCH');
  state.orders=Object.assign(Object.create(null),state.orders);
  return state;
}
export async function lockOrderExportState(path){
  if(!isAbsolute(path??''))fail('CSV_ORDER_STATE_ABSOLUTE_REQUIRED');
  let fd;
  try{fd=await open(`${path}.lock`,'wx',0o600);}
  catch{fail('CSV_ORDER_STATE_LOCKED');}
  return async()=>{await fd.close();await unlink(`${path}.lock`).catch(()=>{});};
}
export async function saveOrderExportState(path,state){
  const tmp=`${path}.${randomUUID()}.tmp`;
  try{await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});await rename(tmp,path);}
  catch{await unlink(tmp).catch(()=>{});fail('CSV_ORDER_STATE_WRITE_FAILED');}
}
export async function createOrderExportFiles({plan,config,outputPath,statePath,clock=()=>new Date()}){
  if(!isAbsolute(outputPath??'')||!isAbsolute(statePath??'')||!outputPath.toLowerCase().endsWith('.csv')||
    outputPath===statePath||outputPath+'.manifest.json'===statePath)fail('CSV_ORDER_OUTPUT_PATH_INVALID');
  const unlock=await lockOrderExportState(statePath);
  try{
    const state=await loadOrderExportState(statePath,config);
    if(plan.summary.storeId!==state.storeId||plan.summary.integrationId!==state.integrationId)
      fail('CSV_ORDER_STATE_TENANT_MISMATCH');
    if(plan.orderIds.some(id=>state.orders[id]))fail('CSV_ORDER_ALREADY_PREPARED_OR_UNCERTAIN');
    // Arquivo existente deve bloquear ANTES do checkpoint, sem sobrescrever dados.
    for(const path of [outputPath,`${outputPath}.manifest.json`]){
      try{const f=await open(path,'r');await f.close();fail('CSV_ORDER_OUTPUT_ALREADY_EXISTS');}
      catch(e){if(e?.code!=='ENOENT')throw e;}
    }
    const batchId=randomUUID(),createdAt=clock().toISOString();
    for(const id of plan.orderIds)state.orders[id]={stage:'RESERVED',batchId,sha256:plan.sha256,createdAt};
    // Persistir a reserva antes da primeira escrita. Erro/queda posterior exige conciliacao manual.
    await saveOrderExportState(statePath,state);
    const manifest={schema:1,batchId,storeId:state.storeId,integrationId:state.integrationId,
      orderIds:plan.orderIds,createdAt,sha256:plan.sha256,rows:plan.summary.lines,
      erpReceived:false,erpOrderCreated:false,note:'Arquivo para importacao manual; concilie o resultado no ERP antes de qualquer nova exportacao.'};
    try{
      await writeFile(outputPath,plan.contents,{flag:'wx',mode:0o600});
      await writeFile(`${outputPath}.manifest.json`,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    }catch{fail('CSV_ORDER_OUTPUT_UNCERTAIN_MANUAL_REVIEW');}
    for(const id of plan.orderIds)state.orders[id].stage='FILE_CREATED';
    await saveOrderExportState(statePath,state);
    return {batchId,mode:'FILE_CREATED',orders:plan.summary.orders,lines:plan.summary.lines,
      totalCents:plan.summary.totalCents,sha256:plan.sha256,erpReceived:false,productionApproved:false};
  }finally{await unlock();}
}
