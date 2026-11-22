/** Frequencia40 F5.17 — conciliacao OFFLINE dos arquivos de pedidos exportados.
 * Nunca fala com ERP, nunca altera pagamento/estoque/fiscal e nao libera reexportacao.
 */
import {createHash} from 'node:crypto';
import {CsvOrderExportError} from './order_export.mjs';

const fail=code=>{throw new CsvOrderExportError(code);};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).every(k=>keys.includes(k));
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const alias=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9_-]{1,39}$/.test(x);
const ref=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/-]{3,119}$/.test(x);
const timestamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const allowedManifest=['schema','batchId','storeId','integrationId','orderIds','createdAt','sha256','rows','erpReceived','erpOrderCreated','note'];
const allowedReceipt=['schema','storeId','integrationId','batchId','exportSha256','operatorAlias','verifiedAt','evidenceRef','acknowledgement','decisions'];
const allowedDecision=['orderId','result','externalOrderId','checks','reasonCode'];
const reasons=['ERP_REJECTED','NOT_FOUND','QUANTITY_DIVERGENCE','VALUE_DIVERGENCE','REFERENCE_DIVERGENCE','DUPLICATE_SUSPECTED','NO_EVIDENCE','OTHER','UNKNOWN'];
const mismatchReasons=new Set(['QUANTITY_DIVERGENCE','VALUE_DIVERGENCE','REFERENCE_DIVERGENCE','DUPLICATE_SUSPECTED']);

