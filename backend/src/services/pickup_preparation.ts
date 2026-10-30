export type PickupPreparation = 'NONE' | 'PREPARING' | 'READY';
export function canPrepareUnpaidPickup(order: {
  status: string; fulfillment: string; offlineMethod?: string;
  provider: string; paymentStatus: string; expiresAt: Date | null;
}, now = Date.now()): boolean {
  return order.status === 'PENDING_PAYMENT' && order.fulfillment === 'PICKUP' &&
    order.offlineMethod === 'PAY_ON_PICKUP' && order.provider === 'offline' &&
    order.paymentStatus === 'PENDING' && order.expiresAt !== null && order.expiresAt.getTime() > now;
}
export function canChangePickupPreparation(from: PickupPreparation, to: Exclude<PickupPreparation, 'NONE'>): boolean {
  return from === to || (from === 'NONE' && to === 'PREPARING') || (from === 'PREPARING' && to === 'READY');
}
export function statusAfterOfflineConfirmation(preparation: string | undefined): string {
  return preparation === 'READY' ? 'SHIPPED' : preparation === 'PREPARING' ? 'PREPARING' : 'PAID';
}
