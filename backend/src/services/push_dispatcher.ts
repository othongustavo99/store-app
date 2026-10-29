import type { FastifyInstance } from 'fastify';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { pool } from '../db/pool.js';
import { createHash } from 'node:crypto';

type EventRow={id:string;store_id:string;customer_id:string;order_id:string;status:string;attempts:number;slug:string};
// Credencial exclusiva do servidor. Nunca publicar JSON ou token FCM no APK.
function configure():boolean {
  const encoded=process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64;
  if(!encoded)return false;
  if(getApps().length)return true;
  const json=JSON.parse(Buffer.from(encoded,'base64').toString('utf8')) as {
    project_id:string;client_email:string;private_key:string };
  if(!json.project_id||!json.client_email||!json.private_key)throw new Error('Credencial FCM incompleta.');
  initializeApp({credential:cert({projectId:json.project_id,clientEmail:json.client_email,privateKey:json.private_key})});
  return true;
}
async function dispatchOne():Promise<boolean> {
  const client=await pool.connect();
  let attemptedId:string|null=null;
  try {
   await client.query('BEGIN');
   // SKIP LOCKED: evita envio duplicado entre réplicas Railway.
   const r=await client.query<EventRow>(`SELECT q.id::text,q.store_id,q.customer_id,q.order_id,q.status,q.attempts,s.slug
      FROM push_outbox q JOIN stores s ON s.id=q.store_id
      WHERE q.processed_at IS NULL AND q.next_attempt_at<=now()
      ORDER BY q.id LIMIT 1 FOR UPDATE OF q SKIP LOCKED`);
   if(!r.rowCount){await client.query('COMMIT');return false;}
   const e=r.rows[0];
   attemptedId=e.id;
   const tokens=await client.query<{token_hash:string;token:string}>(`SELECT token_hash,token FROM push_device_tokens
     WHERE store_id=$1 AND user_id=$2 AND enabled ORDER BY updated_at DESC LIMIT 20`,[e.store_id,e.customer_id]);
   if(tokens.rows.length>0){
    const title=e.status==='PAID'?'Pagamento confirmado':e.status==='SHIPPED'?'Pedido enviado':
      e.status==='DELIVERED'?'Pedido entregue':'Atualização do pedido';
    const result=await getMessaging().sendEachForMulticast({tokens:tokens.rows.map(t=>t.token),
      notification:{title,body:'Acompanhe seu pedido no aplicativo da loja.'},
      data:{type:'order',orderId:e.order_id,storeSlug:e.slug},
      android:{priority:'high'}});
    for(let i=0;i<result.responses.length;i++){
      const issue=result.responses[i].error;
      if(issue && ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(issue.code)){
        await client.query('DELETE FROM push_device_tokens WHERE token_hash=$1',[tokens.rows[i].token_hash]);
      }
    }
    if(result.failureCount===result.responses.length && result.responses.length>0){
      const retryable=result.responses.some(resp=>resp.error && !['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(resp.error.code));
      if(retryable)throw new Error('FCM sem entregas nesta tentativa.');
    }
   }
   await client.query('UPDATE push_outbox SET processed_at=now() WHERE id=$1',[e.id]);
   await client.query('COMMIT');return true;
  }catch(err){
   await client.query('ROLLBACK');
   // Não expor tokens ou IDs nos logs de falha.
   if(attemptedId)await pool.query(`UPDATE push_outbox SET attempts=attempts+1,
     next_attempt_at=now()+interval '1 minute' * LEAST(60,POWER(2,LEAST(6,attempts))::int),
     processed_at=CASE WHEN attempts>=7 THEN now() ELSE processed_at END
     WHERE id=$1`,[attemptedId]);
   throw err;
  }finally{client.release();}
}
export function startPushDispatcher(app:FastifyInstance) {
  let ready=false;
  try{ready=configure();}catch(e){app.log.error('FCM não configurado corretamente; notificações desativadas.');}
  if(!ready){app.log.info('FCM desativado: configurar FCM_SERVICE_ACCOUNT_JSON_BASE64.');return;}
  let closed=false,busy=false;
  const timer=setInterval(()=>{
    if(closed||busy)return;
    busy=true;
    void (async()=>{try{for(let i=0;i<10;i++)if(!await dispatchOne())break;}
      catch{app.log.warn('Push temporariamente indisponível; nova tentativa agendada.');}
      finally{busy=false;}})();
  },10000);
  app.addHook('onClose',async()=>{closed=true;clearInterval(timer);});
}
