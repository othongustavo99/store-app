import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { ApiError } from '../security/errors.js';
import { requireStoreRole } from '../security/identity.js';
import { slugField, uuidParam, validated } from '../security/validation.js';
import { publicProfile, storeProfileInput } from '../services/store_profile.js';

const publicParams = z.object({slug: slugField}).strict();
const privateParams = z.object({storeId: uuidParam}).strict();

const profileQuery = `SELECT p.* FROM store_profiles p WHERE p.store_id=$1`;
async function readProfile(storeId: string): Promise<{ [key: string]: unknown }> {
  const result = await pool.query<Record<string, unknown>>(profileQuery, [storeId]);
  return result.rows[0] ?? { version: 1 };
}

export async function storeProfileRoutes(app: FastifyInstance): Promise<void> {
  // Consulta pública: expõe somente campos destinados à vitrine.
  app.get('/v1/shops/:slug/profile', async req => {
    const {slug} = validated(publicParams, req.params);
    const store = await pool.query<{id: string;name: string;slug: string}>(
      "SELECT id,name,slug FROM stores WHERE slug=$1 AND status='ACTIVE'", [slug]);
    if (!store.rowCount) throw new ApiError(404, 'Loja não encontrada.');
    const row = await readProfile(store.rows[0].id);
    return {store: store.rows[0], profile: {...publicProfile(row),
      displayName: row.display_name ?? store.rows[0].name}};
  });

  app.get('/v1/stores/:storeId/profile', async req => {
    const {storeId} = validated(privateParams, req.params);
    const {role} = await requireStoreRole(req, storeId, ['OWNER','MANAGER','STAFF']);
    const store = await pool.query<{id: string;name: string;slug: string}>(
      "SELECT id,name,slug FROM stores WHERE id=$1 AND status='ACTIVE'", [storeId]);
    const row = await readProfile(storeId);
    return {store: store.rows[0], profile: {
      ...publicProfile(row), displayName: row.display_name ?? store.rows[0].name,
      version: Number(row.version ?? 1),
    }, myRole: role};
  });

  app.put('/v1/stores/:storeId/profile', async req => {
    const {storeId} = validated(privateParams, req.params);
    const {identity} = await requireStoreRole(req, storeId, ['OWNER','MANAGER']);
    const data = validated(storeProfileInput, req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa mudanças na MESMA loja, mas permite atualizações paralelas entre lojas.
      const locked = await client.query("SELECT id FROM stores WHERE id=$1 AND status='ACTIVE' FOR UPDATE", [storeId]);
      if (!locked.rowCount) throw new ApiError(404, 'Loja não encontrada.');
      await client.query('INSERT INTO store_profiles(store_id) VALUES($1) ON CONFLICT DO NOTHING', [storeId]);
      const changed = await client.query(`UPDATE store_profiles SET
        display_name=$3, tagline=$4, description=$5, logo_url=$6, banner_url=$7, primary_color=$8, secondary_color=$16, offline_methods=$17,
        support_email=$9, support_phone=$10, instagram_url=$11, privacy_url=$12,
        terms_url=$13, returns_url=$14, version=version+1, updated_by=$15, updated_at=now()
        WHERE store_id=$1 AND version=$2 RETURNING version`,
        [storeId, data.expectedVersion, data.displayName, data.tagline, data.description, data.logoUrl,
          data.bannerUrl, data.primaryColor, data.supportEmail, data.supportPhone,
          data.instagramUrl, data.privacyUrl, data.termsUrl, data.returnsUrl, identity.userId, data.secondaryColor, data.offlineMethods]);
      if (!changed.rowCount) throw new ApiError(409, 'A vitrine foi alterada em outro dispositivo. Atualize antes de salvar.');
      await client.query(`INSERT INTO audit_logs(store_id,actor_id,event,entity_type,entity_id,metadata)
        VALUES($1,$2,'STORE_PROFILE_UPDATED','store',$1,$3::jsonb)`,
        [storeId, identity.userId, JSON.stringify({newVersion: changed.rows[0].version})]);
      // Apenas a loja modificada recebe o evento (não inclui perfil privado).
      await client.query("SELECT pg_notify('loja_catalog_changed', $1)", [storeId]);
      await client.query('COMMIT');
      return {ok: true, version: changed.rows[0].version};
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });

  app.get('/v1/stores/:storeId/readiness', async req => {
    const {storeId} = validated(privateParams, req.params);
    await requireStoreRole(req, storeId, ['OWNER','MANAGER']);
    const result = await pool.query<{
      published_products: number; variants_missing_parcel: number;
      member_count: number; origin_count: number;
    }>(`SELECT
      (SELECT count(*)::int FROM products p WHERE p.store_id=$1 AND p.status='PUBLISHED') AS published_products,
      (SELECT count(*)::int FROM product_variants v
        JOIN products p ON p.id=v.product_id AND p.store_id=v.store_id
        LEFT JOIN shipping_variant_parcels sp ON sp.variant_id=v.id AND sp.store_id=v.store_id
        WHERE v.store_id=$1 AND v.status='ACTIVE' AND p.status='PUBLISHED'
          AND (sp.variant_id IS NULL)) AS variants_missing_parcel,
      (SELECT count(*)::int FROM store_memberships sm WHERE sm.store_id=$1) AS member_count,
      (SELECT count(*)::int FROM store_shipping_settings ss WHERE ss.store_id=$1) AS origin_count`, [storeId]);
    const r = result.rows[0];
    const profile = publicProfile(await readProfile(storeId));
    const shippingPilot = !!config.SHIPPING_MELHOR_ENVIO_TOKEN &&
      config.SHIPPING_PILOT_STORE_ID === storeId && !!config.SHIPPING_USER_AGENT;
    const paymentPilot = !!config.MERCADOPAGO_ACCESS_TOKEN &&
      config.PAYMENT_PILOT_STORE_ID === storeId;
    return {
      publishedProducts: r.published_products,
      members: r.member_count,
      missingParcels: r.variants_missing_parcel,
      checks: {
        identity: Boolean(profile.logoUrl && profile.supportEmail),
        legal: Boolean(profile.privacyUrl && profile.termsUrl && profile.returnsUrl),
        catalog: r.published_products > 0,
        shippingOrigin: r.origin_count > 0,
        shippingDimensions: r.published_products > 0 && r.variants_missing_parcel === 0,
        shippingPilotConnected: shippingPilot,
        paymentPilotCredentialsPresent: paymentPilot,
        // Independente de tokens globais: onboarding de pagamento por lojista NÃO existe ainda.
        merchantPaymentsReady: false,
      },
      limitations: [
        'Cada lojista ainda precisa de sua integração financeira própria antes de receber pagamentos.',
        'Frete por transportadora exige autorização por estabelecimento; a integração atual atende à loja-piloto.',
        'Retirada na loja está disponível sem provedor de frete.',
        'Entrega local pode ser configurada por faixa de CEP no painel de frete, sem token de transportadora.',
      ],
    };
  });
}
