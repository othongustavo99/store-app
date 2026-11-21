// F40 F5.7: conciliação NÃO financeira. Nenhuma alteração de pagamento, estoque,
// cancelamento, expedição ou documentos fiscais é feita por este módulo.
import {randomUUID} from 'node:crypto';

export class StatusError extends Error {
  constructor(code){super(code);this.name='StatusError';this.code=code;}
}
const fail=code=>{throw new StatusError(code)};
const isUuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
const statuses=new Set(['RECEIVED','ACCEPTED','PROCESSING','INVOICED','DISPATCHED','DELIVERED','CANCELED','ERROR']);
const blocked=new Set(['CANCELED','ERROR']);
const orderAllowed=new Set(['PAID','PREPARING','SHIPPED','DELIVERED']);
const eventCodes=new Set(['REVIEW_UNCERTAIN_CREATION','REVIEW_STATE_CONFLICT','REVIEW_STORE_LINK_MISSING',
  'REVIEW_EXTERNAL_ID_CONFLICT','REVIEW_IDENTITY_MISMATCH','REVIEW_REMOTE_UNAVAILABLE',
  'REVIEW_STATUS_UNMAPPED','REVIEW_ORDER_CLOSED','REVIEW_REMOTE_EXCEPTION',
  'REVIEW_STATUS_CHANGE_CONFLICT','REVIEW_STATUS_UNSAFE','REVIEW_STATUS_UPDATE_FAILED',
  'NOT_EXPORTED','UNCHANGED','STATUS_CHANGED','STATUS_UPDATED','STATUS_RECOVERED']);

export function validateStatusMap(map){
  if(!map||typeof map!=='object'||Array.isArray(map))fail('STATUS_MAP_REQUIRED');
  const entries=Object.entries(map);
  if(!entries.length||entries.length>80)fail('STATUS_MAP_REQUIRED');
  for(const [key,val] of entries){
    if(!/^[a-zA-Z0-9_.-]{1,36}$/.test(key)||!statuses.has(val))fail('STATUS_MAP_INVALID');
  }
  return map;
}
export function rawProviderStatus(provider,remote){
  if(!['omie','bling','olist'].includes(provider))fail('STATUS_PROVIDER_INVALID');
  const payload=provider==='omie'
    ?(Array.isArray(remote?.pedido_venda_produto)?remote.pedido_venda_produto[0]:remote?.pedido_venda_produto??remote)
    :provider==='bling'?(remote?.data??remote):remote;
  const raw=provider==='omie'?payload?.cabecalho?.etapa:
    provider==='bling'?payload?.situacao?.id:payload?.situacao;
  if((typeof raw!=='string'&&typeof raw!=='number')||!String(raw).match(/^[a-zA-Z0-9_.-]{1,36}$/))
    return null;
  return String(raw);
}
export function mappedStatus(provider,remote,map){
  const raw=rawProviderStatus(provider,remote);
  if(raw===null||!Object.hasOwn(map,raw))return {raw:raw??null,status:null};
  return {raw,status:map[raw]};
}
const numberId=value=>typeof value==='number'?value:Number(value);
function remoteId(value){const n=numberId(value);return Number.isSafeInteger(n)&&n>0?n:null;}
function safeLink(sync){return sync&&typeof sync==='object'?sync:null;}
function recordResult(orderId,result,other={}){
  if(!eventCodes.has(result))fail('STATUS_RESULT_INVALID');
  return {orderId,result,...other};
}
function existingPending(state,orderId){
  const value=state.statusUpdates?.[orderId];
  if(value===undefined)return null;
  if(!value||!isUuid(value.eventId)||!Number.isSafeInteger(value.sourceVersion)||value.sourceVersion<1||
    !remoteId(value.externalOrderId)||!statuses.has(value.externalStatus))fail('STATUS_PENDING_INVALID');
  return value;
}
function nextVersion(old){
  const n=old===null?0:Number(old);
  if(!Number.isSafeInteger(n)||n<0||n>=Number.MAX_SAFE_INTEGER)fail('STATUS_VERSION_INVALID');
  return Math.max(n+1,Date.now());
}

