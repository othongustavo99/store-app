import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ShippingService } from './shipping_rules.js';

const postal = z.string().regex(/^\d{8}$/);
export const fulfillmentInput = z.object({
  pickupAddress: z.string().trim().max(500),
  pickupHours: z.string().trim().max(250),
  localEnabled: z.boolean(),
  localFeeCents: z.number().int().min(0).max(100000),
  localEstimate: z.string().trim().max(150),
  localPostalRanges: z.array(z.object({ start: postal, end: postal }).strict()
    .refine(r => r.start <= r.end, 'Faixa de CEP invertida.')).max(30),
}).strict().superRefine((value, ctx) => {
  if (value.localEnabled && (!value.localPostalRanges.length || !value.localEstimate))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe área atendida e prazo da entrega local.' });
});
export type FulfillmentSettings = z.infer<typeof fulfillmentInput>;
export function fulfillmentSettings(row: Record<string, unknown> = {}): FulfillmentSettings {
  return {
    pickupAddress: String(row.pickup_address ?? ''), pickupHours: String(row.pickup_hours ?? ''),
    localEnabled: row.local_enabled === true, localFeeCents: Number(row.local_fee_cents ?? 0),
    localEstimate: String(row.local_estimate ?? ''),
    localPostalRanges: (row.local_postal_ranges ?? []) as FulfillmentSettings['localPostalRanges'],
  };
}
export function localRate(settings: FulfillmentSettings, destination: string): ShippingService | null {
  if (!settings.localEnabled || !/^\d{8}$/.test(destination) ||
      !settings.localPostalRanges.some(r => destination >= r.start && destination <= r.end)) return null;
  return { id: '0', carrier: 'Entrega local', name: settings.localEstimate,
    priceCents: settings.localFeeCents, deliveryDays: 0 };
}
export function localFingerprint(settings: FulfillmentSettings, destination: string,
  items: { variantId: string; quantity: number; unitCents: string }[]): string {
  const lines = items.map(i => [i.variantId, i.quantity, i.unitCents])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash('sha256').update(JSON.stringify([
    'LOCAL', destination, settings.localEnabled, settings.localFeeCents,
    settings.localEstimate, settings.localPostalRanges, lines,
  ])).digest('hex');
}
