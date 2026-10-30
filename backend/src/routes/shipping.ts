import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { fulfillmentInput, fulfillmentSettings, localFingerprint, localRate } from '../services/local_fulfillment.js';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireIdentity, requireStoreRole } from '../security/identity.js';
import { uuidParam, validated } from '../security/validation.js';
import { cartFingerprint, normalizeShippingRates, quotePayload, type ParcelItem } from '../services/shipping_rules.js';

const postal=z.string().regex(/^\d{8}$/,'CEP deve conter 8 dígitos');
const shopParams=z.object({slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48)});
const storeParams=z.object({storeId:uuidParam});
const variantParams=storeParams.extend({variantId:uuidParam});
const quoteBody=z.object({destinationPostalCode:postal,mode:z.enum(['CARRIER','LOCAL']).default('CARRIER'),items:z.array(z.object({
  productId:uuidParam,color:z.string().min(1).max(60),size:z.string().min(1).max(50),
  quantity:z.number().int().min(1).max(20)
}).strict()).min(1).max(30)}).strict();
const parcelBody=z.object({weightKg:z.number().min(0.01).max(30),widthCm:z.number().min(1).max(200),heightCm:z.number().min(1).max(200),lengthCm:z.number().min(1).max(200)}).strict();

function providerEnabled(storeId:string):boolean {
  return !!(config.SHIPPING_MELHOR_ENVIO_TOKEN && config.SHIPPING_PILOT_STORE_ID===storeId && config.SHIPPING_USER_AGENT);
}
async function findStore(slug:string):Promise<string> {
  const q=await pool.query<{id:string}>("SELECT id FROM stores WHERE slug=$1 AND status='ACTIVE'",[slug]);
  if(!q.rowCount) throw new ApiError(404,'Loja não encontrada.');
  return q.rows[0].id;
}

