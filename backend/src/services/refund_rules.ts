/** Reembolsos integrais: valores de gateway em BRL são convertidos apenas depois de validação. */
export function toCents(value:unknown):number|null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value==='string' && !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const number=Number(value);
  if (!Number.isFinite(number) || number<=0 || number>100_000_000) return null;
  const cents=Math.round(number*100);
  if (!Number.isSafeInteger(cents) || Math.abs(number*100-cents)>0.00001) return null;
  return cents;
}
export function eligibleForFullRefund(orderStatus:string,paymentStatus:string,caseStatus:string,
    caseType:string,amount:number,paidAt:unknown):boolean {
  return ['PAID','PREPARING','SHIPPED','DELIVERED'].includes(orderStatus)
    && paymentStatus==='APPROVED' && caseStatus==='MANUAL_ACTION'
    && ['CANCEL','RETURN','REFUND'].includes(caseType)
    && Number.isSafeInteger(amount) && amount>0 && !!paidAt;
}
export function matchingApprovedRefund(refunds:unknown,paymentId:string,expectedId:string|null,amountCents:number):string|null {
  if (!Array.isArray(refunds)) return null;
  const matches=refunds.filter((refund)=>refund && typeof refund==='object' &&
    String(refund.payment_id)===paymentId && refund.status==='approved' &&
    toCents(refund.amount)===amountCents && refund.id != null);
  if (expectedId === null) return null; // Nunca conciliar por valor apenas.
  if (matches.length!==1 || String(matches[0].id)!==expectedId) return null;
  return expectedId;
}
