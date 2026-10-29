import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { requireIdentity, requireStoreRole } from '../security/identity.js';
import { ApiError } from '../security/errors.js';
import { uuidParam, validated } from '../security/validation.js';
import { verifyMercadoPagoSignature } from '../security/payment_signature.js';
import { orderEvents } from './catalog.js';
import { cartFingerprint, type ParcelItem, type ShippingService } from '../services/shipping_rules.js';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48);
const shopParams = z.object({ slug });
const shopOrderParams = shopParams.extend({ orderId: uuidParam });
const storeParams = z.object({ storeId: uuidParam });
const storeOrderParams = storeParams.extend({ orderId: uuidParam });
const orderParams = z.object({ orderId: uuidParam });
const item = z.object({
  productId: uuidParam,
  color: z.string().min(1).max(60),
  size: z.string().min(1).max(50),
  quantity: z.number().int().min(1).max(20),
}).strict();
const deliveryAddress = z.object({
  postalCode: z.string().regex(/^\d{8}$/),
  street: z.string().trim().min(3).max(150),
  number: z.string().trim().min(1).max(30),
  complement: z.string().trim().max(100).default(''),
  neighborhood: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().regex(/^[A-Z]{2}$/),
}).strict();
const orderBody = z.object({
  idempotencyKey: uuidParam,
  demoPaymentMethod: z.enum(['PIX','CARD']).optional(),
  items: z.array(item).min(1).max(30),
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(8).max(22),
  }).strict(),
  notes: z.string().trim().max(500).default(''),
  fulfillment: z.enum(['PICKUP','DELIVERY']),
  shipping: z.object({quoteId:uuidParam,serviceId:z.string().regex(/^\d{1,10}$/),address:deliveryAddress}).strict().optional(),
}).strict().superRefine((data,ctx)=>{
  if ((data.fulfillment==='DELIVERY') !== !!data.shipping)
    ctx.addIssue({code:z.ZodIssueCode.custom,path:['shipping'],message:'Entrega exige cotação e endereço; retirada não aceita frete.'});
});
const transitionBody = z.object({ status: z.enum(['PREPARING','SHIPPED','DELIVERED']), notes: z.string().trim().max(300).optional() }).strict();
const webhookQuery = z.object({ 'data.id': z.coerce.string().regex(/^\d{1,30}$/) });

type OrderRow = {
  id:string; store_id:string; customer_id:string; status:string; is_demo:boolean;
  subtotal_cents:string; shipping_cents:string; total_cents:string;
  reservation_expires_at:Date|null; created_at:Date;
  checkout_url:string|null; checkout_reference:string|null; checkout_expires_at:Date|null;
};
type LockedVariant = { id:string; product_id:string; name:string; sku:string; attributes:{color?:string;size?:string}; price_cents:string; on_hand:number; reserved:number };
const now = () => new Date().toISOString();
function assertPilot(storeId: string) {
  if (!config.ENABLE_REAL_PAYMENTS || !config.MERCADOPAGO_ACCESS_TOKEN ||
      !config.MERCADOPAGO_WEBHOOK_SECRET || !config.PUBLIC_BASE_URL ||
      config.PAYMENT_PILOT_STORE_ID !== storeId) {
    throw new ApiError(503, 'Checkout indisponível: recebimentos não configurados para esta loja.');
  }
}
async function storeBySlug(value:string):Promise<string> {
  const r = await pool.query<{id:string}>("SELECT id FROM stores WHERE slug=$1 AND status='ACTIVE'", [value]);
  if (!r.rowCount) throw new ApiError(404, 'Loja não encontrada.');
  return r.rows[0].id;
}
async function queryOrder(client:PoolClient, id:string):Promise<OrderRow> {
  const r=await client.query<OrderRow>(`
    SELECT o.*,p.checkout_url,p.checkout_reference,p.checkout_expires_at FROM orders o
    LEFT JOIN payments p ON p.order_id=o.id AND p.provider IN ('mercadopago','demo')
    WHERE o.id=$1 FOR UPDATE OF o`,[id]);
  if (!r.rowCount) throw new ApiError(404, 'Pedido não encontrado.');
  return r.rows[0];
}
async function orderView(id:string, storeId:string) {
  const found=await pool.query(`SELECT o.id,o.store_id AS "storeId",o.customer_id AS "customerId",
    o.status,o.subtotal_cents::text AS "subtotalCents",o.shipping_cents::text AS "shippingCents",
    o.total_cents::text AS "totalCents",o.fulfillment_method AS "fulfillment",
    o.reservation_expires_at AS "reservationExpiresAt",o.created_at AS "createdAt",
    o.is_demo AS "isDemo",
    o.shipping_address AS "customerContact",
    o.shipping_service_id AS "shippingServiceId",
    o.shipping_carrier AS "shippingCarrier",
    o.shipping_delivery_days AS "shippingDeliveryDays",
    (SELECT json_build_object('carrier',s.carrier,'trackingCode',s.tracking_code,'status',s.status)
      FROM shipments s WHERE s.order_id=o.id ORDER BY s.created_at DESC LIMIT 1) AS "shipment",
    CASE WHEN p.checkout_expires_at>now() AND NOT EXISTS (
      SELECT 1 FROM after_sales_requests a WHERE a.order_id=o.id
        AND a.request_type='CANCEL' AND a.status IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION')
    ) THEN p.checkout_url ELSE NULL END AS "checkoutUrl",
    p.status AS "paymentStatus",p.provider AS "paymentProvider",
    (SELECT json_build_object('status',r.status,'amountCents',r.amount_cents::text,
      'confirmedAt',r.confirmed_at) FROM payment_refund_operations r
      WHERE r.order_id=o.id LIMIT 1) AS "refundOperation"
    FROM orders o LEFT JOIN payments p ON p.order_id=o.id AND p.provider IN ('mercadopago','demo')
    WHERE o.id=$1 AND o.store_id=$2`,[id,storeId]);
  if (!found.rowCount) throw new ApiError(404,'Pedido não encontrado.');
  const details=await pool.query(`SELECT product_name AS "name",sku_snapshot AS sku,
    variant_snapshot AS attributes,quantity,unit_price_cents::text AS "unitPriceCents"
    FROM order_items WHERE order_id=$1 AND store_id=$2 ORDER BY id`,[id,storeId]);
  return { ...found.rows[0], items:details.rows };
}

