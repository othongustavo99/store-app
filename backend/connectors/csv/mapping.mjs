/** F40 F5.14 - importar arquivo CSV mediante contrato explicito por loja.
 * Sem rede, estado ou efeitos colaterais; arquivo inteiro validado antes de qualquer escrita.
 */
export class CsvIntegrationError extends Error {
  constructor(code) { super(code); this.name='CsvIntegrationError'; this.code=code; }
}
const fail=code=>{throw new CsvIntegrationError(code);};
const uuid=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const sku=/^[a-z0-9][a-z0-9._-]{1,89}$/i;
const gtinPattern=/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/;
const fields=['externalProductId','externalVariantId','sku','name','price','stock','gtin','color','size','status'];
const required=['externalProductId','externalVariantId','sku','name','price'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=(value,min,max)=>typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max;
export function checkGtin(v){
  if(!gtinPattern.test(v))return false;
  let sum=0,weight=3;
  for(let i=v.length-2;i>=0;i--,weight=weight===3?1:3)sum+=Number(v[i])*weight;
  return (10-sum%10)%10===Number(v.at(-1));
}
export function validateConfig(input){
  if(!plain(input)||input.schema!==1||!uuid.test(input.storeId??'')||!uuid.test(input.integrationId??'')||!uuid.test(input.categoryId??''))fail('CSV_SETTINGS_INVALID');
  if(![';',',','\t'].includes(input.delimiter)||!['.',','].includes(input.decimalSeparator)||input.delimiter===input.decimalSeparator)
    fail('CSV_SEPARATORS_INVALID');
  if(!['DISABLED','PHYSICAL'].includes(input.stockMode))fail('CSV_STOCK_MODE_INVALID');
  if(input.stockMode==='PHYSICAL' && (input.physicalStockConfirmed!==true ||
    typeof input.snapshotAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.snapshotAt) ||
    !Number.isFinite(Date.parse(input.snapshotAt)) || new Date(input.snapshotAt).toISOString().slice(0,19)!==input.snapshotAt.slice(0,19)))
    fail('CSV_PHYSICAL_SNAPSHOT_CONFIRMATION_REQUIRED');
  if(!plain(input.columns))fail('CSV_COLUMN_MAP_INVALID');
  const names=Object.keys(input.columns);
  if(!names.length||names.some(k=>!fields.includes(k)))fail('CSV_COLUMN_MAP_INVALID');
  for(const k of required)if(!text(input.columns[k],1,80))fail('CSV_REQUIRED_COLUMN_MISSING');
  if(input.stockMode==='PHYSICAL'&&!text(input.columns.stock,1,80))fail('CSV_STOCK_COLUMN_REQUIRED');
  const mapped=Object.values(input.columns);
  if(mapped.some(x=>!text(x,1,80))||new Set(mapped).size!==mapped.length)fail('CSV_COLUMN_MAP_COLLISION');
  if(input.statusValues!==undefined){
    if(!plain(input.statusValues)||!Array.isArray(input.statusValues.active)||!Array.isArray(input.statusValues.inactive)||
      [...input.statusValues.active,...input.statusValues.inactive].some(x=>!text(x,1,40))||
      new Set([...input.statusValues.active,...input.statusValues.inactive].map(x=>x.trim().toUpperCase())).size!==input.statusValues.active.length+input.statusValues.inactive.length)
      fail('CSV_STATUS_MAPPING_INVALID');
  }
  return input;
}
export function parseCsv(content,delimiter=';'){
  if(typeof content!=='string'||Buffer.byteLength(content,'utf8')>2_000_000||content.includes('\0'))fail('CSV_FILE_INVALID');
  if(![';',',','\t'].includes(delimiter))fail('CSV_DELIMITER_INVALID');
  if(content.charCodeAt(0)===0xfeff)content=content.slice(1);
  const rows=[];let row=[],cell='',quoted=false,closed=false,atStart=true;
  for(let i=0;i<content.length;i++){
    const c=content[i];
    if(quoted){
      if(c==='"'){
        if(content[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}
      }else{cell+=c;}
    }else if(c==='"'){
      if(!atStart||closed)fail('CSV_QUOTE_INVALID');
      quoted=true;atStart=false;
    }else if(c===delimiter){
      row.push(cell);cell='';closed=false;atStart=true;
      if(row.length>40)fail('CSV_COLUMNS_LIMIT');
    }else if(c==='\n'||c==='\r'){
      if(c==='\r'&&content[i+1]==='\n')i++;
      row.push(cell);
      if(row.some(v=>v!==''))rows.push(row);
      row=[];cell='';closed=false;atStart=true;
      if(rows.length>501)fail('CSV_ROWS_LIMIT');
    }else{
      if(closed)fail('CSV_QUOTE_INVALID');
      cell+=c;atStart=false;
    }
    if(cell.length>12000)fail('CSV_CELL_LIMIT');
  }
  if(quoted)fail('CSV_QUOTE_UNCLOSED');
  row.push(cell);
  if(row.some(v=>v!==''))rows.push(row);
  if(rows.length<2)fail('CSV_NO_DATA');
  if(rows.length>501)fail('CSV_ROWS_LIMIT');
  const header=rows.shift().map(x=>x.trim());
  if(header.some(x=>!text(x,1,80))||new Set(header).size!==header.length||header.length>40)fail('CSV_HEADER_INVALID');
  if(rows.some(r=>r.length!==header.length))fail('CSV_ROW_COLUMNS_MISMATCH');
  return {header,rows};
}
export function toCents(value,decimalSeparator){
  if(typeof value!=='string')fail('CSV_PRICE_INVALID');
  const t=value.trim();
  const escaped=decimalSeparator==='.'?'\\.':',';
  if(!new RegExp(`^(?:0|[1-9]\\d{0,7})(?:${escaped}\\d{1,2})?$`).test(t))fail('CSV_PRICE_INVALID');
  const [major,fraction='']=t.split(decimalSeparator);
  const amount=Number(major)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount<1||amount>100000000)fail('CSV_PRICE_INVALID');
  return amount;
}
/** Retorna produtos compativeis com /v1/external/catalog/products/upsert e snapshots fisicos opcionais. */
export function prepareCsvImport(content,rawConfig){
  const config=validateConfig(rawConfig);
  const {header,rows}=parseCsv(content,config.delimiter);
  const indexes={};
  for(const [key,label] of Object.entries(config.columns)){
    const i=header.indexOf(label);
    if(i<0)fail('CSV_MAPPED_HEADER_NOT_FOUND');
    indexes[key]=i;
  }
  const products=new Map(),allVariants=new Set(),allSkus=new Set(),allGtins=new Set();
  const statuses=config.statusValues??{active:['ACTIVE'],inactive:['INACTIVE']};
  const allowedA=new Set(statuses.active.map(v=>v.trim().toUpperCase()));
  const allowedI=new Set(statuses.inactive.map(v=>v.trim().toUpperCase()));
  for(const cells of rows){
    const get=(key)=>indexes[key]===undefined?'':cells[indexes[key]].trim();
    const externalProductId=get('externalProductId'),externalVariantId=get('externalVariantId'),name=get('name'),
      code=get('sku').toUpperCase(),barcode=get('gtin'),color=get('color')||'Padrao',size=get('size')||'Unico';
    if(!text(externalProductId,1,180)||!text(externalVariantId,1,180))fail('CSV_EXTERNAL_ID_INVALID');
    if(!sku.test(code))fail('CSV_SKU_INVALID');
    if(!text(name,2,200)||!text(color,1,60)||!text(size,1,50))fail('CSV_PRODUCT_TEXT_INVALID');
    if(barcode&&!checkGtin(barcode))fail('CSV_GTIN_INVALID');
    if(allVariants.has(externalVariantId)||allSkus.has(code)||(barcode&&allGtins.has(barcode)))fail('CSV_DUPLICATE_VARIANT');
    allVariants.add(externalVariantId);allSkus.add(code);if(barcode)allGtins.add(barcode);
    const rawStatus=get('status').toUpperCase();
    const status=indexes.status===undefined?'ACTIVE':allowedA.has(rawStatus)?'ACTIVE':allowedI.has(rawStatus)?'INACTIVE':null;
    if(!status)fail('CSV_STATUS_UNKNOWN');
    const priceCents=toCents(get('price'),config.decimalSeparator);
    const stockValue=get('stock');
    let onHand;
    if(config.stockMode==='PHYSICAL'){
      if(!/^(?:0|[1-9]\d{0,6})$/.test(stockValue)||Number(stockValue)>1000000)fail('CSV_STOCK_INVALID');
      if(status==='INACTIVE')fail('CSV_INACTIVE_STOCK_UNSUPPORTED');
      onHand=Number(stockValue);
    }
    const variant={externalVariantId,sku:code,priceCents,color,size,status,...(barcode?{gtin:barcode}:{})};
    const existing=products.get(externalProductId);
    if(existing && existing.name!==name)fail('CSV_PRODUCT_NAME_CONFLICT');
    const item=existing??{externalProductId,categoryId:config.categoryId,name,variants:[],stocks:[]};
    if(item.variants.length>=40)fail('CSV_VARIANT_LIMIT');
    if(item.variants.some(v=>v.color.toUpperCase()===color.toUpperCase()&&v.size.toUpperCase()===size.toUpperCase()&&v.status==='ACTIVE'&&status==='ACTIVE'))fail('CSV_VARIANT_COMBINATION_DUPLICATE');
    item.variants.push(variant);
    if(config.stockMode==='PHYSICAL')item.stocks.push({externalVariantId,onHand});
    products.set(externalProductId,item);
  }
  if(products.size>200)fail('CSV_PRODUCTS_LIMIT');
  return {products:[...products.values()],rowCount:rows.length,variantCount:allVariants.size,stockMode:config.stockMode};
}