// Relatório somente com IDs internos, status e códigos operacionais. Nada de nome,
// CPF, endereço, token ou resposta bruta do fornecedor.
export async function inspectOne({provider,store,erp,state,orderId,statusMap,verify}){
  if(!isUuid(orderId)||typeof verify!=='function'||!['omie','bling','olist'].includes(provider))fail('STATUS_INPUT_INVALID');
  const rec=state.orders?.[orderId];
  const pending=existingPending(state,orderId);
  if(rec&&['CREATE_IN_FLIGHT','NEEDS_RECONCILIATION'].includes(rec.stage))
    return {report:recordResult(orderId,'REVIEW_UNCERTAIN_CREATION'),pending};
  let snap,sync;
  try{
    [snap,sync]=await Promise.all([store.request(`/v1/external/orders/${orderId}`),store.request(`/v1/external/orders/${orderId}/sync`)]);
  }catch{return {report:recordResult(orderId,'REVIEW_REMOTE_UNAVAILABLE'),pending};}
  const order=snap?.order;
  if(order?.id!==orderId||order.isDemo!==false)
    return {report:recordResult(orderId,'REVIEW_STATE_CONFLICT'),pending};
  const link=safeLink(sync?.sync);
  const persisted=remoteId(link?.externalOrderId);
  const fromLocal=remoteId(rec?.erpId);
  if(rec && rec.reference!==`F40-${orderId}`)
    return {report:recordResult(orderId,'REVIEW_STATE_CONFLICT'),pending};
  if(persisted&&fromLocal&&persisted!==fromLocal)
    return {report:recordResult(orderId,'REVIEW_EXTERNAL_ID_CONFLICT'),pending};
  if(rec?.stage==='LINKED'&&!persisted)
    return {report:recordResult(orderId,'REVIEW_STORE_LINK_MISSING'),pending};
  if(!persisted&&rec?.stage==='CREATED')
    return {report:recordResult(orderId,'REVIEW_STORE_LINK_MISSING'),pending};
  if(!persisted&&!fromLocal)return {report:recordResult(orderId,'NOT_EXPORTED'),pending};
  if(!persisted||!fromLocal||rec?.stage!=='LINKED')
    return {report:recordResult(orderId,'REVIEW_STATE_CONFLICT'),pending};
  let remote;
  try{remote=await erp.find(persisted);}
  catch{return {report:recordResult(orderId,'REVIEW_REMOTE_UNAVAILABLE'),pending};}
  try{verify(remote,`F40-${orderId}`,persisted);}
  catch{return {report:recordResult(orderId,'REVIEW_IDENTITY_MISMATCH'),pending};}
  const {raw,status}=mappedStatus(provider,remote,statusMap);
  if(!status)return {report:recordResult(orderId,'REVIEW_STATUS_UNMAPPED',{rawStatus:raw}),pending};
  const previous=link.externalStatus;
  const base={rawStatus:raw,externalStatus:status,storeExternalStatus:previous,erpId:persisted};
  if(!orderAllowed.has(order.status)||order.paymentStatus!=='APPROVED')
    return {report:recordResult(orderId,'REVIEW_ORDER_CLOSED',base),pending};
  if(blocked.has(status))return {report:recordResult(orderId,'REVIEW_STATUS_UNSAFE',base),pending};
  if(pending){
    if(pending.externalOrderId!==persisted||pending.externalStatus!==status)
      return {report:recordResult(orderId,'REVIEW_STATUS_CHANGE_CONFLICT',base),pending};
    if(previous===status)return {report:recordResult(orderId,'STATUS_RECOVERED',base),pending};
    if(Number(link.sourceVersion)>=pending.sourceVersion)
      return {report:recordResult(orderId,'REVIEW_STATUS_CHANGE_CONFLICT',base),pending};
  }
  return {report:recordResult(orderId,previous===status?'UNCHANGED':'STATUS_CHANGED',base),pending,
    link,order};
}

export async function reconcileStatuses({provider,storeId,store,erp,state,orderIds,statusMap,verify,
  apply=false,persist=async()=>{},now=()=>Date.now()}){
  validateStatusMap(statusMap);
  if(!['bling','omie','olist'].includes(provider)||!Array.isArray(orderIds)||orderIds.length>30||
    !orderIds.length||new Set(orderIds).size!==orderIds.length||orderIds.some(x=>!isUuid(x))||
    state.provider!==provider||!isUuid(storeId)||state.storeId!==storeId||
    !state.orders||typeof state.orders!=='object'||Array.isArray(state.orders))
    fail('STATUS_SETTINGS_INVALID');
  if(apply&&!state.statusUpdates)state.statusUpdates={};
  const results=[];
  for(const orderId of orderIds){
    let info;
    try{info=await inspectOne({provider,store,erp,state,orderId,statusMap,verify});}
    catch {results.push(recordResult(orderId,'REVIEW_REMOTE_EXCEPTION'));continue;}
    const {report,pending,link}=info;
    if(!apply){results.push(report);continue;}
    if(report.result==='STATUS_RECOVERED'){
      // Resposta do POST anterior pode ter se perdido, mas o servidor já gravou.
      delete state.statusUpdates[orderId];await persist();
      results.push(report);continue;
    }
    if(report.result!=='STATUS_CHANGED'){
      results.push(report);continue;
    }
    let operation=pending;
    if(!operation){
      let version;
      try{version=nextVersion(link?.sourceVersion);}catch{results.push(recordResult(orderId,'REVIEW_STATUS_CHANGE_CONFLICT'));continue;}
      version=Math.max(version,now());
      if(!Number.isSafeInteger(version)||version<1){results.push(recordResult(orderId,'REVIEW_STATUS_CHANGE_CONFLICT'));continue;}
      operation={eventId:randomUUID(),sourceVersion:version,
        externalOrderId:report.erpId,externalStatus:report.externalStatus};
      state.statusUpdates[orderId]=operation;
      await persist(); // grava antes do POST para permitir replay idempotente
    }
    try{
      const ack=await store.request(`/v1/external/orders/${orderId}/sync`,{method:'POST',body:{
        eventId:operation.eventId,sourceVersion:operation.sourceVersion,
        externalOrderId:String(operation.externalOrderId),externalStatus:operation.externalStatus,
      }});
      if(ack?.orderId!==orderId||ack.externalOrderId!==String(operation.externalOrderId))
        fail('STATUS_ACK_INVALID');
      delete state.statusUpdates[orderId];await persist();
      results.push(recordResult(orderId,'STATUS_UPDATED',{externalStatus:operation.externalStatus}));
    }catch{
      // Não recria eventId/version e não sobrescreve mudanças concorrentes.
      results.push(recordResult(orderId,'REVIEW_STATUS_UPDATE_FAILED'));
    }
  }
  const counts=Object.fromEntries([...new Set(results.map(r=>r.result))].sort().map(result=>
    [result,results.filter(r=>r.result===result).length]));
  return {provider,mode:apply?'APPLY_METADATA':'PREVIEW',checked:results.length,counts,results};
}
