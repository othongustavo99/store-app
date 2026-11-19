import {createHash} from 'node:crypto';
import {OlistConnectorError,validUuid,positiveId} from './clients.mjs';
export const fingerprint=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const sku=/^[A-Za-z0-9][A-Za-z0-9._-]{1,89}$/;
function gtinValid(v){if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(v))return false;let sum=0,w=3;for(let i=v.length-2;i>=0;i--,w=w===3?1:3)sum+=Number(v[i])*w;return (10-sum%10)%10===Number(v.at(-1));}
export function cents(v){
  if(!['string','number'].includes(typeof v)||!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(String(v)))throw new OlistConnectorError('OLIST_PRICE_INVALID');
  const [whole,decimal='']=String(v).split('.');const result=Number(whole)*100+Number(decimal.padEnd(2,'0'));
  if(!Number.isSafeInteger(result)||result<1||result>100000000)throw new OlistConnectorError('OLIST_PRICE_INVALID');return result;
}
export function validateSettings(settings){
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||!validUuid(settings.categoryId))throw new OlistConnectorError('CATEGORY_ID_INVALID');
  if(!Array.isArray(settings.productIds)||settings.productIds.length<1||settings.productIds.length>200||settings.productIds.some(x=>!positiveId(x))||new Set(settings.productIds).size!==settings.productIds.length)throw new OlistConnectorError('PRODUCT_IDS_INVALID');
  if(settings.syncStock!==undefined&&typeof settings.syncStock!=='boolean')throw new OlistConnectorError('SYNC_STOCK_INVALID');
  if(settings.stockSource!==undefined&&settings.stockSource!=='TOTAL')throw new OlistConnectorError('STOCK_SOURCE_UNSUPPORTED');
  if(settings.variants!==undefined&&(!settings.variants||typeof settings.variants!=='object'||Array.isArray(settings.variants)))throw new OlistConnectorError('VARIANTS_INVALID');
  return settings;
}
export function mapProduct(row,categoryId,{color='Padrao',size='Unico'}={}){
  if(!validUuid(categoryId))throw new OlistConnectorError('CATEGORY_ID_INVALID');
  if(!positiveId(row?.id))throw new OlistConnectorError('OLIST_PRODUCT_ID_INVALID');
  if(row.tipo!=='S'||(row.tipoVariacao!=null&&row.tipoVariacao!=='N')||(Array.isArray(row.variacoes)&&row.variacoes.length>0)||
    (Array.isArray(row.kit)&&row.kit.length>0)||row.produtoPai?.id)throw new OlistConnectorError('OLIST_COMPLEX_PRODUCT_UNSUPPORTED');
  if(!['A','I'].includes(row.situacao))throw new OlistConnectorError('OLIST_STATUS_UNKNOWN');
  const productSku=String(row.sku??'').trim().toUpperCase();
  if(!sku.test(productSku))throw new OlistConnectorError('OLIST_SKU_INVALID');
  const name=row.descricao;if(typeof name!=='string'||name.trim().length<2||name.trim().length>200)throw new OlistConnectorError('OLIST_NAME_INVALID');
  if(typeof color!=='string'||color.trim().length<1||color.trim().length>60||typeof size!=='string'||size.trim().length<1||size.trim().length>50)throw new OlistConnectorError('OLIST_VARIANT_INVALID');
  const gtin=row.gtin==null?'':String(row.gtin).trim();if(gtin&&!gtinValid(gtin))throw new OlistConnectorError('OLIST_GTIN_INVALID');
  if(!row.precos||typeof row.precos!=='object'||Array.isArray(row.precos))throw new OlistConnectorError('OLIST_PRICE_INVALID');
  return {externalProductId:String(row.id),categoryId,name:name.trim(),variants:[{
    externalVariantId:String(row.id),sku:productSku,priceCents:cents(row.precos.preco),color:color.trim(),size:size.trim(),
    status:row.situacao==='A'?'ACTIVE':'INACTIVE',...(gtin?{gtin}:{})
  }]};
}
export function stockTotal(data,expectedId){
  if(!data||data.id!==expectedId)throw new OlistConnectorError('OLIST_STOCK_MISMATCH');
  // Nao somar depositos: saldo ja e consolidado. Nao mapear varios depositos para uma unica loja sem homologacao.
  if(data.depositos!=null&&(!Array.isArray(data.depositos)||data.depositos.length>1))throw new OlistConnectorError('OLIST_MULTI_DEPOT_UNSUPPORTED');
  const n=data.saldo;
  if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>1000000)throw new OlistConnectorError('OLIST_STOCK_NOT_INTEGER');
  return n;
}
