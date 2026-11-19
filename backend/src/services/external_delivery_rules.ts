import { randomBytes } from 'node:crypto';
import { ApiError } from '../security/errors.js';
import type { IntegrationIdentity } from '../integrations/core.js';

export const MAX_DELIVERY_ATTEMPTS = 8;
export const DELIVERY_LEASE_SECONDS = 300;
export const MAX_CLAIM_BATCH = 30;

export function assertLeasedDelivery(identity: IntegrationIdentity): void {
  if (identity.deliveryMode !== 'LEASED') {
    throw new ApiError(409, 'Integracao em modo legado. Habilite a entrega por lease na administracao.');
  }
}

// Tempo cresce em tentativas subsequentes: 5, 10, 20... ate 15 min.
export function retryDelaySeconds(attempts: number): number {
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new Error('Tentativa invalida.');
  return Math.min(900, 5 * 2 ** Math.min(attempts - 1, 8));
}

export function leaseSecret(): string {
  return `f40l_${randomBytes(32).toString('base64url')}`;
}
