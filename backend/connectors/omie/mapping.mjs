import {ConnectorError,validateUuid} from './clients.mjs';
import {createHash} from 'node:crypto';
const skuPattern=/^[A-Za-z0-9][A-Za-z0-9._-]{1,89}$/;
const gtinPattern=/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/;
const validText=(text,min,max)=>typeof text==='string'&&text.trim().length>=min&&text.trim().length<=max;
function gtinCheck(str) {
  if(!gtinPattern.test(str))return false;
  let s=0,w=3;
  for(let i=str.length-2;i>=0;i--,w=w===3?1:3)s+=Number(str[i])*w;
  return (10-s%10)%10===Number(str.at(-1));
}
export function moneyToCents(v) {
  if(typeof v!=='string' && typeof v!=='number')throw new ConnectorError('OMIE_PRICE_INVALID');
  const t=String(v);
  if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(t))throw new ConnectorError('OMIE_PRICE_INVALID');
  const [whole,dec='']=t.split('.');
  const cents=Number(whole)*100+Number(dec.padEnd(2,'0'));
  if(!Number.isSafeInteger(cents)||cents<1||cents>100000000)throw new ConnectorError('OMIE_PRICE_INVALID');
  return cents;
}
export function fingerprint(data) {return createHash('sha256').update(JSON.stringify(data)).digest('hex');}
export function mapOmieProduct(row,categoryId,{color='Padrao',size='Unico'}={}) {
  if(!validateUuid(categoryId))throw new ConnectorError('INVALID_CATEGORY_ID');
  const id=row?.codigo_produto;
  if(!Number.isSafeInteger(id)||id<1)throw new ConnectorError('OMIE_PRODUCT_ID_INVALID');
  if(row.variacao==='S'||(Number(row.id_produto_variacao)>0))throw new ConnectorError('OMIE_VARIATION_REQUIRES_MAPPING');
  const sku=String(row.codigo??'').trim().toUpperCase();
  if(!skuPattern.test(sku))throw new ConnectorError('OMIE_SKU_INVALID');
  if(!validText(row.descricao,2,200))throw new ConnectorError('OMIE_NAME_INVALID');
  if(!validText(color,1,60)||!validText(size,1,50))throw new ConnectorError('OMIE_VARIANT_INVALID');
  const ean=row.ean==null?'':String(row.ean).trim();
  if(ean && !gtinCheck(ean))throw new ConnectorError('OMIE_GTIN_INVALID');
  const externalId=String(id);
  const product={externalProductId:externalId,categoryId,name:row.descricao.trim(),
    variants:[{externalVariantId:externalId,sku,priceCents:moneyToCents(row.valor_unitario),color,size,
      status:row.inativo==='S'?'INACTIVE':'ACTIVE',...(ean?{gtin:ean}:{})}]};
  // Nao publica automaticamente: produtos novos devem receber revisao de fotos e conteudo.
  return product;
}
export function readPhysicalStock(payload,id,warehouseId) {
  if(!Array.isArray(payload?.produtos))throw new ConnectorError('OMIE_STOCK_RESPONSE_INVALID');
  const matches=payload.produtos.filter(p=>Number(p.nCodProd)===id &&
    (warehouseId===null || Number(p.codigo_local_estoque)===warehouseId));
  if(matches.length!==1)throw new ConnectorError('OMIE_STOCK_NOT_UNIQUE');
  if(matches[0].fisico===undefined || matches[0].fisico===null || matches[0].fisico==='')throw new ConnectorError('OMIE_STOCK_MISSING');
  const stock=Number(matches[0].fisico);
  if(!Number.isSafeInteger(stock)||stock<0||stock>1000000)throw new ConnectorError('OMIE_STOCK_NOT_INTEGER');
  return stock;
}
export function validateSettings(config) {
  if(!validateUuid(config.categoryId))throw new ConnectorError('INVALID_CATEGORY_ID');
  if(config.warehouseId!==undefined && (!Number.isSafeInteger(config.warehouseId)||config.warehouseId<1)) throw new ConnectorError('INVALID_WAREHOUSE_ID');
  if(config.productLimit!==undefined && (!Number.isSafeInteger(config.productLimit)||config.productLimit<1||config.productLimit>200)) throw new ConnectorError('INVALID_PRODUCT_LIMIT');
  if(config.productIds!==undefined && (!Array.isArray(config.productIds)||!config.productIds.length||config.productIds.length>200||config.productIds.some(v=>!Number.isSafeInteger(v)||v<1)||new Set(config.productIds).size!==config.productIds.length))throw new ConnectorError('INVALID_PRODUCT_IDS');
  if(config.variants!==undefined && (typeof config.variants!=='object'||config.variants===null||Array.isArray(config.variants)))throw new ConnectorError('INVALID_VARIANT_OVERRIDES');
  return config;
}
