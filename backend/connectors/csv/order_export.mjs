/** Frequencia40 — Fase 5.16. Planejamento local de exportacao manual de pedidos em CSV.
 * Nenhuma criacao de pedido externo, ACK, alteracao fiscal ou financeira.
 */
import {createHash} from 'node:crypto';

export class CsvOrderExportError extends Error {
  constructor(code){super(code);this.name='CsvOrderExportError';this.code=code;}
}
const fail=code=>{throw new CsvOrderExportError(code);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const fields=['orderReference','orderId','orderDate','productCode','sku','productName','quantity','unitPrice','lineTotal','orderTotal'];
const required=['orderReference','orderDate','productCode','quantity','unitPrice','lineTotal','orderTotal'];
const allowed=['schema','storeId','integrationId','orderIds','delimiter','decimalSeparator','columns','utf8Bom','dateTimeZone'];
const cents=x=>{
  if(typeof x!=='string'||!/^(0|[1-9]\d{0,9})$/.test(x))fail('CSV_ORDER_CENTS_INVALID');
  const n=Number(x);if(!Number.isSafeInteger(n)||n>1_000_000_000)fail('CSV_ORDER_CENTS_INVALID');
  return n;
};
const safeInt=x=>Number.isSafeInteger(x)&&x>0&&x<=10000;
const code=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,179}$/.test(x);
const date=x=>{
  if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(x)||!Number.isFinite(Date.parse(x)))return false;
  const y=Number(x.slice(0,4)),m=Number(x.slice(5,7)),d=Number(x.slice(8,10));
  const calendar=new Date(Date.UTC(y,m-1,d));
  return calendar.getUTCFullYear()===y&&calendar.getUTCMonth()+1===m&&calendar.getUTCDate()===d;
};
export function validateOrderExportConfig(value){
  if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k))||value.schema!==1||
    !uuid(value.storeId)||!uuid(value.integrationId)||!Array.isArray(value.orderIds)||
    value.orderIds.length<1||value.orderIds.length>30||value.orderIds.some(id=>!uuid(id))||
    new Set(value.orderIds).size!==value.orderIds.length)fail('CSV_ORDER_SETTINGS_INVALID');
  if(![';',','].includes(value.delimiter)||!['.',','].includes(value.decimalSeparator)||
    value.delimiter===value.decimalSeparator)fail('CSV_ORDER_SEPARATORS_INVALID');
  if(value.utf8Bom!==undefined&&typeof value.utf8Bom!=='boolean')fail('CSV_ORDER_BOM_INVALID');
  if(typeof value.dateTimeZone!=='string'||!/^[A-Za-z_\/+-]{3,64}$/.test(value.dateTimeZone))fail('CSV_ORDER_TIMEZONE_INVALID');
  try{new Intl.DateTimeFormat('en-CA',{timeZone:value.dateTimeZone});}
  catch{fail('CSV_ORDER_TIMEZONE_INVALID');}
  if(!object(value.columns)||Object.keys(value.columns).some(k=>!fields.includes(k)))fail('CSV_ORDER_COLUMNS_INVALID');
  for(const key of required)if(typeof value.columns[key]!=='string')fail('CSV_ORDER_COLUMN_REQUIRED');
  const headers=Object.values(value.columns);
  if(headers.some(v=>typeof v!=='string'||!/^[A-Za-z][A-Za-z0-9 _-]{0,59}$/.test(v))||
    new Set(headers.map(h=>h.toLowerCase())).size!==headers.length)fail('CSV_ORDER_COLUMNS_INVALID');
  return value;
}
function csvCell(input){
  let value=String(input);
  if(/[\u0000-\u001f\u007f]/.test(value))fail('CSV_ORDER_CONTROL_CHAR');
  // Conteudo de produto pode vir do vendedor; nunca abrir formula em planilhas.
  if(/^[\s\uFEFF]*[=+@-]/.test(value))value=`'${value}`;
  return `"${value.replaceAll('"','""')}"`;
}
const price=(c,separator)=>{
  const digits=String(c%100).padStart(2,'0');
  return `${Math.floor(c/100)}${separator}${digits}`;
};
function validateOrder(snapshot){
  const o=snapshot?.order;
  if(!object(o)||!uuid(o.id))fail('CSV_ORDER_SNAPSHOT_INVALID');
  if(o.isDemo!==false||!['PAID','PREPARING'].includes(o.status)||o.paymentStatus!=='APPROVED'||
    o.fulfillmentMethod!=='PICKUP'||o.shippingServiceId)fail('CSV_ORDER_NOT_ELIGIBLE');
  if(!date(o.createdAt))fail('CSV_ORDER_DATE_INVALID');
  if(!Array.isArray(o.items)||o.items.length<1||o.items.length>100)fail('CSV_ORDER_ITEMS_INVALID');
  const seen=new Set();let subtotal=0;
  const lines=o.items.map(item=>{
    if(!object(item)||!uuid(item.variantId)||seen.has(item.variantId))fail('CSV_ORDER_VARIANT_INVALID');
    seen.add(item.variantId);
    if(!code(item.externalVariantId))fail('CSV_ORDER_MAPPING_REQUIRED');
    if(!safeInt(item.quantity))fail('CSV_ORDER_QTY_INVALID');
    const unit=cents(item.unitPriceCents);if(unit===0)fail('CSV_ORDER_PRICE_INVALID');
    const line=unit*item.quantity;
    if(!Number.isSafeInteger(line)||line>1_000_000_000)fail('CSV_ORDER_TOTAL_OVERFLOW');
    subtotal+=line;
    if(!Number.isSafeInteger(subtotal)||subtotal>1_000_000_000)fail('CSV_ORDER_TOTAL_OVERFLOW');
    const sku=typeof item.sku==='string'?item.sku:'';
    const productName=typeof item.productName==='string'?item.productName:'';
    if(sku.length>90||productName.length>200||/[\u0000-\u001f\u007f]/.test(sku+productName))fail('CSV_ORDER_PRODUCT_TEXT_INVALID');
    return {productCode:item.externalVariantId,sku,productName,quantity:item.quantity,unit,subtotal:line};
  });
  const declared=cents(o.subtotalCents),shipping=cents(o.shippingCents),discount=cents(o.discountCents),total=cents(o.totalCents);
  if(subtotal!==declared||total!==subtotal+shipping-discount||total===0)fail('CSV_ORDER_TOTALS_MISMATCH');
  if(shipping!==0||discount!==0)fail('CSV_ORDER_ADJUSTMENTS_UNSUPPORTED');
  return {id:o.id,createdAt:o.createdAt,reference:`F40-${o.id}`,lines,total};
}
export function prepareOrderExport(snapshots,rawConfig){
  const config=validateOrderExportConfig(rawConfig);
  if(!Array.isArray(snapshots)||snapshots.length!==config.orderIds.length)fail('CSV_ORDER_SNAPSHOT_COUNT_INVALID');
  const selected=new Map();
  for(const snapshot of snapshots){
    const order=validateOrder(snapshot);
    if(selected.has(order.id)||!config.orderIds.includes(order.id))fail('CSV_ORDER_UNEXPECTED_ID');
    selected.set(order.id,order);
  }
  if(selected.size!==config.orderIds.length)fail('CSV_ORDER_MISSING');
  const orderList=config.orderIds.map(id=>selected.get(id));
  const keys=Object.keys(config.columns);
  const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:config.dateTimeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  const localDate=timestamp=>{const p=Object.fromEntries(dateFormatter.formatToParts(new Date(timestamp)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;};
  const header=keys.map(k=>csvCell(config.columns[k])).join(config.delimiter);
  const rows=[];let totalCents=0;
  for(const order of orderList){
    totalCents+=order.total;
    if(!Number.isSafeInteger(totalCents)||totalCents>30_000_000_000)fail('CSV_ORDER_BATCH_TOTAL_INVALID');
    for(const item of order.lines){
      const values={orderReference:order.reference,orderId:order.id,orderDate:localDate(order.createdAt),
        productCode:item.productCode,sku:item.sku,productName:item.productName,quantity:item.quantity,
        unitPrice:price(item.unit,config.decimalSeparator),lineTotal:price(item.subtotal,config.decimalSeparator),
        orderTotal:price(order.total,config.decimalSeparator)};
      rows.push(keys.map(k=>csvCell(values[k])).join(config.delimiter));
    }
  }
  const contents=`${config.utf8Bom===false?'':'\uFEFF'}${[header,...rows].join('\r\n')}\r\n`;
  const sha256=createHash('sha256').update(contents).digest('hex');
  return {contents,sha256,summary:{mode:'PREVIEW',provider:'csv',storeId:config.storeId,
    integrationId:config.integrationId,orders:orderList.length,lines:rows.length,totalCents,
    sha256,dateTimeZone:config.dateTimeZone,requiresManualImport:true,erpReceived:false,erpOrderCreated:false,productionApproved:false},
    orderIds:[...config.orderIds]};
}
