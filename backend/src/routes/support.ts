import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireIdentity, requireStoreRole } from '../security/identity.js';
import { uuidParam, validated } from '../security/validation.js';
import { supportEvents } from './catalog.js';
import { supportTicketInput, supportMessageInput, supportStateInput } from '../services/support_inputs.js';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48);
const clientParams = z.object({ slug }).strict();
const staffParams = z.object({ storeId: uuidParam }).strict();
const clientTicket = clientParams.extend({ ticketId: uuidParam });
const staffTicket = staffParams.extend({ ticketId: uuidParam });

async function lookupStore(value: string): Promise<string> {
  const result = await pool.query<{ id:string }>("SELECT id FROM stores WHERE slug=$1 AND status='ACTIVE'", [value]);
  if (!result.rowCount) throw new ApiError(404,'Loja não encontrada.');
  return result.rows[0].id;
}

async function assertTicket(storeId:string,ticketId:string,customerId?:string) {
  const result = await pool.query<{id:string; status:string; customer_id:string}>(
    `SELECT id,status,customer_id FROM support_tickets WHERE id=$1 AND store_id=$2
      AND ($3::uuid IS NULL OR customer_id=$3)`,[ticketId,storeId,customerId??null]);
  if (!result.rowCount) throw new ApiError(404,'Atendimento não encontrado.');
  return result.rows[0];
}

async function listTickets(storeId:string,customerId?:string) {
  const result=await pool.query(`SELECT t.id,t.subject,t.status,t.order_id AS "orderId",
    t.created_at AS "createdAt",t.updated_at AS "updatedAt",
    t.last_message_at AS "lastMessageAt",u.display_name AS "customerName"
    FROM support_tickets t JOIN users u ON u.id=t.customer_id
    WHERE t.store_id=$1 AND ($2::uuid IS NULL OR t.customer_id=$2)
    ORDER BY t.last_message_at DESC LIMIT 100`,[storeId,customerId??null]);
  return {tickets:result.rows};
}

async function messages(storeId:string,ticketId:string,customerId?:string) {
  const ticket=await assertTicket(storeId,ticketId,customerId);
  const rows=await pool.query(`SELECT m.id,m.sender_id AS "senderId",u.display_name AS "senderName",
     m.body,m.created_at AS "createdAt",(m.sender_id=t.customer_id) AS "fromCustomer"
     FROM support_messages m JOIN users u ON u.id=m.sender_id
     JOIN support_tickets t ON t.id=m.ticket_id AND t.store_id=m.store_id
     WHERE m.store_id=$1 AND m.ticket_id=$2 ORDER BY m.created_at DESC,m.id DESC LIMIT 200`,[storeId,ticketId]);
  return { ticket: {id:ticket.id,status:ticket.status}, messages:rows.rows.reverse() };
}

async function addMessage(storeId:string,ticketId:string,userId:string,body:string,customerId?:string) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const result=await client.query<{status:string}>(`SELECT status FROM support_tickets
      WHERE id=$1 AND store_id=$2 AND ($3::uuid IS NULL OR customer_id=$3) FOR UPDATE`,
      [ticketId,storeId,customerId??null]);
    if(!result.rowCount)throw new ApiError(404,'Atendimento não encontrado.');
    if(result.rows[0].status!=='OPEN')throw new ApiError(409,'Atendimento encerrado. Reabra antes de responder.');
    await client.query(`INSERT INTO support_messages(ticket_id,store_id,sender_id,body)
      VALUES ($1,$2,$3,$4)`,[ticketId,storeId,userId,body]);
    await client.query(`UPDATE support_tickets SET last_message_at=now(),updated_at=now()
      WHERE id=$1 AND store_id=$2`,[ticketId,storeId]);
    await client.query('COMMIT');
  } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
  return messages(storeId,ticketId,customerId);
}

