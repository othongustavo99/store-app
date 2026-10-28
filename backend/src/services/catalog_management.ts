import { createHash } from 'node:crypto';
import { z } from 'zod';

export const skuSchema = z.string().trim().min(2).max(90).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'SKU: use letras, números, ponto, hífen ou underline.');
export const httpsUrl = z.string().url().max(2048).refine(v => v.startsWith('https://'), 'A mídia deve usar HTTPS.');
const status = z.enum(['DRAFT','PUBLISHED','HIDDEN']);
export const variantInput = z.object({
  sku: skuSchema,
  color: z.string().trim().min(1).max(60),
  size: z.string().trim().min(1).max(50),
  imageUrl: httpsUrl.nullable().optional(),
  initialStock: z.number().int().min(0).max(1000000),
}).strict();
export const createProductInput = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(12000),
  categoryId: z.string().uuid(),
  priceCents: z.number().int().min(1).max(100000000),
  oldPriceCents: z.number().int().min(1).max(100000000).nullable().optional(),
  images: z.array(httpsUrl).max(20),
  videos: z.array(httpsUrl).max(5).default([]),
  isFeatured: z.boolean().default(false),
  isNew: z.boolean().default(false),
  status: status.default('DRAFT'),
  variants: z.array(variantInput).min(1).max(120),
}).strict().superRefine((v, ctx) => {
  if (v.status === 'PUBLISHED' && v.images.length === 0) ctx.addIssue({ code:'custom', path:['images'],message:'Adicione uma foto antes de publicar.' });
  if (v.oldPriceCents !== undefined && v.oldPriceCents !== null && v.oldPriceCents <= v.priceCents) ctx.addIssue({ code:'custom',path:['oldPriceCents'],message:'O preço anterior deve ser maior que o atual.' });
  const skus = new Set<string>();
  const sizes = new Set<string>();
  v.variants.forEach((variant, i) => {
    const sku = variant.sku.toUpperCase();
    const key = `${variant.color.toLowerCase()}|${variant.size.toLowerCase()}`;
    if (skus.has(sku)) ctx.addIssue({code:'custom',path:['variants',i,'sku'],message:'SKU repetido.'});
    if (sizes.has(key)) ctx.addIssue({code:'custom',path:['variants',i],message:'Cor e tamanho repetidos.'});
    skus.add(sku); sizes.add(key);
  });
});
// O PATCH altera APENAS metadados. Estoque nunca é aceito nesta rota.
export const productMetadataInput = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(12000),
  categoryId: z.string().uuid(),
  priceCents: z.number().int().min(1).max(100000000),
  oldPriceCents: z.number().int().min(1).max(100000000).nullable(),
  images: z.array(httpsUrl).max(20),
  videos: z.array(httpsUrl).max(5),
  isFeatured: z.boolean(), isNew: z.boolean(), status,
}).strict().superRefine((v, ctx) => {
  if (v.status === 'PUBLISHED' && v.images.length === 0) ctx.addIssue({code:'custom',path:['images'],message:'Adicione uma foto antes de publicar.'});
  if (v.oldPriceCents !== null && v.oldPriceCents <= v.priceCents) ctx.addIssue({code:'custom',path:['oldPriceCents'],message:'Preço anterior deve superar o atual.'});
});
export const editVariantInput = z.object({
  sku: skuSchema, color: z.string().trim().min(1).max(60),
  size: z.string().trim().min(1).max(50),
  imageUrl: httpsUrl.nullable(), status: z.enum(['ACTIVE','INACTIVE']),
}).strict();
export function signCloudinaryUpload(secret: string, folder: string, timestamp: number): string {
  // Assinar exatamente os campos enviados pelo cliente, em ordem alfabética.
  return createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest('hex');
}
