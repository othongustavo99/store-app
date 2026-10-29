import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireIdentity, requireStoreRole } from '../security/identity.js';
import { ApiError } from '../security/errors.js';
import { validated, uuidParam } from '../security/validation.js';
import { calculateCoupon,cleanCode,type Coupon } from '../services/coupon_rules.js';
const params=z.object({storeId:uuidParam});
const couponParams=params.extend({couponId:uuidParam});
const shopParams=z.object({slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48)});
const codeSchema=z.string().trim().min(3).max(24).transform(cleanCode).pipe(z.string().regex(/^[A-Z0-9_-]{3,24}$/));
const createSchema=z.object({code:codeSchema,discountType:z.enum(['PERCENT','FIXED']),
 amount:z.number().int().min(1).max(10000000),minimumSubtotalCents:z.number().int().min(0).max(100000000),
 maxUses:z.number().int().min(1).max(1000000).nullable(),maxUsesPerUser:z.number().int().min(1).max(10).default(1),
 startsAt:z.string().datetime().nullable(),expiresAt:z.string().datetime().nullable(),active:z.boolean().default(true)}).strict();
const previewSchema=z.object({code:codeSchema,items:z.array(z.object({productId:uuidParam,
 color:z.string().min(1).max(60),size:z.string().min(1).max(50),quantity:z.number().int().min(1).max(20)}).strict()).min(1).max(30)}).strict();
function replyCoupon(r:Record<string,unknown>){return {id:r.id,code:r.code,discountType:r.discount_type,amount:r.amount,
 minimumSubtotalCents:Number(r.minimum_subtotal_cents),maxUses:r.max_uses,usedCount:r.used_count,
 maxUsesPerUser:r.max_uses_per_user,startsAt:r.starts_at,expiresAt:r.expires_at,active:r.active};}
export async function couponRoutes(app:FastifyInstance) {
 app.get('/v1/stores/:storeId/coupons',async(req)=>{
  const {storeId}=validated(params,req.params);await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
  const rows=await pool.query('SELECT * FROM store_coupons WHERE store_id=$1 ORDER BY created_at DESC LIMIT 200',[storeId]);
  return {coupons:rows.rows.map(replyCoupon)};
 });
 app.post('/v1/stores/:storeId/coupons',{config:{rateLimit:{max:15,timeWindow:'1 minute'}}},async(req,reply)=>{
  const {storeId}=validated(params,req.params);await requireStoreRole(req,storeId,['OWNER','MANAGER']);
  const b=validated(createSchema,req.body);
  if(b.discountType==='PERCENT' && b.amount>10000)throw new ApiError(400,'Percentual superior a 100%.');
  if(b.startsAt&&b.expiresAt&&b.startsAt>=b.expiresAt)throw new ApiError(400,'Período inválido.');
  try {
   const r=await pool.query(`INSERT INTO store_coupons(store_id,code,discount_type,amount,minimum_subtotal_cents,max_uses,max_uses_per_user,starts_at,expires_at,active)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[storeId,b.code,b.discountType,b.amount,b.minimumSubtotalCents,b.maxUses,b.maxUsesPerUser,b.startsAt,b.expiresAt,b.active]);
   return reply.code(201).send({coupon:replyCoupon(r.rows[0])});
  }catch(e){if((e as {code?:string}).code==='23505')throw new ApiError(409,'Já existe cupom com este código nesta loja.');throw e;}
 });
 app.patch('/v1/stores/:storeId/coupons/:couponId',async(req)=>{
  const {storeId,couponId}=validated(couponParams,req.params);await requireStoreRole(req,storeId,['OWNER','MANAGER']);
  const {active}=validated(z.object({active:z.boolean()}).strict(),req.body);
  const r=await pool.query('UPDATE store_coupons SET active=$3,updated_at=now() WHERE id=$1 AND store_id=$2 RETURNING *',[couponId,storeId,active]);
  if(!r.rowCount)throw new ApiError(404,'Cupom não encontrado.');return {coupon:replyCoupon(r.rows[0])};
 });
 app.post('/v1/shops/:slug/coupons/preview',{config:{rateLimit:{max:15,timeWindow:'1 minute'}}},async(req)=>{
  const {slug}=validated(shopParams,req.params);const {userId}=await requireIdentity(req);
  const b=validated(previewSchema,req.body);
  const shop=await pool.query<{id:string}>("SELECT id FROM stores WHERE slug=$1 AND status='ACTIVE'",[slug]);
  if(!shop.rowCount)throw new ApiError(404,'Loja não encontrada.');
  const storeId=shop.rows[0].id;
  const found=await pool.query<Coupon>(`SELECT * FROM store_coupons WHERE store_id=$1 AND code=$2`,[storeId,b.code]);
  if(!found.rowCount)throw new ApiError(404,'Cupom não encontrado.');
  const usage=await pool.query<{count:string}>(`SELECT count(*)::text AS count FROM order_coupons WHERE store_id=$1 AND coupon_id=$2 AND customer_id=$3`,[storeId,found.rows[0].id,userId]);
  const items=new Map<string,{productId:string;color:string;size:string;quantity:number}>();
  for(const i of b.items){const key=`${i.productId}:${i.color.toLowerCase()}:${i.size.toLowerCase()}`;
   const old=items.get(key);const quantity=(old?.quantity??0)+i.quantity;
   if(quantity>20)throw new ApiError(400,'Quantidade excessiva por variante.');items.set(key,{...i,quantity});}
  let subtotal=0n;
  for(const i of items.values()){
   const v=await pool.query<{price_cents:string;available:number}>(`SELECT v.price_cents::text, v.on_hand-v.reserved AS available
    FROM product_variants v JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
    WHERE v.product_id=$1 AND v.store_id=$2 AND p.status='PUBLISHED' AND v.status='ACTIVE'
      AND lower(v.attributes->>'color')=lower($3) AND lower(v.attributes->>'size')=lower($4)`,[i.productId,storeId,i.color,i.size]);
   if(v.rowCount!==1 || v.rows[0].available<i.quantity)throw new ApiError(409,'Produto indisponível; atualize o carrinho.');
   subtotal+=BigInt(v.rows[0].price_cents)*BigInt(i.quantity);
  }
  const discount=calculateCoupon(found.rows[0],subtotal,Number(usage.rows[0].count));
  return {code:b.code,subtotalCents:subtotal.toString(),discountCents:discount.toString(),totalCents:(subtotal-discount).toString(),
   warning:'Estimativa; o servidor revalidará o cupom, o preço e o estoque ao criar o pedido.'};
 });
}
