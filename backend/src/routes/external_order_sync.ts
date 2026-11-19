import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { uuidParam, validated } from '../security/validation.js';
import { hashValue, requireIntegration } from '../integrations/core.js';
import { assertFulfillmentTransition, externalOrderUpdate } from '../services/external_order_sync.js';

const params = z.object({ orderId: uuidParam }).strict();

type OrderRow = {
  id:string; status:string; is_demo:boolean; fulfillment_method:string; shipping_service_id:string|null;
};
type LinkRow = {external_order_id:string;source_version:string;external_status:string;invoice:unknown};

function sqlConflict(e:unknown):never {
  if ((e as {code?:string})?.code==='23505')
    throw new ApiError(409,'Evento, ID externo ou chave fiscal ja associado a outro pedido desta integracao.');
  if (['23503','23514'].includes((e as {code?:string})?.code??''))
    throw new ApiError(409,'Relacao de pedido ou documento fiscal invalida.');
  throw e;
}

export async function externalOrderSyncRoutes(app:FastifyInstance):Promise<void> {
  app.get('/v1/external/orders/:orderId/sync', async req=>{
    const identity=await requireIntegration(req,'orders.read');
    const {orderId}=validated(params,req.params);
    const exists=await pool.query(`SELECT status,is_demo AS "isDemo" FROM orders WHERE store_id=$1 AND id=$2`,
      [identity.storeId,orderId]);
    if(!exists.rowCount)throw new ApiError(404,'Pedido nao encontrado nesta loja.');
    const result=await pool.query(`SELECT external_order_id AS "externalOrderId",
      source_version::text AS "sourceVersion",external_status AS "externalStatus",
      invoice,updated_at AS "updatedAt" FROM external_order_links
      WHERE integration_id=$1 AND store_id=$2 AND order_id=$3`,[identity.id,identity.storeId,orderId]);
    const fiscal=await pool.query(`SELECT document FROM external_order_fiscal_documents
      WHERE integration_id=$1 AND store_id=$2 AND order_id=$3 ORDER BY created_at,access_key`,
    [identity.id,identity.storeId,orderId]);
    return { orderId,orderStatus:exists.rows[0].status,isDemo:exists.rows[0].isDemo,
      sync:result.rows[0]??null,documents:fiscal.rows.map((r:{document:unknown})=>r.document) };
  });

  // Snapshot enviado pelo ERP: vincula numero externo, versao e referencias fiscais.
  // Apenas transicoes logisticas autorizadas podem alterar o status do pedido.
  app.post('/v1/external/orders/:orderId/sync', async req=>{
    const identity=await requireIntegration(req,'orders.write');
    const {orderId}=validated(params,req.params);
    const input=validated(externalOrderUpdate,req.body);
    const hash=hashValue(JSON.stringify({orderId,...input}));
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      // Impede revogacao simultanea; inclui verificacao da autoridade apos a leitura inicial do token.
      const access=await client.query(`SELECT 1 FROM external_integrations
        WHERE id=$1 AND store_id=$2 AND revoked_at IS NULL AND order_authority FOR SHARE`,
      [identity.id,identity.storeId]);
      if(!access.rowCount)throw new ApiError(403,'Integracao sem autoridade para atualizar pedidos.');
      // Lock por pedido serializa versoes e reenvios simultaneos.
      const order=await client.query<OrderRow>(`SELECT id,status,is_demo,fulfillment_method,shipping_service_id FROM orders
        WHERE id=$1 AND store_id=$2 FOR UPDATE`,[orderId,identity.storeId]);
      if(!order.rowCount)throw new ApiError(404,'Pedido nao encontrado nesta loja.');
      if(order.rows[0].is_demo)throw new ApiError(409,'Pedidos demonstrativos nao podem ser conciliados com ERP/PDV.');
      const operation=await client.query<{payload_hash:string;order_id:string}>(`
        SELECT payload_hash,order_id FROM external_order_operations WHERE integration_id=$1 AND event_id=$2`,
      [identity.id,input.eventId]);
      if(operation.rowCount){
        if(operation.rows[0].payload_hash!==hash || operation.rows[0].order_id!==orderId)
          throw new ApiError(409,'eventId reutilizado com conteudo diferente.');
        await client.query('COMMIT');
        return {orderId,externalOrderId:input.externalOrderId,sourceVersion:input.sourceVersion,idempotent:true,
          note:'Evento ja processado; consulte GET /v1/external/orders/:orderId/sync para o estado atual.'};
      }
      const prior=await client.query<LinkRow>(`SELECT external_order_id,source_version::text,external_status,invoice
        FROM external_order_links WHERE integration_id=$1 AND store_id=$2 AND order_id=$3`,
      [identity.id,identity.storeId,orderId]);
      if(prior.rowCount){
        if(prior.rows[0].external_order_id!==input.externalOrderId)
          throw new ApiError(409,'Pedido ja vinculado a outro ID externo; reconciliacao manual necessaria.');
        if(BigInt(input.sourceVersion)<=BigInt(prior.rows[0].source_version))
          throw new ApiError(409,'Versao de pedido antiga ou repetida. Use sourceVersion maior.');
      }
      let changed=false;
      if(input.fulfillmentStatus){
        changed=assertFulfillmentTransition(order.rows[0].status,input.fulfillmentStatus,
          order.rows[0].fulfillment_method,order.rows[0].shipping_service_id);
        if(changed){
          const block=await client.query(`SELECT 1 FROM after_sales_requests WHERE order_id=$1 AND store_id=$2
            AND request_type IN ('CANCEL','RETURN','REFUND')
            AND status IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION')`,
          [orderId,identity.storeId]);
          if(block.rowCount)throw new ApiError(409,'Pedido com pos-venda em analise. Resolva antes de avancar.');
        }
      }
      if(input.invoice){
        const status=order.rows[0].status;
        if(input.invoice.status==='AUTHORIZED' && !['PAID','PREPARING','SHIPPED','DELIVERED'].includes(status))
          throw new ApiError(409,'Nao registrar nota autorizada de pedido ainda nao pago.');
      }
      // Triggers de order.changed enviam eventos aos OUTROS conectores, sem eco ao ERP atual.
      await client.query("SELECT set_config('f40.integration_id',$1,true)",[identity.id]);
      await client.query(`INSERT INTO external_order_links
        (integration_id,store_id,order_id,external_order_id,source_version,external_status,invoice)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
        ON CONFLICT(integration_id,order_id) DO UPDATE SET
        source_version=EXCLUDED.source_version,external_status=EXCLUDED.external_status,
        invoice=COALESCE(EXCLUDED.invoice,external_order_links.invoice),updated_at=now()`,
      [identity.id,identity.storeId,orderId,input.externalOrderId,input.sourceVersion,
        input.externalStatus,input.invoice?JSON.stringify(input.invoice):null]);
      if(input.invoice){
        const existing=await client.query<{order_id:string;document:unknown}>(`
          SELECT order_id,document FROM external_order_fiscal_documents
          WHERE integration_id=$1 AND access_key=$2 FOR UPDATE`,[identity.id,input.invoice.accessKey]);
        if(existing.rowCount && existing.rows[0].order_id!==orderId)
          throw new ApiError(409,'Chave fiscal ja vinculada a outro pedido.');
        if(existing.rowCount){
          const prev=existing.rows[0].document as {status:string};
          if(prev.status==='CANCELED' && input.invoice.status==='AUTHORIZED')
            throw new ApiError(409,'Documento cancelado nao pode voltar a autorizado.');
          const previous=prev as {model?:string;number?:string;series?:string;issuedAt?:string};
          if(previous.model!==input.invoice.model || previous.number!==input.invoice.number ||
            previous.series!==input.invoice.series || previous.issuedAt!==input.invoice.issuedAt)
            throw new ApiError(409,'Dados imutaveis da nota fiscal divergem do documento ja vinculado.');
        }
        await client.query(`INSERT INTO external_order_fiscal_documents
          (integration_id,store_id,order_id,access_key,document)
          VALUES($1,$2,$3,$4,$5::jsonb)
          ON CONFLICT(integration_id,access_key) DO UPDATE SET document=EXCLUDED.document,updated_at=now()`,
        [identity.id,identity.storeId,orderId,input.invoice.accessKey,JSON.stringify(input.invoice)]);
      }
      if(changed){
        await client.query(`UPDATE orders SET status=$3,updated_at=now() WHERE id=$1 AND store_id=$2`,
        [orderId,identity.storeId,input.fulfillmentStatus]);
        await client.query(`INSERT INTO order_events(order_id,store_id,status,notes)
          VALUES($1,$2,$3,$4)`,[orderId,identity.storeId,input.fulfillmentStatus,
            `Atualizado pelo ERP/PDV ${identity.provider}: ${input.notes??''}`.slice(0,300)]);
      }
      // Eventos de metadados fiscais/ERP nao precisam modificar a tabela financeira de pedidos.
      await client.query(`INSERT INTO external_change_events
        (store_id,event_type,resource_id,origin_integration_id)
        VALUES($1,'order.external.changed',$2,$3)`,[identity.storeId,orderId,identity.id]);
      await client.query(`INSERT INTO external_order_operations
        (integration_id,store_id,event_id,order_id,payload_hash,source_version)
        VALUES($1,$2,$3,$4,$5,$6)`,
      [identity.id,identity.storeId,input.eventId,orderId,hash,input.sourceVersion]);
      await client.query(`INSERT INTO audit_logs(store_id,event,entity_type,entity_id,metadata)
        VALUES($1,'EXTERNAL_ORDER_SYNCED','order',$2,$3::jsonb)`,
      [identity.storeId,orderId,JSON.stringify({integrationId:identity.id,eventId:input.eventId,
        sourceVersion:input.sourceVersion,externalStatus:input.externalStatus,fulfillmentChanged:changed,
        invoiceReferenced:!!input.invoice, invoiceStatus:input.invoice?.status??null, invoiceAccessKey:input.invoice?.accessKey??null})]);
      await client.query('COMMIT');
      return {orderId,externalOrderId:input.externalOrderId,sourceVersion:input.sourceVersion,
        externalStatus:input.externalStatus,fulfillmentChanged:changed,idempotent:false};
    }catch(e){await client.query('ROLLBACK');return sqlConflict(e);}
    finally{client.release();}
  });
}