export function validateReconciliationManifest(m){
  if(!exact(m,allowedManifest)||m.schema!==1||!uuid(m.batchId)||!uuid(m.storeId)||!uuid(m.integrationId)||
    !sha(m.sha256)||!timestamp(m.createdAt)||!Array.isArray(m.orderIds)||m.orderIds.length<1||m.orderIds.length>30||
    m.orderIds.some(id=>!uuid(id))||new Set(m.orderIds).size!==m.orderIds.length||
    !Number.isSafeInteger(m.rows)||m.rows<m.orderIds.length||m.rows>3000||
    m.erpReceived!==false||m.erpOrderCreated!==false||typeof m.note!=='string'||m.note.length>250)
    fail('CSV_RECONCILE_MANIFEST_INVALID');
  return m;
}
export function validateManualReceipt(r,m){
  if(!exact(r,allowedReceipt)||r.schema!==1||r.storeId!==m.storeId||r.integrationId!==m.integrationId||
    r.batchId!==m.batchId||r.exportSha256!==m.sha256||!alias(r.operatorAlias)||!timestamp(r.verifiedAt)||
    !ref(r.evidenceRef)||r.acknowledgement!=='CONFIRMO_CONFERENCIA_NO_ERP'||
    !Array.isArray(r.decisions)||r.decisions.length!==m.orderIds.length)
    fail('CSV_RECONCILE_RECEIPT_INVALID');
  const known=new Set(m.orderIds),ids=new Set(),external=new Set();
  for(const d of r.decisions){
    if(!exact(d,allowedDecision)||!uuid(d.orderId)||!known.has(d.orderId)||ids.has(d.orderId)||
      !['IMPORTED','REJECTED','UNCERTAIN'].includes(d.result))fail('CSV_RECONCILE_DECISION_INVALID');
    ids.add(d.orderId);
    if(d.result==='IMPORTED'){
      if(!ref(d.externalOrderId)||external.has(d.externalOrderId))fail('CSV_RECONCILE_EXTERNAL_REF_INVALID');
      external.add(d.externalOrderId);
      if(!exact(d.checks,['reference','items','total'])||Object.keys(d.checks).length!==3||
        d.checks.reference!==true||d.checks.items!==true||d.checks.total!==true||
        Object.hasOwn(d,'reasonCode'))fail('CSV_RECONCILE_IMPORTED_CHECKS_REQUIRED');
    } else {
      if(Object.hasOwn(d,'externalOrderId'))fail('CSV_RECONCILE_EXTERNAL_REF_INVALID');
      if(!reasons.includes(d.reasonCode)||Object.hasOwn(d,'checks'))fail('CSV_RECONCILE_REASON_REQUIRED');
    }
  }
  if(ids.size!==m.orderIds.length)fail('CSV_RECONCILE_DECISION_MISSING');
  return r;
}
export function prepareManualReconciliation({manifest,csvBytes,state,receipt,now=new Date()}){
  const m=validateReconciliationManifest(manifest);
  if(typeof csvBytes!=='string'&&!Buffer.isBuffer(csvBytes)&&!(csvBytes instanceof Uint8Array))fail('CSV_RECONCILE_CSV_INVALID');
  if(digest(csvBytes)!==m.sha256)fail('CSV_RECONCILE_CSV_HASH_MISMATCH');
  const csvText=Buffer.from(csvBytes).toString('utf8');
  if(!csvText.endsWith('\r\n')||(csvText.match(/\r\n/g)??[]).length!==m.rows+1)
    fail('CSV_RECONCILE_ROW_COUNT_MISMATCH');
  if(!obj(state)||state.schema!==1||state.provider!=='csv-orders'||state.storeId!==m.storeId||
    state.integrationId!==m.integrationId||!obj(state.orders))fail('CSV_RECONCILE_TENANT_MISMATCH');
  if(!Object.values(state.orders).every(x=>obj(x)))fail('CSV_RECONCILE_STATE_INVALID');
  for(const id of m.orderIds){
    const s=state.orders[id];
    if(!s||s.stage!=='FILE_CREATED'||s.batchId!==m.batchId||s.sha256!==m.sha256||
      s.createdAt!==m.createdAt||Object.hasOwn(s,'reconciliation'))fail('CSV_RECONCILE_STATE_NOT_READY');
  }
  const r=validateManualReceipt(receipt,m);
  const previousExternalIds=new Set();
  for(const [id,entry] of Object.entries(state.orders)){
    if(m.orderIds.includes(id))continue;
    const previous=entry.reconciliation?.externalOrderId;
    if(typeof previous==='string'&&previous.length)previousExternalIds.add(previous);
  }
  if(r.decisions.some(d=>d.result==='IMPORTED'&&previousExternalIds.has(d.externalOrderId)))
    fail('CSV_RECONCILE_EXTERNAL_REF_ALREADY_USED');
  const rightNow=now instanceof Date?now.getTime():NaN;
  const verified=Date.parse(r.verifiedAt);
  // Nao aceitar atestados no futuro, ou data muito antiga em relacao a geracao do CSV.
  if(!Number.isFinite(rightNow)||!Number.isFinite(verified)||verified>rightNow+5*60_000||
    verified<Date.parse(m.createdAt)-5*60_000)fail('CSV_RECONCILE_VERIFICATION_TIME_INVALID');
  const byId=new Map(r.decisions.map(d=>[d.orderId,d]));
  const ordered=m.orderIds.map(id=>byId.get(id));
  const count=result=>ordered.filter(d=>d.result===result).length;
  const binding={schema:1,storeId:m.storeId,integrationId:m.integrationId,batchId:m.batchId,
    exportSha256:m.sha256,operatorAlias:r.operatorAlias,verifiedAt:r.verifiedAt,
    evidenceRef:r.evidenceRef,decisions:ordered};
  const previewSha256=digest(JSON.stringify(binding));
  return {binding,previewSha256,summary:{mode:'PREVIEW',provider:'csv-orders',batchId:m.batchId,
    orders:m.orderIds.length,reportedImported:count('IMPORTED'),reportedRejected:count('REJECTED'),
    uncertain:count('UNCERTAIN'),divergent:ordered.filter(d=>mismatchReasons.has(d.reasonCode)).length,
    previewSha256,manualOnly:true,externalApiVerified:false,
    erpReceivedConfirmedByApi:false,productionApproved:false,reexportAuthorized:false}};
}
export function createManualReconciliationReport(plan,{recordedAt=new Date().toISOString()}={}){
  return {schema:1,kind:'F40_CSV_MANUAL_RECONCILIATION',...plan.binding,
    previewSha256:plan.previewSha256,recordedAt,manualOnly:true,
    externalApiVerified:false,erpReceivedConfirmedByApi:false,productionApproved:false,
    reexportAuthorized:false,note:'Atestado humano. Nao confirma recebimento por API, emissao fiscal, pagamento ou estoque.'};
}
export function sha256Bytes(bytes){return digest(bytes);}
