import { createHmac, timingSafeEqual } from 'node:crypto';

/** A assinatura so valida a entrega; o status final vem sempre da API do provedor. */
export function verifyMercadoPagoSignature(
  signature: string | undefined, requestId: string | undefined, paymentId: string,
  secret: string, nowMs = Date.now(),
): boolean {
  if (!signature || !requestId || !secret || !/^\d+$/.test(paymentId)) return false;
  const parts = Object.fromEntries(signature.split(',').map(p => p.trim().split('=')));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !/^\d{10,13}$/.test(ts) || !v1 || !/^[a-fA-F0-9]{64}$/.test(v1)) return false;
  const epochMs = Number(ts) * (ts.length === 10 ? 1000 : 1);
  if (!Number.isFinite(epochMs) || Math.abs(nowMs - epochMs) > 10 * 60 * 1000) return false;
  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(v1, 'hex'));
}
