import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {pool} from '../db/pool.js';
import {config} from '../config.js';
import {ApiError} from '../security/errors.js';
import {requireStoreRole} from '../security/identity.js';
import {uuidParam,validated} from '../security/validation.js';
import {commercialPlanInput,commercialPlanView,type CommercialRow,type CommercialPlanInput} from '../services/store_commercial_rollout.js';

const params=z.object({storeId:uuidParam}).strict();
const findSql=`SELECT payment_provider,payment_stage,payment_environment,refund_stage,
  carrier_provider,carrier_stage,carrier_environment,revision,updated_at
  FROM store_commercial_rollouts WHERE store_id=$1`;
function legacy(storeId:string){
  const paymentPilot=config.ENABLE_REAL_PAYMENTS && config.PAYMENT_PILOT_STORE_ID===storeId &&
    !!config.MERCADOPAGO_ACCESS_TOKEN && !!config.MERCADOPAGO_WEBHOOK_SECRET && !!config.PUBLIC_BASE_URL;
  const carrierPilot=config.SHIPPING_PILOT_STORE_ID===storeId && !!config.SHIPPING_MELHOR_ENVIO_TOKEN &&
    !!config.SHIPPING_USER_AGENT && !config.SHIPPING_MELHOR_ENVIO_SANDBOX;
  return {paymentPilot,carrierPilot,refundPilot:paymentPilot&&config.ENABLE_REFUNDS};
}

export async function storeCommercialRolloutRoutes(app:FastifyInstance){
  app.get('/v1/stores/:storeId/commercial/rollout',async req=>{
    const {storeId}=validated(params,req.params);
    const {role}=await requireStoreRole(req,storeId,['OWNER','MANAGER']);
    const result=await pool.query<CommercialRow>(findSql,[storeId]);
    return {...commercialPlanView(result.rows[0],legacy(storeId)),myRole:role};
  });
  app.put('/v1/stores/:storeId/commercial/rollout',async req=>{
    const {storeId}=validated(params,req.params);
    const {identity}=await requireStoreRole(req,storeId,['OWNER']);
    const input:CommercialPlanInput=validated(commercialPlanInput,req.body);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      // Serializa atualizações da MESMA loja; outras lojas podem editar em paralelo.
      const store=await client.query("SELECT id FROM stores WHERE id=$1 AND status='ACTIVE' FOR UPDATE",[storeId]);
      if(!store.rowCount)throw new ApiError(404,'Loja não encontrada.');
      const before=await client.query<{revision:number}>(
        'SELECT revision FROM store_commercial_rollouts WHERE store_id=$1 FOR UPDATE',[storeId]);
      const current=Number(before.rows[0]?.revision??0);
      if(current!==input.expectedRevision)
        throw new ApiError(409,'Este planejamento foi alterado em outro dispositivo. Atualize a tela.');
      const args=[storeId,input.paymentProvider,input.paymentStage,input.paymentEnvironment,input.refundStage,
        input.carrierProvider,input.carrierStage,input.carrierEnvironment,identity.userId];
      let updated;
      if(current===0){
        updated=await client.query<CommercialRow>(`INSERT INTO store_commercial_rollouts(
          store_id,payment_provider,payment_stage,payment_environment,refund_stage,
          carrier_provider,carrier_stage,carrier_environment,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,args);
      } else {
        updated=await client.query<CommercialRow>(`UPDATE store_commercial_rollouts SET
          payment_provider=$2,payment_stage=$3,payment_environment=$4,refund_stage=$5,
          carrier_provider=$6,carrier_stage=$7,carrier_environment=$8,updated_by=$9,
          revision=revision+1,updated_at=now() WHERE store_id=$1 AND revision=$10 RETURNING *`,[...args,current]);
      }
      if(!updated.rowCount)throw new ApiError(409,'Planejamento alterado em outro dispositivo.');
      // A trilha registra somente enums e revisão; não armazena credenciais nem dados de compradores.
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
        VALUES($1,$2,'COMMERCIAL_PLAN_UPDATED','store',$1,$3::jsonb)`,
        [storeId,identity.userId,JSON.stringify({revision:current+1,
          paymentProvider:input.paymentProvider,carrierProvider:input.carrierProvider})]);
      await client.query('COMMIT');
      return commercialPlanView(updated.rows[0],legacy(storeId));
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  });
}