function subscribeSse(req:FastifyRequest, reply:import('fastify').FastifyReply, channel:string) {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type':'text/event-stream; charset=utf-8',
    'Cache-Control':'no-cache, no-transform',Connection:'keep-alive','X-Accel-Buffering':'no',
  });
  const emit=()=>{ if(!reply.raw.destroyed) reply.raw.write('event: orders\ndata: {"changed":true}\n\n'); };
  const heartbeat=setInterval(()=>{if(!reply.raw.destroyed)reply.raw.write(': heartbeat\n\n');},20000);
  // Encerra para renovar o token de acesso após no máximo 10 minutos.
  const lifetime=setTimeout(()=>reply.raw.end(),10*60_000);
  const cleanup=()=>{ clearInterval(heartbeat);clearTimeout(lifetime);orderEvents.off(channel,emit); };
  reply.raw.on('close',cleanup);
  orderEvents.on(channel,emit);
  emit();
}

async function createReservedOrder(storeId:string,customerId:string,body:z.infer<typeof orderBody>,demo=false):Promise<string> {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // A modalidade pertence ao banco, não ao app: impede alternância de flag
    // durante uma compra, mesmo entre o check da rota e esta transação.
    const demoFlag=await client.query<{is_demo:boolean}>(
      'SELECT is_demo FROM stores WHERE id=$1 AND status=$2 FOR SHARE',[storeId,'ACTIVE']);
    if (demoFlag.rows[0]?.is_demo !== demo)
      throw new ApiError(409,'Configuração da loja alterada. Atualize o checkout.');
    // A mesma intenção de checkout nunca pode reservar duas vezes.
    const previous=await client.query<{id:string}>(`
      SELECT id FROM orders WHERE store_id=$1 AND customer_id=$2 AND idempotency_key=$3`,
      [storeId,customerId,body.idempotencyKey]);
    if (previous.rowCount) { await client.query('COMMIT'); return previous.rows[0].id; }
    // Um único checkout simultâneo por usuário na loja. Evita corrida com a mesma chave.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',[storeId,customerId]);
    const again=await client.query<{id:string}>(`
      SELECT id FROM orders WHERE store_id=$1 AND customer_id=$2 AND idempotency_key=$3`,
      [storeId,customerId,body.idempotencyKey]);
    if (again.rowCount) { await client.query('COMMIT'); return again.rows[0].id; }
    const unique=new Map<string,{ productId:string;color:string;size:string;quantity:number }>();
    for (const i of body.items) {
      const key=`${i.productId}:${i.color.trim().toLowerCase()}:${i.size.trim().toLowerCase()}`;
      const old=unique.get(key);
      const quantity=(old?.quantity ?? 0)+i.quantity;
      if (quantity>20) throw new ApiError(400,'Quantidade acima do permitido para uma variante.');
      unique.set(key,{...i,quantity});
    }
    const variants: Array<{v:LockedVariant;quantity:number}> = [];
    for (const i of unique.values()) {
      const found=await client.query<LockedVariant>(`
        SELECT v.id,v.product_id,p.name,v.sku,v.attributes,v.price_cents::text,v.on_hand,v.reserved
        FROM product_variants v JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
        WHERE v.product_id=$1 AND v.store_id=$2 AND v.status='ACTIVE' AND p.status='PUBLISHED'
          AND lower(v.attributes->>'color')=lower($3) AND lower(v.attributes->>'size')=lower($4)
        LIMIT 1`,[i.productId,storeId,i.color,i.size]);
      if (!found.rowCount) throw new ApiError(409,'Produto ou variante indisponível. Atualize o carrinho.');
      variants.push({v:found.rows[0],quantity:i.quantity});
    }
    variants.sort((a,b)=>a.v.id.localeCompare(b.v.id));
    for (const {v,quantity} of variants) {
      const r=await client.query<{on_hand:number;reserved:number;price_cents:string}>(`
        SELECT on_hand,reserved,price_cents::text FROM product_variants WHERE id=$1 AND store_id=$2 FOR UPDATE`,[v.id,storeId]);
      const locked=r.rows[0];
      if (!locked || locked.on_hand-locked.reserved<quantity) throw new ApiError(409,`Estoque insuficiente para ${v.name}.`);
      v.price_cents=locked.price_cents;
    }
    const subtotal=variants.reduce((total,{v,quantity})=>total+BigInt(v.price_cents)*BigInt(quantity),0n);
    if(subtotal<=0n || subtotal>100_000_000_00n) throw new ApiError(400,'Valor do pedido inválido.');
    if (demo && body.fulfillment !== 'PICKUP')
      throw new ApiError(400,'Demonstração disponível apenas para retirada.');
    let shippingCents=0;
    let selected:ShippingService|null=null;
    let shippingAddress:Record<string,unknown>={name:body.customer.name,phone:body.customer.phone,notes:body.notes,fulfillment:'PICKUP'};
    if(body.fulfillment==='DELIVERY'){
      // Cotações sandbox nunca podem fundamentar uma cobrança real.
      if(config.SHIPPING_MELHOR_ENVIO_SANDBOX)
        throw new ApiError(409,'Frete em ambiente de teste: não é permitido cobrar entrega.');
      const details=body.shipping!;
      if(!config.SHIPPING_MELHOR_ENVIO_TOKEN || config.SHIPPING_PILOT_STORE_ID!==storeId ||
          !config.SHIPPING_USER_AGENT) throw new ApiError(503,'Entrega não habilitada nesta loja.');
      const quote=await client.query<{origin_postal_code:string;destination_postal_code:string;cart_hash:string;
        services:ShippingService[];expires_at:Date}>(`
        SELECT origin_postal_code,destination_postal_code,cart_hash,services,expires_at
        FROM shipping_quotes WHERE id=$1 AND store_id=$2 AND customer_id=$3 FOR UPDATE`,
        [details.quoteId,storeId,customerId]);
      if(!quote.rowCount || quote.rows[0].expires_at.getTime()<=Date.now())
        throw new ApiError(409,'Cotação vencida ou indisponível. Calcule o frete novamente.');
      const q=quote.rows[0];
      if(q.destination_postal_code!==details.address.postalCode)throw new ApiError(409,'CEP diferente da cotação.');
      const origin=await client.query<{origin_postal_code:string}>(
        'SELECT origin_postal_code FROM store_shipping_settings WHERE store_id=$1',[storeId]);
      if(origin.rows[0]?.origin_postal_code!==q.origin_postal_code)
        throw new ApiError(409,'A origem mudou. Calcule o frete novamente.');
      const parcelItems:ParcelItem[]=[];
      for(const {v,quantity} of variants){
        const r=await client.query<{weight_kg:string;width_cm:string;height_cm:string;length_cm:string}>(`
          SELECT weight_kg::text,width_cm::text,height_cm::text,length_cm::text
          FROM shipping_variant_parcels WHERE variant_id=$1 AND store_id=$2 FOR SHARE`,[v.id,storeId]);
        if(!r.rowCount)throw new ApiError(409,'Produto sem medidas para frete.');
        const x=r.rows[0];
        parcelItems.push({variantId:v.id,quantity,unitCents:v.price_cents,
          weightKg:Number(x.weight_kg),widthCm:Number(x.width_cm),heightCm:Number(x.height_cm),lengthCm:Number(x.length_cm)});
      }
      if(cartFingerprint(q.origin_postal_code,q.destination_postal_code,parcelItems)!==q.cart_hash)
        throw new ApiError(409,'Preços, pacotes ou produtos mudaram. Calcule o frete novamente.');
      selected=q.services.find(o=>o.id===details.serviceId)??null;
      if(!selected||!Number.isInteger(selected.priceCents)||selected.priceCents<=0)
        throw new ApiError(409,'Modalidade de frete inválida.');
      shippingCents=selected.priceCents;
      shippingAddress={...details.address,name:body.customer.name,phone:body.customer.phone,
        notes:body.notes,fulfillment:'DELIVERY'};
    }
    const total=subtotal+BigInt(shippingCents);
    if(total>100_000_000_00n)throw new ApiError(400,'Total inválido.');
    const orderId=randomUUID();
    await client.query(`INSERT INTO orders(id,store_id,customer_id,idempotency_key,status,subtotal_cents,
      shipping_cents,total_cents,shipping_address,fulfillment_method,reservation_expires_at,
      shipping_service_id,shipping_carrier,shipping_delivery_days,paid_at,is_demo)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16)`,
      [orderId,storeId,customerId,body.idempotencyKey,demo?'PAID':'PENDING_PAYMENT',
        subtotal.toString(),shippingCents,total.toString(),
        JSON.stringify({...shippingAddress,...(demo?{demoPaymentMethod:body.demoPaymentMethod}: {})}),
        body.fulfillment,demo?null:new Date(Date.now()+48*60*60*1000),
        selected?.id??null,selected?`${selected.carrier} - ${selected.name}`:null,
        selected?.deliveryDays??null,demo?new Date():null,demo]);
    for(const {v,quantity} of variants) {
      if (demo) {
        // Somente estoque de loja marcada como demo: compra fictícia baixada na hora.
        await client.query(`UPDATE product_variants SET on_hand=on_hand-$3,updated_at=now()
          WHERE id=$1 AND store_id=$2`,[v.id,storeId,quantity]);
      } else {
        await client.query(`UPDATE product_variants SET reserved=reserved+$3,updated_at=now()
          WHERE id=$1 AND store_id=$2`,[v.id,storeId,quantity]);
      }
      await client.query(`INSERT INTO order_items(order_id,store_id,product_id,variant_id,product_name,
        sku_snapshot,variant_snapshot,quantity,unit_price_cents)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [orderId,storeId,v.product_id,v.id,v.name,v.sku,JSON.stringify(v.attributes),quantity,v.price_cents]);
      await client.query(`INSERT INTO inventory_movements(store_id,variant_id,performed_by,kind,quantity_delta,reference_id,notes)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[storeId,v.id,customerId,demo?'SALE':'RESERVATION',
          demo?-quantity:0,orderId,demo?`Venda fictícia de ${quantity} un.`:`Reserva de ${quantity} un.`]);
    }
    await client.query(`INSERT INTO payments(order_id,store_id,provider,amount_cents,status)
      VALUES($1,$2,$3,$4,$5)`,[orderId,storeId,demo?'demo':'mercadopago',
        total.toString(),demo?'APPROVED':'PENDING']);
    await client.query(`INSERT INTO order_events(order_id,store_id,actor_id,status,notes)
      VALUES($1,$2,$3,$4,$5)`,[orderId,storeId,customerId,demo?'PAID':'PENDING_PAYMENT',
        demo?`SIMULAÇÃO ${body.demoPaymentMethod}: sem cobrança ou transferência real`:
          'Pedido criado com estoque reservado']);
    await client.query('COMMIT');
    return orderId;
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

async function mpFetch(path:string, options:RequestInit={}) {
  const response=await fetch(`https://api.mercadopago.com${path}`,{
    ...options, signal:AbortSignal.timeout(12000),
    headers:{'Authorization':`Bearer ${config.MERCADOPAGO_ACCESS_TOKEN}`,
      'Accept':'application/json', ...(options.body?{'Content-Type':'application/json'}:{}),
      ...options.headers},
  });
  const body:unknown=await response.json().catch(()=>null);
  if(!response.ok || !body || typeof body!=='object') throw new ApiError(502,'Gateway de pagamento temporariamente indisponível. Tente novamente.');
  return body as Record<string,unknown>;
}
async function checkoutUrl(orderId:string,storeId:string):Promise<string> {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const o=await queryOrder(client,orderId);
    if(o.store_id!==storeId) throw new ApiError(404,'Pedido não encontrado.');
    // Solicitação de cancelamento aberta: não emitir novos links de checkout.
    // Links anteriormente compartilhados ainda podem receber pagamentos; conciliar no gateway.
    const cancel=await client.query(`SELECT 1 FROM after_sales_requests WHERE order_id=$1
      AND request_type='CANCEL' AND status IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION')`,[orderId]);
    if(cancel.rowCount)throw new ApiError(409,'Há um cancelamento em análise. Aguarde a equipe da loja.');
    if(o.status!=='PENDING_PAYMENT' || (o.reservation_expires_at && o.reservation_expires_at.getTime()<Date.now()))
      throw new ApiError(409,'Pedido não está mais aguardando pagamento.');
    if(o.checkout_url && o.checkout_expires_at && o.checkout_expires_at.getTime()>Date.now()) {
      await client.query('COMMIT'); return o.checkout_url;
    }
    // Uma preferência por pedido enquanto o banco estiver saudável; execução serializada.
    const items=await client.query<{product_name:string;quantity:number;unit_price_cents:string}>(
      'SELECT product_name,quantity,unit_price_cents::text FROM order_items WHERE order_id=$1',[orderId]);
    const publicUrl=config.PUBLIC_BASE_URL!.replace(/\/$/,'');
    const checkoutExpiresAt=new Date(Date.now()+30*60_000);
    const delivery=await client.query<{shipping_cents:string}>(
      'SELECT shipping_cents::text FROM orders WHERE id=$1 AND store_id=$2',[orderId,storeId]);
    const fee=Number(delivery.rows[0]?.shipping_cents??0);
    const preference=await mpFetch('/checkout/preferences',{
      method:'POST', body:JSON.stringify({
        items:[...items.rows.map(i=>({title:i.product_name,quantity:i.quantity,
          unit_price:Number(i.unit_price_cents)/100,currency_id:'BRL'})),
          ...(fee>0?[{title:'Frete',quantity:1,unit_price:fee/100,currency_id:'BRL'}]:[])],
        external_reference:orderId,
        notification_url:`${publicUrl}/v1/payments/mercadopago/webhook`,
        back_urls:{success:`${publicUrl}/v1/payments/return`,
          failure:`${publicUrl}/v1/payments/return`,pending:`${publicUrl}/v1/payments/return`},
        expires:true,
        expiration_date_from:now(),
        expiration_date_to:checkoutExpiresAt.toISOString(),
      }),
    });
    const url=preference.init_point;
    const id=preference.id;
    if(typeof url!=='string' || !url.startsWith('https://') || typeof id!=='string')
      throw new ApiError(502,'O gateway não retornou uma URL de pagamento válida.');
    await client.query(`UPDATE payments SET checkout_url=$3,checkout_reference=$4,checkout_expires_at=$5,updated_at=now()
      WHERE order_id=$1 AND store_id=$2 AND provider='mercadopago'`,[orderId,storeId,url,id,checkoutExpiresAt]);
    await client.query('COMMIT');
    return url;
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

async function releaseReserved(client:PoolClient,orderId:string,storeId:string,reason:string,actorId:string|null) {
  const items=await client.query<{variant_id:string;quantity:number}>(
    'SELECT variant_id,quantity FROM order_items WHERE order_id=$1 AND store_id=$2 ORDER BY variant_id',[orderId,storeId]);
  for(const i of items.rows) {
    const released=await client.query('UPDATE product_variants SET reserved=reserved-$3,updated_at=now() WHERE id=$1 AND store_id=$2 AND reserved >= $3 RETURNING id',
      [i.variant_id,storeId,i.quantity]);
    if(!released.rowCount) throw new ApiError(409,'Inconsistência de reserva. Intervenção necessária.');
    await client.query(`INSERT INTO inventory_movements(store_id,variant_id,performed_by,kind,quantity_delta,reference_id,notes)
      VALUES($1,$2,$3,'RELEASE',0,$4,$5)`,[storeId,i.variant_id,actorId,orderId,reason]);
  }
}
async function applyPayment(paymentId:string) {
  const payment=await mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`);
  if (String(payment.id)!==paymentId) throw new ApiError(502,'Resposta de pagamento inconsistente.');
  const orderId=payment.external_reference;
  if(typeof orderId!=='string' || !z.string().uuid().safeParse(orderId).success) return;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const order=await queryOrder(client,orderId);
    // Confirmação exige referência, valor, moeda e loja-piloto coincidentes.
    if(order.store_id!==config.PAYMENT_PILOT_STORE_ID || payment.currency_id!=='BRL' ||
      !Number.isFinite(Number(payment.transaction_amount)) ||
      Math.round(Number(payment.transaction_amount)*100)!==Number(order.total_cents)) {
      throw new ApiError(409,'Pagamento com valores ou loja divergentes: revisão necessária.');
    }
    const status=String(payment.status);
    const existingPayment=await client.query<{gateway_payment_id:string|null}>(
      'SELECT gateway_payment_id FROM payments WHERE order_id=$1 FOR UPDATE',[orderId]);
    if(existingPayment.rows[0]?.gateway_payment_id &&
      existingPayment.rows[0].gateway_payment_id!==paymentId && status==='approved') {
      await client.query("UPDATE payments SET status='REVIEW',updated_at=now() WHERE order_id=$1",[orderId]);
      await client.query("UPDATE orders SET status='PAYMENT_REVIEW',updated_at=now() WHERE id=$1",[orderId]);
      await client.query(`INSERT INTO order_events(order_id,store_id,status,notes)
        VALUES($1,$2,'PAYMENT_REVIEW','Pagamento duplicado detectado: verificar estorno')`,[orderId,order.store_id]);
      await client.query('COMMIT');
      return;
    }
    if(status==='approved') {
      if(order.status==='PENDING_PAYMENT' && order.reservation_expires_at && order.reservation_expires_at.getTime()>Date.now()) {
        const items=await client.query<{variant_id:string;quantity:number}>(
          'SELECT variant_id,quantity FROM order_items WHERE order_id=$1 ORDER BY variant_id',[orderId]);
        for(const i of items.rows) {
          const result=await client.query(`UPDATE product_variants SET on_hand=on_hand-$3,reserved=reserved-$3,updated_at=now()
            WHERE id=$1 AND store_id=$2 AND on_hand >= $3 AND reserved >= $3 RETURNING id`,[i.variant_id,order.store_id,i.quantity]);
          if(!result.rowCount) throw new ApiError(409,'Estoque mudou: pagamento requer revisão manual.');
          await client.query(`INSERT INTO inventory_movements(store_id,variant_id,kind,quantity_delta,reference_id,notes)
            VALUES($1,$2,'SALE',$3,$4,'Pagamento aprovado pelo gateway')`,[order.store_id,i.variant_id,-i.quantity,orderId]);
        }
        await client.query("UPDATE orders SET status='PAID',paid_at=now(),updated_at=now() WHERE id=$1",[orderId]);
        await client.query(`INSERT INTO order_events(order_id,store_id,status,notes)
          VALUES($1,$2,'PAID','Pagamento confirmado por consulta ao Mercado Pago')`,[orderId,order.store_id]);
      } else if (!['PAID','PREPARING','SHIPPED','DELIVERED','REFUNDED'].includes(order.status)) {
        // Pagamento após liberação do estoque: jamais fazer nova baixa ou entrega automática.
        await client.query("UPDATE orders SET status='PAYMENT_REVIEW',updated_at=now() WHERE id=$1",[orderId]);
        await client.query(`INSERT INTO order_events(order_id,store_id,status,notes)
          VALUES($1,$2,'PAYMENT_REVIEW','Pagamento tardio; conferir ressarcimento/estoque')`,[orderId,order.store_id]);
      }
      // Pagamento aprovado (webhook atrasado) não pode reverter um reembolso confirmado.
      const confirmedRefund=await client.query(`SELECT 1 FROM payment_refund_operations
        WHERE order_id=$1 AND status='CONFIRMED'`,[orderId]);
      await client.query(`UPDATE payments SET status=$2,gateway_payment_id=$3,updated_at=now() WHERE order_id=$1`,
        [orderId,confirmedRefund.rowCount?'REFUNDED':
          ['PAID','PREPARING','SHIPPED','DELIVERED'].includes(order.status)?'APPROVED':
          order.status==='PENDING_PAYMENT' && order.reservation_expires_at && order.reservation_expires_at.getTime()>Date.now()?'APPROVED':'REVIEW',paymentId]);
    } else if (status==='refunded' || status==='charged_back') {
      // Nunca desfazer conciliação já CONFIRMADA. Outros estornos/chargebacks
      // permanecem em revisão para evitar declarar devolução equivocadamente.
      const confirmed=await client.query(`SELECT 1 FROM payment_refund_operations
        WHERE order_id=$1 AND status='CONFIRMED' AND gateway_payment_id=$2`,[orderId,paymentId]);
      if (!confirmed.rowCount || status==='charged_back') {
        await client.query("UPDATE orders SET status='PAYMENT_REVIEW',updated_at=now() WHERE id=$1",[orderId]);
        await client.query("UPDATE payments SET status='REVIEW',gateway_payment_id=$2,updated_at=now() WHERE order_id=$1",[orderId,paymentId]);
      }
    } else if (['rejected','cancelled'].includes(status) && order.status==='PENDING_PAYMENT') {
      await releaseReserved(client,orderId,order.store_id,'Pagamento não aprovado',null);
      await client.query("UPDATE orders SET status='CANCELED',updated_at=now() WHERE id=$1",[orderId]);
      await client.query("UPDATE payments SET status='FAILED',gateway_payment_id=$2,updated_at=now() WHERE order_id=$1",[orderId,paymentId]);
      await client.query(`INSERT INTO order_events(order_id,store_id,status,notes)
        VALUES($1,$2,'CANCELED','Pagamento recusado/cancelado pelo gateway')`,[orderId,order.store_id]);
    }
    await client.query('COMMIT');
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

export async function expireReservations() {
  const expired=await pool.query<{id:string}>(`
    SELECT id FROM orders WHERE status='PENDING_PAYMENT' AND reservation_expires_at < now()
    ORDER BY reservation_expires_at ASC LIMIT 50`);
  for(const row of expired.rows) {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const order=await queryOrder(client,row.id);
      if(order.status==='PENDING_PAYMENT' && order.reservation_expires_at && order.reservation_expires_at.getTime()<Date.now()) {
        await releaseReserved(client,order.id,order.store_id,'Reserva expirada',null);
        await client.query("UPDATE orders SET status='CANCELED',updated_at=now() WHERE id=$1",[order.id]);
        await client.query(`INSERT INTO order_events(order_id,store_id,status,notes) VALUES($1,$2,'CANCELED','Reserva expirada')`,[order.id,order.store_id]);
      }
      await client.query('COMMIT');
    } catch(e) { await client.query('ROLLBACK'); console.error('Falha ao expirar reserva:', (e as Error).message); }
    finally { client.release(); }
  }
}

export async function commerceRoutes(app:FastifyInstance) {
  app.post('/v1/shops/:slug/checkout/orders', { config:{rateLimit:{max:8,timeWindow:'1 minute'}} }, async(req,reply)=>{
    const {slug:shop}=validated(shopParams,req.params);
    const storeId=await storeBySlug(shop);
    const store=await pool.query<{is_demo:boolean}>(
      'SELECT is_demo FROM stores WHERE id=$1 AND status=$2',[storeId,'ACTIVE']);
    const demo=store.rows[0]?.is_demo===true;
    if (!demo) assertPilot(storeId);
    const identity=await requireIdentity(req);
    const body=validated(orderBody,req.body);
    if (demo !== (body.demoPaymentMethod !== undefined))
      throw new ApiError(400,demo?'Escolha Pix ou cartão simulado.':'Pagamento de demonstração não permitido nesta loja.');
    const orderId=await createReservedOrder(storeId,identity.userId,body,demo);
    const url=demo?null:await checkoutUrl(orderId,storeId);
    return reply.code(201).send({order:await orderView(orderId,storeId),checkoutUrl:url,
      demo,simulated:demo});
  });
  app.post('/v1/shops/:slug/orders/:orderId/checkout', {config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req)=>{
    const {slug:shop,orderId}=validated(shopOrderParams,req.params);
    const storeId=await storeBySlug(shop);
    assertPilot(storeId);
    const identity=await requireIdentity(req);
    const owns=await pool.query('SELECT 1 FROM orders WHERE id=$1 AND store_id=$2 AND customer_id=$3',
      [orderId,storeId,identity.userId]);
    if(!owns.rowCount) throw new ApiError(404,'Pedido não encontrado.');
    const existing=await orderView(orderId,storeId);
    if(existing.isDemo) throw new ApiError(409,'Pedido de demonstração não recebe cobrança real.');
    return {order:existing,checkoutUrl:await checkoutUrl(orderId,storeId)};
  });
  app.get('/v1/shops/:slug/orders/events',async(req,reply)=>{
    const {slug:shop}=validated(shopParams,req.params);
    const identity=await requireIdentity(req);
    const storeId=await storeBySlug(shop);
    subscribeSse(req,reply,`user:${storeId}:${identity.userId}`);
  });
  app.get('/v1/stores/:storeId/orders/events',async(req,reply)=>{
    const {storeId}=validated(storeParams,req.params);
    await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
    subscribeSse(req,reply,`store:${storeId}`);
  });
  app.get('/v1/shops/:slug/orders',async(req)=>{
    const {slug:shop}=validated(shopParams,req.params);
    const identity=await requireIdentity(req);
    const storeId=await storeBySlug(shop);
    const r=await pool.query<{id:string}>(`SELECT id FROM orders WHERE store_id=$1 AND customer_id=$2
      ORDER BY created_at DESC LIMIT 100`,[storeId,identity.userId]);
    return {orders:await Promise.all(r.rows.map(row=>orderView(row.id,storeId)))};
  });
  app.get('/v1/shops/:slug/orders/:orderId',async(req)=>{
    const {slug:shop,orderId}=validated(shopOrderParams,req.params);
    const identity=await requireIdentity(req);
    const storeId=await storeBySlug(shop);
    const r=await pool.query('SELECT 1 FROM orders WHERE id=$1 AND store_id=$2 AND customer_id=$3',[orderId,storeId,identity.userId]);
    if(!r.rowCount) throw new ApiError(404,'Pedido não encontrado.');
    return {order:await orderView(orderId,storeId)};
  });
  app.get('/v1/stores/:storeId/orders',async(req)=>{
    const {storeId}=validated(storeParams,req.params);
    await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
    const r=await pool.query<{id:string}>(`SELECT id FROM orders WHERE store_id=$1 ORDER BY created_at DESC LIMIT 100`,[storeId]);
    return {orders:await Promise.all(r.rows.map(row=>orderView(row.id,storeId)))};
  });
  app.patch('/v1/stores/:storeId/orders/:orderId/status',async(req)=>{
    const {storeId,orderId}=validated(storeOrderParams,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const {status,notes}=validated(transitionBody,req.body);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const order=await queryOrder(client,orderId);
      if(order.store_id!==storeId) throw new ApiError(404,'Pedido não encontrado.');
      // Impede preparação/retirada enquanto houver contestação operacional ativa.
      const outstanding=await client.query(`SELECT 1 FROM after_sales_requests WHERE order_id=$1
        AND request_type IN ('CANCEL','RETURN','REFUND')
        AND status IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION')`,[orderId]);
      if(outstanding.rowCount) throw new ApiError(409,'Há uma solicitação de pós-venda em análise. Resolva-a antes de avançar o pedido.');
      const next:Record<string,string>={PAID:'PREPARING',PREPARING:'SHIPPED',SHIPPED:'DELIVERED'};
      if(next[order.status]!==status) throw new ApiError(409,'Transição de pedido inválida.');
      if(status==='SHIPPED'){
        const method=await client.query<{fulfillment_method:string}>(
          'SELECT fulfillment_method FROM orders WHERE id=$1',[orderId]);
        if(method.rows[0]?.fulfillment_method==='DELIVERY')
          throw new ApiError(409,'Para entregas, registre o código de rastreamento pelo painel de expedição.');
      }
      if(status==='DELIVERED'){
        const method=await client.query<{fulfillment_method:string}>(
          'SELECT fulfillment_method FROM orders WHERE id=$1',[orderId]);
        if(method.rows[0]?.fulfillment_method==='DELIVERY')
          throw new ApiError(409,'Confirme a entrega pela área de expedição.');
      }
      await client.query('UPDATE orders SET status=$2,updated_at=now() WHERE id=$1',[orderId,status]);
      await client.query(`INSERT INTO order_events(order_id,store_id,actor_id,status,notes)
        VALUES($1,$2,$3,$4,$5)`,[orderId,storeId,identity.userId,status,notes??null]);
      await client.query('COMMIT');
    } catch(e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
    return {order:await orderView(orderId,storeId)};
  });
  app.post('/v1/payments/mercadopago/webhook',async(req,reply)=>{
    // Endpoint público: verifica HMAC + consulta REST antes de alterar qualquer pedido.
    if(!config.ENABLE_REAL_PAYMENTS || !config.MERCADOPAGO_WEBHOOK_SECRET) return reply.code(503).send({error:'NOT_CONFIGURED'});
    const parsed=webhookQuery.safeParse(req.query);
    if(!parsed.success) return reply.code(400).send({error:'INVALID_PAYMENT_ID'});
    const paymentId=parsed.data['data.id'];
    const xSig=req.headers['x-signature'];
    const xReq=req.headers['x-request-id'];
    const valid=verifyMercadoPagoSignature(
      typeof xSig==='string'?xSig:undefined,typeof xReq==='string'?xReq:undefined,
      paymentId,config.MERCADOPAGO_WEBHOOK_SECRET);
    if(!valid) return reply.code(401).send({error:'INVALID_SIGNATURE'});
    await applyPayment(paymentId);
    return reply.code(200).send({ok:true});
  });
  app.get('/v1/payments/return',async(_req,reply)=>{
    // Nunca confiar no status, collection_id ou payment_id do redirect.
    reply.header('Content-Type','text/html; charset=utf-8').header('Cache-Control','no-store');
    return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Pagamento</title><body style="font-family:sans-serif;text-align:center;padding:50px"><h2>Retorne ao aplicativo</h2><p>O pagamento será confirmado após verificação com o Mercado Pago. Consulte a seção Pedidos.</p></body></html>';
  });
  // Funciona como diagnóstico do piloto, sem expor as credenciais.
  app.get('/v1/shops/:slug/checkout/availability',async(req)=>{
    const {slug:shop}=validated(shopParams,req.params);
    const storeId=await storeBySlug(shop);
    const found=await pool.query<{is_demo:boolean}>('SELECT is_demo FROM stores WHERE id=$1',[storeId]);
    const demo=found.rows[0]?.is_demo===true;
    return {demo,demoLoginEnabled:demo && config.ENABLE_PUBLIC_DEMO_LOGIN,simulatedMethods:demo?['PIX','CARD']:[],
      enabled:demo || (config.ENABLE_REAL_PAYMENTS && config.PAYMENT_PILOT_STORE_ID===storeId &&
      !!config.MERCADOPAGO_ACCESS_TOKEN && !!config.MERCADOPAGO_WEBHOOK_SECRET && !!config.PUBLIC_BASE_URL),
      fulfillment:demo?['PICKUP']:['PICKUP',
        ...(!!config.SHIPPING_MELHOR_ENVIO_TOKEN && config.SHIPPING_PILOT_STORE_ID===storeId ? ['DELIVERY']:[])]};
  });
}
