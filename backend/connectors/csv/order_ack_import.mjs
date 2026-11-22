/** Frequencia40 F5.18 - analise OFFLINE de comprovante tabular CSV retornado pelo ERP.
 * Saida: proposta conservadora para conferencia humana F5.17. Nao declara ACK ERP.
 */
import {createHash} from 'node:crypto';
import {CsvOrderExportError,validateOrderExportConfig} from './order_export.mjs';
import {validateReconciliationManifest} from './order_reconcile.mjs';

const fail=code=>{throw new CsvOrderExportError(code);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keys=(x,allowed)=>object(x)&&Object.keys(x).every(k=>allowed.includes(k));
const unique=a=>new Set(a).size===a.length;
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const field=x=>typeof x==='string'&&/^[\p{L}\p{N}][\p{L}\p{N} _./()#°º$%-]{0,79}$/u.test(x);
const external=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/-]{3,119}$/.test(x);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX_LINES=3001;
const MAX_COLS=32;

/** Le CSV estrito: aspas RFC4180, ; ou ,, CRLF/LF, BOM opcional. Bloqueia linhas malformadas. */
export function parseStrictCsv(bytes,delimiter){
  if(![';',','].includes(delimiter))fail('CSV_ACK_DELIMITER_INVALID');
  if(typeof bytes!=='string'&&!Buffer.isBuffer(bytes)&&!(bytes instanceof Uint8Array))fail('CSV_ACK_FILE_INVALID');
  let input;
  try{input=new TextDecoder('utf-8',{fatal:true}).decode(typeof bytes==='string'?Buffer.from(bytes):bytes);}
  catch{fail('CSV_ACK_UTF8_INVALID');}
  if(input.charCodeAt(0)===0xfeff)input=input.slice(1);
  if(!input||input.length>2_000_000||/\u0000/.test(input))fail('CSV_ACK_FILE_INVALID');
  const rows=[];let row=[],cell='',quoted=false,afterQuote=false,fieldStart=true;
  const pushCell=()=>{if(cell.length>400)fail('CSV_ACK_CELL_TOO_LONG');row.push(cell);if(row.length>MAX_COLS)fail('CSV_ACK_TOO_MANY_COLUMNS');cell='';afterQuote=false;fieldStart=true;};
  const pushRow=()=>{pushCell();if(row.some(x=>/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x)))fail('CSV_ACK_CONTROL_CHAR');rows.push(row);if(rows.length>MAX_LINES)fail('CSV_ACK_TOO_MANY_ROWS');row=[];};
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(quoted){
      if(ch==='"'){if(input[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}
      else {if(ch==='\r'||ch==='\n')fail('CSV_ACK_MULTILINE_FORBIDDEN');cell+=ch;}
    }else if(afterQuote){
      if(ch===delimiter)pushCell();
      else if(ch==='\r'||ch==='\n'){if(ch==='\r'&&input[i+1]==='\n')i++;pushRow();}
      else fail('CSV_ACK_MALFORMED_QUOTE');
    }else if(ch==='"'){
      if(!fieldStart)fail('CSV_ACK_MALFORMED_QUOTE');quoted=true;fieldStart=false;
    }else if(ch===delimiter){pushCell();}
    else if(ch==='\r'||ch==='\n'){
      if(ch==='\r'&&input[i+1]==='\n')i++;
      pushRow();
    }else {cell+=ch;fieldStart=false;}
    if(cell.length>400)fail('CSV_ACK_CELL_TOO_LONG');
  }
  if(quoted)fail('CSV_ACK_UNCLOSED_QUOTE');
  if(row.length>0||cell.length>0||afterQuote)pushRow();
  if(rows.length<2||rows[0].some(x=>!field(x))||!unique(rows[0].map(x=>x.toLowerCase())))fail('CSV_ACK_HEADER_INVALID');
  if(rows.slice(1).some(r=>r.length!==rows[0].length||r.every(x=>x==='')))fail('CSV_ACK_ROW_INVALID');
  return rows;
}
function indexHeaders(rows,mapping){
  const headers=rows[0];const positions={};
  for(const [name,header] of Object.entries(mapping)){
    const i=headers.indexOf(header);
    if(i<0)fail('CSV_ACK_MAPPED_HEADER_MISSING');
    positions[name]=i;
  }
  return positions;
}
const allowedFields=['orderReference','externalOrderId','status','orderTotal','itemCount'];
const allowedStatuses=['imported','rejected','pending'];
export function validateAckSettings(s){
  if(!keys(s,['schema','storeId','integrationId','delimiter','decimalSeparator','columns','statusValues'])||
     s.schema!==1||!uuid(s.storeId)||!uuid(s.integrationId)||![';',','].includes(s.delimiter)||
     !['.',','].includes(s.decimalSeparator)||s.delimiter===s.decimalSeparator||
     !keys(s.columns,allowedFields)||!['orderReference','status'].every(x=>field(s.columns[x]))||
     Object.entries(s.columns).some(([k,v])=>!allowedFields.includes(k)||!field(v))||
     !unique(Object.values(s.columns).map(x=>x.toLowerCase())))fail('CSV_ACK_SETTINGS_INVALID');
  if(!keys(s.statusValues,allowedStatuses)||!allowedStatuses.every(x=>Array.isArray(s.statusValues[x])&&s.statusValues[x].length>0&&s.statusValues[x].length<=10&&
      s.statusValues[x].every(v=>typeof v==='string'&&/^[A-Za-z0-9 _-]{1,50}$/.test(v))))fail('CSV_ACK_STATUSES_INVALID');
  const vals=Object.values(s.statusValues).flat().map(x=>x.trim().toUpperCase());
  if(!unique(vals)||vals.some(x=>!x))fail('CSV_ACK_STATUSES_INVALID');
  return s;
}
function parseMinor(text,decimalSeparator){
  if(typeof text!=='string')fail('CSV_ACK_AMOUNT_INVALID');
  // Moeda local opcional, com milhares agrupados corretamente; sem arredondamento float.
  let clean=text.trim().replace(/^R\$\s*/,'');
  const groups=decimalSeparator===','?'.':',';
  const base=decimalSeparator===','?
    /^(?:0|[1-9]\d{0,9}|[1-9]\d{0,2}(?:\.\d{3})+),\d{2}$/:
    /^(?:0|[1-9]\d{0,9}|[1-9]\d{0,2}(?:,\d{3})+)\.\d{2}$/;
  if(!base.test(clean))fail('CSV_ACK_AMOUNT_INVALID');
  const [major,fraction]=clean.split(decimalSeparator);
  const minor=Number(major.replaceAll(groups,''))*100+Number(fraction);
  if(!Number.isSafeInteger(minor)||minor>1_000_000_000)fail('CSV_ACK_AMOUNT_INVALID');
  return minor;
}
function expectedOrders(exportCsv,exportSettings,manifest){
  validateOrderExportConfig(exportSettings);
  if(exportSettings.storeId!==manifest.storeId||exportSettings.integrationId!==manifest.integrationId||
     exportSettings.orderIds.length!==manifest.orderIds.length||
     exportSettings.orderIds.some((x,i)=>x!==manifest.orderIds[i]))fail('CSV_ACK_TENANT_OR_BATCH_MISMATCH');
  const rows=parseStrictCsv(exportCsv,exportSettings.delimiter);
  if(rows.length!==manifest.rows+1)fail('CSV_ACK_EXPORT_ROWS_MISMATCH');
  const pos=indexHeaders(rows,exportSettings.columns);
  if(!('orderReference' in pos)||!('orderTotal' in pos)||!('quantity' in pos)||!('orderId' in pos))
    fail('CSV_ACK_EXPORT_MAPPING_REQUIRED');
  const result=new Map(manifest.orderIds.map(id=>[id,{orderId:id,reference:`F40-${id}`,count:0,totalCents:null}]));
  for(const row of rows.slice(1)){
    const id=row[pos.orderId],item=result.get(id);
    if(!item||row[pos.orderReference]!==item.reference)fail('CSV_ACK_EXPORT_REFERENCE_INVALID');
    const qty=Number(row[pos.quantity]);
    if(!/^[1-9]\d{0,4}$/.test(row[pos.quantity])||qty>10000)fail('CSV_ACK_EXPORT_QTY_INVALID');
    const total=parseMinor(row[pos.orderTotal],exportSettings.decimalSeparator);
    if(item.totalCents!==null&&item.totalCents!==total)fail('CSV_ACK_EXPORT_TOTAL_INCONSISTENT');
    item.totalCents=total;item.count++;
  }
  if([...result.values()].some(x=>x.count<1))fail('CSV_ACK_EXPORT_ORDER_MISSING');
  return result;
}
/** Analisa so metadados por pedido, nunca infere recibo humano ou aceite autenticado. */
export function assessErpReturn({manifest,exportCsv,exportSettings,erpCsv,settings,state}){
  validateReconciliationManifest(manifest);
  validateAckSettings(settings);
  if(settings.storeId!==manifest.storeId||settings.integrationId!==manifest.integrationId)fail('CSV_ACK_TENANT_OR_BATCH_MISMATCH');
  if(hash(exportCsv)!==manifest.sha256)fail('CSV_ACK_EXPORT_HASH_MISMATCH');
  if(!object(state)||state.schema!==1||state.provider!=='csv-orders'||state.storeId!==manifest.storeId||
     state.integrationId!==manifest.integrationId||!object(state.orders))fail('CSV_ACK_STATE_INVALID');
  for(const id of manifest.orderIds){const x=state.orders[id];
    if(!object(x)||x.stage!=='FILE_CREATED'||x.batchId!==manifest.batchId||
       x.sha256!==manifest.sha256||x.createdAt!==manifest.createdAt||Object.hasOwn(x,'reconciliation'))fail('CSV_ACK_STATE_NOT_READY');}
  const original=expectedOrders(exportCsv,exportSettings,manifest);
  const rows=parseStrictCsv(erpCsv,settings.delimiter);
  const pos=indexHeaders(rows,settings.columns);
  const byReference=new Map([...original.values()].map(x=>[x.reference,x]));
  const classified=new Map(),externalIds=new Set();
  const lookup=new Map();
  for(const [key,values] of Object.entries(settings.statusValues))for(const value of values)lookup.set(value.trim().toUpperCase(),key);
  for(const row of rows.slice(1)){
    const order=byReference.get(row[pos.orderReference]);
    if(!order)fail('CSV_ACK_UNKNOWN_REFERENCE');
    if(classified.has(order.orderId))fail('CSV_ACK_DUPLICATE_REFERENCE');
    const status=lookup.get(row[pos.status]?.trim().toUpperCase());
    if(!status)fail('CSV_ACK_UNKNOWN_STATUS');
    const rawExternal=pos.externalOrderId===undefined?'':row[pos.externalOrderId].trim();
    if(rawExternal&&(!external(rawExternal)||externalIds.has(rawExternal)))fail('CSV_ACK_EXTERNAL_REF_INVALID');
    if(rawExternal)externalIds.add(rawExternal);
    const errors=[];let erpTotalCents=null,itemCount=null;
    if(pos.orderTotal!==undefined&&row[pos.orderTotal].trim()!==''){
      erpTotalCents=parseMinor(row[pos.orderTotal],settings.decimalSeparator);
      if(erpTotalCents!==order.totalCents)errors.push('VALUE_DIVERGENCE');
    }else errors.push('TOTAL_NOT_PROVIDED');
    if(pos.itemCount!==undefined&&row[pos.itemCount].trim()!==''){
      const raw=row[pos.itemCount].trim();
      if(!/^[1-9]\d{0,3}$/.test(raw))fail('CSV_ACK_ITEM_COUNT_INVALID');
      itemCount=Number(raw);
      if(itemCount!==order.count)errors.push('QUANTITY_DIVERGENCE');
    }else errors.push('ITEM_COUNT_NOT_PROVIDED');
    if(status==='imported'&&!rawExternal)errors.push('ERP_REFERENCE_NOT_PROVIDED');
    classified.set(order.orderId,{orderId:order.orderId,reportedStatus:status,externalOrderId:rawExternal||null,
      expectedLines:order.count,reportedLines:itemCount,expectedTotalCents:order.totalCents,
      reportedTotalCents:erpTotalCents,findings:errors});
  }
  const results=manifest.orderIds.map(id=>classified.get(id)??{orderId:id,reportedStatus:'missing',externalOrderId:null,
    expectedLines:original.get(id).count,reportedLines:null,expectedTotalCents:original.get(id).totalCents,
    reportedTotalCents:null,findings:['NO_RECEIPT_ROW']});
  const count=kind=>results.filter(x=>x.reportedStatus===kind).length;
  const decisions=results.map(x=>({orderId:x.orderId,result:'UNCERTAIN',reasonCode:x.findings.includes('VALUE_DIVERGENCE')?'VALUE_DIVERGENCE':
    x.findings.includes('QUANTITY_DIVERGENCE')?'QUANTITY_DIVERGENCE':x.reportedStatus==='rejected'?'ERP_REJECTED':
    x.reportedStatus==='missing'?'NO_EVIDENCE':'UNKNOWN'}));
  const sourceSha256=hash(erpCsv);
  const binding={schema:1,storeId:manifest.storeId,integrationId:manifest.integrationId,batchId:manifest.batchId,
    exportSha256:manifest.sha256,sourceSha256,settingsSha256:hash(JSON.stringify(settings)),results};
  const previewSha256=hash(JSON.stringify(binding));
  const draft={schema:1,storeId:manifest.storeId,integrationId:manifest.integrationId,batchId:manifest.batchId,
    exportSha256:manifest.sha256,operatorAlias:'',verifiedAt:'',evidenceRef:'',
    decisions}; // Sem acknowledgement: intencionalmente INVALIDO na F5.17 ate conferencia humana.
  return {previewSha256,sourceSha256,
    summary:{mode:'PREVIEW',orders:manifest.orderIds.length,reportedImported:count('imported'),
      reportedRejected:count('rejected'),reportedPending:count('pending'),missingFromReturn:count('missing'),
      withFindings:results.filter(x=>x.findings.length>0).length,
      manualVerificationRequired:true,externalApiVerified:false,erpReceivedConfirmedByApi:false,
      productionApproved:false,reexportAuthorized:false,previewSha256,sourceSha256},
    results,draft};
}
