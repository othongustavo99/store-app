import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { profileForClient, type ClientConfiguration } from './client_configuration.js';

/** CLI administrativo: plano somente leitura por padrão. Cria, nunca converte ou sobrescreve loja existente. */
export async function provisionStore(pool:Pick<Pool,'connect'>,config:ClientConfiguration,apply=false) {
  const client=await pool.connect();
  try {
    await client.query(apply?'BEGIN':'BEGIN READ ONLY');
    if(apply)await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`provision:${config.store.slug}`]);
    const owner=await client.query<{id:string}>('SELECT id FROM users WHERE email=$1 AND status=$2',[config.store.ownerEmail,'ACTIVE']);
    if(!owner.rowCount)throw new Error('Cadastre primeiro a conta ativa do proprietário. Nenhuma senha é criada por este comando.');
    const found=await client.query<{id:string;name:string;is_demo:boolean;status:string}>(
      'SELECT id,name,is_demo,status FROM stores WHERE slug=$1',[config.store.slug]);
    if(found.rowCount){
      const existing=found.rows[0];
      if(existing.status!=='ACTIVE'||existing.is_demo!==(config.store.mode==='DEMO')||
        (config.store.id&&config.store.id!==existing.id))throw new Error('Loja existente não corresponde ao UUID/modo informado. Nenhuma conversão ou alteração foi feita.');
      const membership=await client.query('SELECT 1 FROM store_memberships WHERE store_id=$1 AND user_id=$2 AND role=$3',
        [existing.id,owner.rows[0].id,'OWNER']);
      if(!membership.rowCount)throw new Error('O proprietário informado não é dono desta loja. Nenhuma equipe foi alterada.');
      await client.query('ROLLBACK');
      return {action:'EXISTING_UNCHANGED',storeId:existing.id,slug:config.store.slug,applied:false,
        notice:'Loja já existe. Perfil, equipe, catálogo e pedidos foram preservados. Edite a marca pelo painel.'};
    }
    if(config.store.id)throw new Error('UUID informado não corresponde a uma loja existente. Remova store.id apenas para planejar uma loja nova.');
    if(!apply){await client.query('ROLLBACK');return {action:'CREATE_PLANNED',storeId:null,slug:config.store.slug,applied:false,
      notice:'Plano somente leitura. Use --apply para criar loja, perfil e vínculo do proprietário.'};}
    const id=randomUUID(),ownerId=owner.rows[0].id,p=profileForClient(config),f=config.fulfillment;
    await client.query('INSERT INTO stores(id,name,slug,is_demo) VALUES($1,$2,$3,$4)',[id,config.store.name,config.store.slug,config.store.mode==='DEMO']);
    await client.query('INSERT INTO store_memberships(store_id,user_id,role) VALUES($1,$2,$3)',[id,ownerId,'OWNER']);
    await client.query(`INSERT INTO store_profiles(store_id,display_name,tagline,description,logo_url,banner_url,
      primary_color,secondary_color,support_email,support_phone,instagram_url,privacy_url,terms_url,returns_url,offline_methods,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id,p.displayName,p.tagline,p.description,p.logoUrl,p.bannerUrl,p.primaryColor,p.secondaryColor,
        p.supportEmail,p.supportPhone,p.instagramUrl,p.privacyUrl,p.termsUrl,p.returnsUrl,p.offlineMethods,ownerId]);
    await client.query(`INSERT INTO store_fulfillment_settings(store_id,pickup_address,pickup_hours,local_enabled,
      local_fee_cents,local_estimate,local_postal_ranges,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [id,f.pickupAddress,f.pickupHours,f.localEnabled,f.localFeeCents,f.localEstimate,JSON.stringify(f.localPostalRanges),ownerId]);
    await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
      VALUES($1,$2,'STORE_PROVISIONED','store',$1,$3::jsonb)`,[id,ownerId,JSON.stringify({mode:config.store.mode,credentialsCreated:false})]);
    await client.query('COMMIT');
    return {action:'CREATED',storeId:id,slug:config.store.slug,applied:true,
      notice:'Loja criada sem catálogo ou pedidos. Pagamento online e credenciais externas não foram alterados.'};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
