import { z } from 'zod';

const optionalUrl = z.union([
  z.literal(''),
  z.string().trim().url().max(2048).refine(value => value.startsWith('https://'), 'Use endereço HTTPS.'),
]).transform(v => v || null);
const optionalEmail = z.union([z.literal(''), z.string().trim().email().max(254)])
  .transform(v => v ? v.toLowerCase() : null);
const optionalPhone = z.union([z.literal(''), z.string().regex(/^\d{10,15}$/)])
  .transform(v => v || null);

// O formulário envia o perfil inteiro. Rejeitar campos extras impede alteração
// acidental de store_id, permissões ou de estados de pagamento pelo cliente.
export const storeProfileInput = z.object({
  expectedVersion: z.number().int().min(1),
  displayName: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(140),
  description: z.string().trim().max(1200),
  logoUrl: optionalUrl,
  bannerUrl: optionalUrl,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(v => v.toUpperCase()),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#E94560').transform(v => v.toUpperCase()),
  offlineMethods: z.array(z.enum(['PAY_ON_PICKUP','MANUAL_PIX','WHATSAPP'])).max(3).default([]),
  supportEmail: optionalEmail,
  supportPhone: optionalPhone,
  instagramUrl: optionalUrl,
  privacyUrl: optionalUrl,
  termsUrl: optionalUrl,
  returnsUrl: optionalUrl,
}).strict();

export type StoreProfileInput = z.infer<typeof storeProfileInput>;
export function publicProfile(row: Record<string, unknown> | undefined) {
  return {
    displayName: row?.display_name ?? null,
    tagline: row?.tagline ?? '', description: row?.description ?? '',
    logoUrl: row?.logo_url ?? null, bannerUrl: row?.banner_url ?? null,
    primaryColor: row?.primary_color ?? '#1C1B2F',
    secondaryColor: row?.secondary_color ?? '#E94560',
    offlineMethods: row?.offline_methods ?? [],
    supportEmail: row?.support_email ?? null, supportPhone: row?.support_phone ?? null,
    instagramUrl: row?.instagram_url ?? null,
    privacyUrl: row?.privacy_url ?? null, termsUrl: row?.terms_url ?? null,
    returnsUrl: row?.returns_url ?? null,
  };
}
