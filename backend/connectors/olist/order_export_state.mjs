import {randomUUID} from 'node:crypto';
import {OlistConnectorError,validUuid,positiveId} from './clients.mjs';
import {atomicJson,loadJson} from './state.mjs';
const fail=code=>{throw new OlistConnectorError(code);};
export const emptyExportState=storeId=>({schema:1,provider:'olist',storeId,orders:{}});
export async function loadOrderExportState(file,storeId){
  const state=await loadJson(file,{optional:true});
  if(state===null)return emptyExportState(storeId);
  if(state.schema!==1||state.provider!=='olist'||state.storeId!==storeId||
    !state.orders||typeof state.orders!=='object'||Array.isArray(state.orders))fail('ORDER_STATE_TENANT_MISMATCH');
  return state;
}
export function startCreate(state,orderId,reference,now=Date.now()){
  if(!validUuid(orderId)||state.orders[orderId])fail('ORDER_ALREADY_SUBMITTED_OR_PENDING');
  if(!Number.isSafeInteger(now)||now<1)fail('ORDER_VERSION_INVALID');
  const record={stage:'CREATE_IN_FLIGHT',reference,erpId:null,eventId:randomUUID(),sourceVersion:now};
  state.orders[orderId]=record;
  return record;
}
export function setCreated(record,id){
  if(!['CREATE_IN_FLIGHT','NEEDS_RECONCILIATION'].includes(record.stage)||!positiveId(id))fail('ORDER_RECONCILIATION_INVALID');
  record.stage='CREATED';record.erpId=id;
}
export async function persistState(file,state){await atomicJson(file,state);}
export function markUncertain(record){
  if(record.stage==='CREATE_IN_FLIGHT')record.stage='NEEDS_RECONCILIATION';
}
