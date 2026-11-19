import {createHash} from 'node:crypto';
import {BlingConnectorError,validUuid,positiveId} from './clients.mjs';
const skuRegex=/^[A-Za-z0-9][A-Za-z0-9._-]{1,89}$/;
const gtinRegex=/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/;
export const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function isGtin(value) {
  if(!gtinRegex.test(value))return false;
  let sum=0,weight=3;
  for(let i=value.length-2;i>=0;i--,weight=weight===3?1:3)sum+=Number(value[i])*weight;
  return (10-sum%10)%10===Number(value.at(-1));
}
export function cents(value) {
  if(!['number','string'].includes(typeof value) || !/^\d{1,8}(?:\.\d{1,2})?$/.test(String(value)))throw new BlingConnectorError('BLING_PRICE_INVALID');
  const [whole,dec='']=String(value).split('.');
  const n=Number(whole)*100+Number(dec.padEnd(2,'0'));
  if(!Number.isSafeInteger(n)||n<1||n>100000000)throw new BlingConnectorError('BLING_PRICE_INVALID');
  return n;
}
export function validateSettings(settings) {
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||!validUuid(settings.categoryId))throw new BlingConnectorError('CATEGORY_ID_INVALID');
  if(!Array.isArray(settings.productIds)||settings.productIds.length<1||settings.productIds.length>200||
    settings.productIds.some(x=>!positiveId(x))||new Set(settings.productIds).size!==settings.productIds.length)throw new BlingConnectorError('PRODUCT_IDS_INVALID');
  if(settings.syncStock!==undefined&&typeof settings.syncStock!=='boolean')throw new BlingConnectorError('SYNC_STOCK_INVALID');
  // Nenhum estoque de deposito especifico enquanto nao houver homologacao de multiplos depositos.
  if(settings.stockSource!==undefined&&settings.stockSource!=='TOTAL')throw new BlingConnectorError('STOCK_SOURCE_UNSUPPORTED');
  if(settings.variants!==undefined&&(!settings.variants||typeof settings.variants!=='object'||Array.isArray(settings.variants)))throw new BlingConnectorError('VARIANT_OVERRIDES_INVALID');
  return settings;
}
export function mapProduct(row,categoryId,{color='Padrao',size='Unico'}={}) {
  if(!validUuid(categoryId))throw new BlingConnectorError('CATEGORY_ID_INVALID');
  if(!positiveId(row?.id))throw new BlingConnectorError('BLING_PRODUCT_ID_INVALID');
  if(row.tipo!=='P'||row.formato!=='S')throw new BlingConnectorError('BLING_PRODUCT_UNSUPPORTED_TYPE');
  if(!['A','I'].includes(row.situacao))throw new BlingConnectorError('BLING_SITUATION_UNKNOWN');
  const sku=String(row.codigo??'').trim().toUpperCase();
  if(!skuRegex.test(sku))throw new BlingConnectorError('BLING_SKU_INVALID');
  const name=row.nome;
  if(typeof name!=='string'||name.trim().length<2||name.trim().length>200)throw new BlingConnectorError('BLING_NAME_INVALID');
  if(typeof color!=='string'||color.trim().length<1||color.trim().length>60||typeof size!=='string'||size.trim().length<1||size.trim().length>50)throw new BlingConnectorError('BLING_VARIANT_INVALID');
  const gtin=row.gtin==null?'':String(row.gtin).trim();
  if(gtin&&!isGtin(gtin))throw new BlingConnectorError('BLING_GTIN_INVALID');
  return {externalProductId:String(row.id),categoryId,name:name.trim(),variants:[{
    externalVariantId:String(row.id),sku,priceCents:cents(row.preco),color:color.trim(),size:size.trim(),
    status:row.situacao==='A'?'ACTIVE':'INACTIVE',...(gtin?{gtin}:{})
  }]};
}
export function stockTotal(response,requestedId) {
  const data=response?.data;
  if(!Array.isArray(data))throw new BlingConnectorError('BLING_STOCK_FORMAT_INVALID');
  const rows=data.filter(x=>positiveId(x?.produto?.id)&&x.produto.id===requestedId);
  if(rows.length!==1)throw new BlingConnectorError('BLING_STOCK_AMBIGUOUS');
  const v=rows[0].saldoFisicoTotal;
  if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>1000000)throw new BlingConnectorError('BLING_STOCK_NOT_INTEGER');
  return v;
}
