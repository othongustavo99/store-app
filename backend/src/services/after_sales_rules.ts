export type RequestType = 'CANCEL' | 'RETURN' | 'REFUND';
export type CaseStatus = 'OPEN' | 'IN_REVIEW' | 'WAITING_CUSTOMER' | 'MANUAL_ACTION' | 'REJECTED' | 'CLOSED';

/** A solicitação é uma triagem; NÃO executa cancelamento financeiro nem estorno. */
export function allowedRequestTypes(orderStatus: string): RequestType[] {
  switch (orderStatus) {
    case 'PENDING_PAYMENT': return ['CANCEL'];
    case 'PAID':
    case 'PREPARING':
    case 'SHIPPED': return ['CANCEL', 'REFUND'];
    case 'DELIVERED': return ['RETURN', 'REFUND'];
    case 'PAYMENT_REVIEW': return ['REFUND'];
    default: return [];
  }
}
export function permittedTransition(from:CaseStatus,to:CaseStatus): boolean {
  if (from === to) return true;
  const transitions:Record<CaseStatus,CaseStatus[]> = {
    OPEN:['IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION','REJECTED'],
    IN_REVIEW:['WAITING_CUSTOMER','MANUAL_ACTION','REJECTED','CLOSED'],
    WAITING_CUSTOMER:['IN_REVIEW','MANUAL_ACTION','REJECTED'],
    MANUAL_ACTION:['IN_REVIEW','REJECTED','CLOSED'],
    REJECTED:[],CLOSED:[],
  };
  return transitions[from].includes(to);
}
export function needsResolutionNote(status:CaseStatus):boolean {
  return status==='REJECTED' || status==='CLOSED';
}
