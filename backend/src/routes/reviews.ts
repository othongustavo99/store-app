import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireIdentity } from '../security/identity.js';
import { validated } from '../security/validation.js';

const params = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,48}$/), productId: z.string().uuid() });
const reviewInput = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().min(5).max(1200) }).strict();

export async function reviewRoutes(app: FastifyInstance) {
  async function findStore(slug: string, productId: string) {
    const data = await pool.query<{ store_id: string }>(`SELECT p.store_id FROM products p
      JOIN stores s ON s.id=p.store_id WHERE s.slug=$1 AND s.status='ACTIVE'
      AND p.id=$2 AND p.status='PUBLISHED'`, [slug, productId]);
    if (!data.rowCount) throw new ApiError(404,'Produto não encontrado.');
    return data.rows[0].store_id;
  }
  app.get('/v1/shops/:slug/catalog/products/:productId/reviews', async req => {
    const { slug, productId } = validated(params, req.params);
    const storeId = await findStore(slug, productId);
    const result = await pool.query(`SELECT r.id, r.product_id AS "productId", r.user_id AS "userId",
      u.display_name AS "userName", r.rating, r.comment, r.created_at AS "createdAt"
      FROM product_reviews r JOIN users u ON u.id=r.user_id
      WHERE r.store_id=$1 AND r.product_id=$2 ORDER BY r.created_at DESC LIMIT 100`, [storeId,productId]);
    return { reviews: result.rows };
  });
  app.post('/v1/shops/:slug/catalog/products/:productId/reviews',
    {config:{rateLimit:{max:8,timeWindow:'1 minute'}}}, async (req, reply) => {
      const { slug, productId } = validated(params, req.params);
      const { userId } = await requireIdentity(req);
      const { rating, comment } = validated(reviewInput, req.body);
      const storeId = await findStore(slug, productId);
      // Avaliação só é aceita quando o usuário realmente comprou este produto
      // e o pedido já chegou a uma etapa confirmada pela loja.
      const eligible = await pool.query(`SELECT 1 FROM orders o
        JOIN order_items oi ON oi.order_id=o.id AND oi.store_id=o.store_id
        WHERE o.store_id=$1 AND o.customer_id=$2 AND oi.product_id=$3
          AND o.status IN ('PAID','PREPARING','SHIPPED','DELIVERED') LIMIT 1`,
        [storeId,userId,productId]);
      if (!eligible.rowCount) throw new ApiError(403, 'Você pode avaliar após uma compra confirmada deste produto.');
      const saved = await pool.query(`INSERT INTO product_reviews(store_id,product_id,user_id,rating,comment)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT (store_id,product_id,user_id)
        DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment,updated_at=now()
        RETURNING id`, [storeId,productId,userId,rating,comment]);
      return reply.code(201).send({ id:saved.rows[0].id });
    });
}