export async function shippingRoutes(app:FastifyInstance) {
  app.get('/v1/shops/:slug/shipping/availability',async req=>{
    const {slug}=validated(shopParams,req.params); const storeId=await findStore(slug);
    const origin=await pool.query('SELECT 1 FROM store_shipping_settings WHERE store_id=$1',[storeId]);
    const local=fulfillmentSettings((await pool.query('SELECT * FROM store_fulfillment_settings WHERE store_id=$1',[storeId])).rows[0]);
    return {localDelivery:local.localEnabled,localFeeCents:local.localFeeCents,localEstimate:local.localEstimate,
      pickupAddress:local.pickupAddress,pickupHours:local.pickupHours,enabled:providerEnabled(storeId)&&!!origin.rowCount, pickup:true,
      delivery:providerEnabled(storeId)&&!!origin.rowCount, sandbox:config.SHIPPING_MELHOR_ENVIO_SANDBOX};
  });

  app.post('/v1/shops/:slug/shipping/quotes',{config:{rateLimit:{max:12,timeWindow:'1 minute'}}},async req=>{
    const {slug}=validated(shopParams,req.params);
    const {userId}=await requireIdentity(req);
    const storeId=await findStore(slug);
    const body=validated(quoteBody,req.body);
    const local=body.mode==='LOCAL';
    if(!local && !providerEnabled(storeId)) throw new ApiError(503,'Cálculo de entrega ainda não habilitado nesta loja.');
    const setting=await pool.query<{origin_postal_code:string}>(
      'SELECT origin_postal_code FROM store_shipping_settings WHERE store_id=$1',[storeId]);
    if(!local && !setting.rowCount) throw new ApiError(409,'CEP de origem não cadastrado pela loja.');
    const origin=local?'00000000':setting.rows[0].origin_postal_code;
    const grouped=new Map<string,{productId:string;color:string;size:string;quantity:number}>();
    for(const line of body.items){
      const key=`${line.productId}:${line.color.toLowerCase().trim()}:${line.size.toLowerCase().trim()}`;
      const old=grouped.get(key);
      const quantity=(old?.quantity??0)+line.quantity;
      if(quantity>20)throw new ApiError(400,'Quantidade de uma variante acima do limite.');
      grouped.set(key,{...line,quantity});
    }
    const items:ParcelItem[]=[];
    for(const line of grouped.values()){
      const r=await pool.query<{id:string;price_cents:string;on_hand:number;reserved:number;
        weight_kg:string|null;width_cm:string|null;height_cm:string|null;length_cm:string|null}>(`
        SELECT v.id,v.price_cents::text,v.on_hand,v.reserved,
          pck.weight_kg::text,pck.width_cm::text,pck.height_cm::text,pck.length_cm::text
        FROM product_variants v
        JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
        LEFT JOIN shipping_variant_parcels pck ON pck.variant_id=v.id AND pck.store_id=v.store_id
        WHERE v.product_id=$1 AND v.store_id=$2 AND v.status='ACTIVE' AND p.status='PUBLISHED'
        AND lower(v.attributes->>'color')=lower($3) AND lower(v.attributes->>'size')=lower($4)
        LIMIT 1`,[line.productId,storeId,line.color,line.size]);
      if(!r.rowCount)throw new ApiError(409,'Produto ou variante indisponível.');
      const v=r.rows[0];
      if(v.on_hand-v.reserved<line.quantity) throw new ApiError(409,'Estoque insuficiente. Atualize seu carrinho.');
      if(!local && (!v.weight_kg||!v.width_cm||!v.height_cm||!v.length_cm))
        throw new ApiError(409,'A loja ainda não cadastrou peso e dimensões de todos os produtos no carrinho.');
      items.push({variantId:v.id,quantity:line.quantity,unitCents:v.price_cents,
        weightKg:Number(v.weight_kg),widthCm:Number(v.width_cm),heightCm:Number(v.height_cm),lengthCm:Number(v.length_cm)});
    }
    if(local){
      const settings=fulfillmentSettings((await pool.query(
        'SELECT * FROM store_fulfillment_settings WHERE store_id=$1',[storeId])).rows[0]);
      const rate=localRate(settings,body.destinationPostalCode);
      if(!rate)throw new ApiError(409,'Entrega local indisponível para este CEP. Escolha retirada ou outro endereço.');
      const saved=await pool.query<{id:string;expires_at:Date}>(`
        INSERT INTO shipping_quotes(store_id,customer_id,origin_postal_code,destination_postal_code,cart_hash,services,expires_at,provider)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,now()+interval '15 minutes','LOCAL') RETURNING id,expires_at`,
        [storeId,userId,origin,body.destinationPostalCode,
          localFingerprint(settings,body.destinationPostalCode,items),JSON.stringify([rate])]);
      return {quoteId:saved.rows[0].id,expiresAt:saved.rows[0].expires_at,options:[rate],sandbox:false,provider:'LOCAL'};
    }
    const endpoint=config.SHIPPING_MELHOR_ENVIO_SANDBOX
      ?'https://sandbox.melhorenvio.com.br':'https://melhorenvio.com.br';
    let raw:unknown;
    try{
      const response=await fetch(`${endpoint}/api/v2/me/shipment/calculate`,{
        method:'POST',signal:AbortSignal.timeout(12000),
        headers:{'Authorization':`Bearer ${config.SHIPPING_MELHOR_ENVIO_TOKEN}`,
          'User-Agent':config.SHIPPING_USER_AGENT!,'Accept':'application/json','Content-Type':'application/json'},
        body:JSON.stringify(quotePayload(origin,body.destinationPostalCode,items)),
      });
      if(!response.ok)throw new Error(`status ${response.status}`);
      raw=await response.json();
    }catch{
      throw new ApiError(503,'Transportadoras temporariamente indisponíveis. Tente novamente.');
    }
    const options=normalizeShippingRates(raw);
    if(!options.length)throw new ApiError(409,'Nenhuma transportadora disponível para este CEP ou pacote.');
    const fingerprint=cartFingerprint(origin,body.destinationPostalCode,items);
    const saved=await pool.query<{id:string;expires_at:Date}>(`
      INSERT INTO shipping_quotes(store_id,customer_id,origin_postal_code,destination_postal_code,cart_hash,services,expires_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,now()+interval '15 minutes') RETURNING id,expires_at`,
      [storeId,userId,origin,body.destinationPostalCode,fingerprint,JSON.stringify(options)]);
    return {quoteId:saved.rows[0].id,expiresAt:saved.rows[0].expires_at,options,
      sandbox:config.SHIPPING_MELHOR_ENVIO_SANDBOX,provider:'CARRIER'};
  });

  app.get('/v1/stores/:storeId/shipping/setup',async req=>{
    const {storeId}=validated(storeParams,req.params);
    const {role}=await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
    const setting=await pool.query<{origin_postal_code:string}>(
      'SELECT origin_postal_code FROM store_shipping_settings WHERE store_id=$1',[storeId]);
    const variants=await pool.query(`SELECT v.id,v.sku,p.name AS "productName",
      sp.weight_kg::float8 AS "weightKg",sp.width_cm::float8 AS "widthCm",
      sp.height_cm::float8 AS "heightCm",sp.length_cm::float8 AS "lengthCm"
      FROM product_variants v JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
      LEFT JOIN shipping_variant_parcels sp ON sp.variant_id=v.id AND sp.store_id=v.store_id
      WHERE v.store_id=$1 AND p.status<>'ARCHIVED' ORDER BY p.name,v.sku LIMIT 300`,[storeId]);
    const local=fulfillmentSettings((await pool.query('SELECT * FROM store_fulfillment_settings WHERE store_id=$1',[storeId])).rows[0]);
    return {myRole:role,fulfillment:local,enabled:providerEnabled(storeId),originPostalCode:setting.rows[0]?.origin_postal_code??'',
      sandbox:config.SHIPPING_MELHOR_ENVIO_SANDBOX,variants:variants.rows};
  });
  app.put('/v1/stores/:storeId/shipping/fulfillment',async req=>{
    const {storeId}=validated(storeParams,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const data=validated(fulfillmentInput,req.body);
    await pool.query(`INSERT INTO store_fulfillment_settings
      (store_id,pickup_address,pickup_hours,local_enabled,local_fee_cents,local_estimate,local_postal_ranges,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(store_id) DO UPDATE SET
      pickup_address=EXCLUDED.pickup_address,pickup_hours=EXCLUDED.pickup_hours,
      local_enabled=EXCLUDED.local_enabled,local_fee_cents=EXCLUDED.local_fee_cents,
      local_estimate=EXCLUDED.local_estimate,local_postal_ranges=EXCLUDED.local_postal_ranges,
      updated_by=EXCLUDED.updated_by,updated_at=now()`,[storeId,data.pickupAddress,data.pickupHours,
        data.localEnabled,data.localFeeCents,data.localEstimate,JSON.stringify(data.localPostalRanges),identity.userId]);
    return {ok:true};
  });
  app.put('/v1/stores/:storeId/shipping/origin',async req=>{
    const {storeId}=validated(storeParams,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const {originPostalCode}=validated(z.object({originPostalCode:postal}).strict(),req.body);
    await pool.query(`INSERT INTO store_shipping_settings(store_id,origin_postal_code,updated_by)
      VALUES($1,$2,$3) ON CONFLICT(store_id) DO UPDATE
      SET origin_postal_code=EXCLUDED.origin_postal_code,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [storeId,originPostalCode,identity.userId]);
    return {ok:true};
  });
  app.put('/v1/stores/:storeId/shipping/parcels/:variantId',async req=>{
    const {storeId,variantId}=validated(variantParams,req.params);
    await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const p=validated(parcelBody,req.body);
    const variant=await pool.query('SELECT 1 FROM product_variants WHERE id=$1 AND store_id=$2',[variantId,storeId]);
    if(!variant.rowCount)throw new ApiError(404,'Variante não encontrada.');
    await pool.query(`INSERT INTO shipping_variant_parcels(variant_id,store_id,weight_kg,width_cm,height_cm,length_cm)
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(variant_id,store_id) DO UPDATE SET weight_kg=EXCLUDED.weight_kg,width_cm=EXCLUDED.width_cm,
      height_cm=EXCLUDED.height_cm,length_cm=EXCLUDED.length_cm,updated_at=now()`,
      [variantId,storeId,p.weightKg,p.widthCm,p.heightCm,p.lengthCm]);
    return {ok:true};
  });
}
