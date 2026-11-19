// Frequencia40 F5.5: primitives shared by assisted commercial order exporters.
// No automatic queue ACK, no blind retry of ERP order creation, no payment/fiscal write.
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {isAbsolute} from 'node:path';

export class OrderExportError extends Error {
  constructor(code){super(code);this.name='OrderExportError';this.code=code;}
}
export const fail=code=>{throw new OrderExportError(code)};
export const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
export const positive=value=>Number.isSafeInteger(value)&&value>0;
const tokenRegex=/^f40i_[A-Za-z0-9_-]{43}$/;
export const safeMoney=cents=>Number((cents/100).toFixed(2));
const cents=value=>{
  if(typeof value!=='string'||!/^(0|[1-9]\d{0,9})$/.test(value))fail('ORDER_CENTS_INVALID');
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number>1_000_000_000)fail('ORDER_CENTS_INVALID');
  return number;
};
export function validateSettings(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||!uuid(input.storeId)||
    !Array.isArray(input.orderIds)||!input.orderIds.length||input.orderIds.length>30||
    input.orderIds.some(x=>!uuid(x))||new Set(input.orderIds).size!==input.orderIds.length||
    !input.contactIds||typeof input.contactIds!=='object'||Array.isArray(input.contactIds)||
    Object.keys(input.contactIds).some(x=>!input.orderIds.includes(x)||!positive(input.contactIds[x])) ||
    input.orderIds.some(x=>!positive(input.contactIds[x])))fail('ORDER_SETTINGS_INVALID');
  return input;
}
export function paidPickup(input){
  const o=input?.order;
  if(!o||!uuid(o.id))fail('ORDER_SNAPSHOT_INVALID');
  if(o.isDemo!==false||!['PAID','PREPARING','SHIPPED','DELIVERED'].includes(o.status)||
    o.paymentStatus!=='APPROVED')fail('ORDER_PAYMENT_NOT_CONFIRMED');
  if(o.fulfillmentMethod!=='PICKUP')fail('ORDER_DELIVERY_UNSUPPORTED');
  if(!Array.isArray(o.items)||!o.items.length||o.items.length>100)fail('ORDER_ITEMS_INVALID');
  const seen=new Set();let subtotal=0;
  const lines=o.items.map(x=>{
    if(!uuid(x.variantId)||seen.has(x.variantId))fail('ORDER_VARIANT_INVALID');seen.add(x.variantId);
    if(!/^\d{1,15}$/.test(String(x.externalVariantId??''))||!positive(Number(x.externalVariantId)))fail('ORDER_PRODUCT_NOT_MAPPED');
    if(!positive(x.quantity)||x.quantity>10000)fail('ORDER_QTY_INVALID');
    const price=cents(x.unitPriceCents);if(price===0)fail('ORDER_PRICE_INVALID');
    subtotal+=price*x.quantity;
    if(!Number.isSafeInteger(subtotal)||subtotal>1_000_000_000)fail('ORDER_TOTAL_OVERFLOW');
    return {variantId:x.variantId,productId:Number(x.externalVariantId),qty:x.quantity,price};
  });
  const declared=cents(o.subtotalCents),shipping=cents(o.shippingCents),discount=cents(o.discountCents),total=cents(o.totalCents);
  if(subtotal!==declared||subtotal+shipping-discount!==total||total<=0)fail('ORDER_TOTALS_MISMATCH');
  // Initial exporters must NOT silently distribute discounts or freight for accounting.
  if(shipping!==0||discount!==0)fail('ORDER_DISCOUNT_OR_FREIGHT_REQUIRES_MAPPING');
  return {id:o.id,reference:`F40-${o.id}`,lines,totalCents:total};
}
export function createStoreOrderClient({url,token,fetchImpl=fetch}){
  let u;try{u=new URL(url);}catch{fail('STORE_URL_INVALID');}
  if(!u||u.pathname!=='/'||u.search||u.hash||u.username||u.password||
    (u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))||
    !tokenRegex.test(token??''))fail('STORE_URL_OR_TOKEN_INVALID');
  return {async request(path,{method='GET',body}={}){
    const m=/^\/v1\/external\/orders\/([\da-f-]{36})(\/sync)?$/i.exec(path);
    if(!m||!uuid(m[1])||(method!=='GET'&&!(method==='POST'&&m[2])))fail('STORE_ROUTE_FORBIDDEN');
    let response;
    try{response=await fetchImpl(new URL(path,u),{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{fail('STORE_REQUEST_FAILED');}
    if(!response.ok)fail(`STORE_HTTP_${response.status}`);
    try{return await response.json();}catch{fail('STORE_INVALID_JSON');}
  }};
}
export async function lockState(path){
  if(!isAbsolute(path))fail('STATE_PATH_MUST_BE_ABSOLUTE');
  let handle;
  try{handle=await open(path+'.lock','wx',0o600);await handle.writeFile(String(process.pid));}
  catch{fail('ORDER_STATE_LOCKED');}
  return async()=>{await handle.close();await unlink(path+'.lock').catch(()=>{});};
}
export async function saveState(path,state){
  if(!isAbsolute(path))fail('STATE_PATH_MUST_BE_ABSOLUTE');
  const temp=`${path}.${randomUUID()}.tmp`;
  try{await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);}
  catch{await unlink(temp).catch(()=>{});fail('ORDER_STATE_WRITE_FAILED');}
}
export async function loadState(path,provider,storeId){
  if(!isAbsolute(path)||!uuid(storeId)||!['bling','omie'].includes(provider))fail('ORDER_STATE_INPUT_INVALID');
  let state;
  try{state=JSON.parse(await readFile(path,'utf8'));}
  catch(e){if(e.code==='ENOENT')return {schema:1,provider,storeId,orders:{}};fail('ORDER_STATE_READ_FAILED');}
  if(state?.schema!==1||state.provider!==provider||state.storeId!==storeId||!state.orders||
    Array.isArray(state.orders)||typeof state.orders!=='object')fail('ORDER_STATE_TENANT_MISMATCH');
  return state;
}
function remoteId(record){
  const id=Number(record?.externalOrderId);return positive(id)?id:null;
}
export async function exportOrder({provider,store,erp,settings,orderId,state=null,statePath=null,apply=false,logger=console}){
  validateSettings(settings);
  if(!settings.orderIds.includes(orderId))fail('ORDER_NOT_SELECTED');
  const snap=await store.request(`/v1/external/orders/${orderId}`);
  const data=paidPickup(snap),plan=provider.plan(data,settings,settings.contactIds[orderId]);
  const saved=await store.request(`/v1/external/orders/${orderId}/sync`);
  const linked=remoteId(saved?.sync),local=state?.orders?.[orderId];
  if(linked&&local?.erpId&&linked!==local.erpId)fail('ERP_LINK_CONFLICT');
  if(!apply){
    logger.log(`[preview] ${provider.id} ${orderId} itens=${data.lines.length} centavos=${data.totalCents} link=${Boolean(linked)}`);
    return {orderId,mode:'PREVIEW',items:data.lines.length,totalCents:data.totalCents,alreadyLinked:Boolean(linked)};
  }
  if(!state||!statePath)fail('ORDER_STATE_REQUIRED');
  if(linked){if(local&&local.stage!=='LINKED'&&local.stage!=='CREATED')fail('ORDER_RECONCILIATION_REQUIRED');
    if(local){local.stage='LINKED';await saveState(statePath,state);}
    return {orderId,erpId:linked,alreadyLinked:true};}
  if(local?.stage==='LINKED')fail('ORDER_LINK_MISSING_IN_STORE');
  if(['CREATE_IN_FLIGHT','NEEDS_RECONCILIATION'].includes(local?.stage))fail('ORDER_RECONCILIATION_REQUIRED');
  let record=local;
  if(!record){
    record={stage:'CREATE_IN_FLIGHT',reference:data.reference,eventId:randomUUID(),sourceVersion:Date.now(),erpId:null};
    state.orders[orderId]=record;await saveState(statePath,state);
    try{
      const result=await erp.create(plan.body);
      if(!positive(result?.id))fail('ERP_CREATE_RESPONSE_UNCERTAIN');
      record.stage='CREATED';record.erpId=result.id;await saveState(statePath,state);
    }catch(e){
      record.stage='NEEDS_RECONCILIATION';await saveState(statePath,state);
      throw e;
    }
  }
  if(record.stage!=='CREATED'||!positive(record.erpId)||record.reference!==data.reference)fail('ORDER_STATE_INCONSISTENT');
  const remote=await erp.find(record.erpId);
  provider.verify(remote,data.reference,record.erpId);
  const ack=await store.request(`/v1/external/orders/${orderId}/sync`,{method:'POST',body:{
    eventId:record.eventId,sourceVersion:record.sourceVersion,externalOrderId:String(record.erpId),externalStatus:'RECEIVED',
  }});
  if(ack?.orderId!==orderId||ack.externalOrderId!==String(record.erpId))fail('STORE_LINK_NOT_CONFIRMED');
  record.stage='LINKED';await saveState(statePath,state);
  logger.log(`[linked] ${provider.id} ${orderId} ERP=${record.erpId}`);
  return {orderId,erpId:record.erpId,linked:true};
}
export async function reconcileOrder({provider,store,erp,state,statePath,orderId,erpId}){
  if(!uuid(orderId)||!positive(erpId))fail('ORDER_RECONCILE_INPUT_INVALID');
  const rec=state?.orders?.[orderId];
  if(!rec||!['NEEDS_RECONCILIATION','CREATE_IN_FLIGHT','CREATED'].includes(rec.stage)||
    (rec.erpId&&rec.erpId!==erpId)||rec.reference!==`F40-${orderId}`)fail('ORDER_RECONCILIATION_INVALID');
  provider.verify(await erp.find(erpId),rec.reference,erpId);
  rec.erpId=erpId;rec.stage='CREATED';await saveState(statePath,state);
  const linked=remoteId((await store.request(`/v1/external/orders/${orderId}/sync`))?.sync);
  if(linked&&linked!==erpId)fail('ERP_LINK_CONFLICT');
  if(!linked){const ack=await store.request(`/v1/external/orders/${orderId}/sync`,{method:'POST',body:{eventId:rec.eventId,sourceVersion:rec.sourceVersion,externalOrderId:String(erpId),externalStatus:'RECEIVED'}});
    if(ack?.orderId!==orderId||ack.externalOrderId!==String(erpId))fail('STORE_LINK_NOT_CONFIRMED');}
  rec.stage='LINKED';await saveState(statePath,state);
  return {orderId,erpId,linked:true};
}