async function changeStatus(storeId:string,ticketId:string,status:'OPEN'|'CLOSED',actorId:string,customerId?:string) {
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const r=await client.query(`UPDATE support_tickets SET status=$3,updated_at=now()
      WHERE id=$1 AND store_id=$2 AND ($4::uuid IS NULL OR customer_id=$4)
      RETURNING id`,[ticketId,storeId,status,customerId??null]);
    if(!r.rowCount)throw new ApiError(404,'Atendimento não encontrado.');
    await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
      VALUES ($1,$2,'SUPPORT_STATUS_CHANGED','support_ticket',$3,$4::jsonb)`,
      [storeId,actorId,ticketId,JSON.stringify({status})]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  return {ok:true,status};
}

function subscribe(req:FastifyRequest,reply:FastifyReply,channel:string) {
  reply.hijack();
  reply.raw.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8',
    'Cache-Control':'no-cache, no-transform',Connection:'keep-alive','X-Accel-Buffering':'no'});
  const emit=()=>{if(!reply.raw.destroyed)reply.raw.write('event: support\ndata: {"changed":true}\n\n');};
  const heartbeat=setInterval(()=>{if(!reply.raw.destroyed)reply.raw.write(': heartbeat\n\n');},20000);
  const lifetime=setTimeout(()=>reply.raw.end(),10*60_000);
  const cleanup=()=>{clearInterval(heartbeat);clearTimeout(lifetime);supportEvents.off(channel,emit);};
  reply.raw.on('close',cleanup);supportEvents.on(channel,emit);emit();
}

export async function supportRoutes(app:FastifyInstance) {
  // As rotas do comprador nunca aceitam storeId nem customerId vindos do payload.
  app.get('/v1/shops/:slug/support/tickets',async req=>{
    const {slug}=validated(clientParams,req.params);
    const identity=await requireIdentity(req);
    return listTickets(await lookupStore(slug),identity.userId);
  });
  app.post('/v1/shops/:slug/support/tickets',{config:{rateLimit:{max:6,timeWindow:'1 hour'}}},async(req,reply)=>{
    const {slug}=validated(clientParams,req.params);
    const identity=await requireIdentity(req);
    const storeId=await lookupStore(slug);
    const body=validated(supportTicketInput,req.body);
    if(body.orderId){
      const owner=await pool.query('SELECT 1 FROM orders WHERE id=$1 AND store_id=$2 AND customer_id=$3',
        [body.orderId,storeId,identity.userId]);
      if(!owner.rowCount)throw new ApiError(404,'Pedido não encontrado para sua conta.');
    }
    const client=await pool.connect();
    let ticketId:string;
    try{
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[identity.userId]);
      const open=await client.query<{count:string}>(`SELECT count(*)::text AS count FROM support_tickets
        WHERE store_id=$1 AND customer_id=$2 AND status='OPEN'`,[storeId,identity.userId]);
      if(Number(open.rows[0].count)>=10)throw new ApiError(409,'Você já possui muitos atendimentos abertos.');
      const created=await client.query<{id:string}>(`INSERT INTO support_tickets(store_id,customer_id,order_id,subject)
        VALUES($1,$2,$3,$4) RETURNING id`,[storeId,identity.userId,body.orderId??null,body.subject]);
      ticketId=created.rows[0].id;
      await client.query(`INSERT INTO support_messages(ticket_id,store_id,sender_id,body)
        VALUES($1,$2,$3,$4)`,[ticketId,storeId,identity.userId,body.message]);
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    return reply.code(201).send({ticketId});
  });
  app.get('/v1/shops/:slug/support/tickets/:ticketId/messages',async req=>{
    const {slug,ticketId}=validated(clientTicket,req.params);
    const identity=await requireIdentity(req);
    return messages(await lookupStore(slug),ticketId,identity.userId);
  });
  app.post('/v1/shops/:slug/support/tickets/:ticketId/messages',
    {config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async req=>{
      const {slug,ticketId}=validated(clientTicket,req.params);
      const identity=await requireIdentity(req);
      return addMessage(await lookupStore(slug),ticketId,identity.userId,validated(supportMessageInput,req.body).body,identity.userId);
    });
  app.patch('/v1/shops/:slug/support/tickets/:ticketId/status',async req=>{
    const {slug,ticketId}=validated(clientTicket,req.params);
    const identity=await requireIdentity(req);
    const {status}=validated(supportStateInput,req.body);
    if(status!=='CLOSED')throw new ApiError(403,'Somente a equipe pode reabrir um atendimento.');
    return changeStatus(await lookupStore(slug),ticketId,status,identity.userId,identity.userId);
  });
  app.get('/v1/shops/:slug/support/events',async(req,reply)=>{
    const {slug}=validated(clientParams,req.params);
    const identity=await requireIdentity(req);
    const storeId=await lookupStore(slug);
    subscribe(req,reply,`user:${storeId}:${identity.userId}`);
  });
  app.get('/v1/stores/:storeId/support/tickets',async req=>{
    const {storeId}=validated(staffParams,req.params);
    await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
    return listTickets(storeId);
  });
  app.get('/v1/stores/:storeId/support/tickets/:ticketId/messages',async req=>{
    const {storeId,ticketId}=validated(staffTicket,req.params);
    await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
    return messages(storeId,ticketId);
  });
  app.post('/v1/stores/:storeId/support/tickets/:ticketId/messages',
    {config:{rateLimit:{max:50,timeWindow:'1 minute'}}},async req=>{
      const {storeId,ticketId}=validated(staffTicket,req.params);
      const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
      return addMessage(storeId,ticketId,identity.userId,validated(supportMessageInput,req.body).body);
    });
  app.patch('/v1/stores/:storeId/support/tickets/:ticketId/status',async req=>{
    const {storeId,ticketId}=validated(staffTicket,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
    return changeStatus(storeId,ticketId,validated(supportStateInput,req.body).status,identity.userId);
  });
  app.get('/v1/stores/:storeId/support/events',async(req,reply)=>{
    const {storeId}=validated(staffParams,req.params);
    await requireStoreRole(req,storeId,['OWNER','MANAGER','STAFF']);
    subscribe(req,reply,`store:${storeId}`);
  });
}
