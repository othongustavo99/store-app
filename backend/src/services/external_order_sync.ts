import { z } from 'zod';
import { ApiError } from '../security/errors.js';

export function validNfeAccessKey(value: string): boolean {
  if (!/^\d{44}$/.test(value)) return false;
  let sum = 0; let weight = 2;
  for (let i=42;i>=0;i--) { sum += Number(value[i]) * weight; weight = weight===9?2:weight+1; }
  const rest=sum % 11;
  const check = rest===0 || rest===1 ? 0 : 11-rest;
  return Number(value[43])===check;
}

export const fiscalDocument = z.object({
  model: z.enum(['55','65']),
  accessKey: z.string().regex(/^\d{44}$/).refine(validNfeAccessKey,'Chave de acesso com digito verificador invalido.'),
  number: z.string().regex(/^[0-9]{1,9}$/),
  series: z.string().regex(/^[0-9]{1,3}$/),
  issuedAt: z.string().datetime({offset:true}),
  status: z.enum(['AUTHORIZED','CANCELED']),
}).strict().superRefine((item,ctx)=>{
  if(item.accessKey.slice(20,22)!==item.model ||
    item.accessKey.slice(22,25)!==item.series.padStart(3,'0') ||
    item.accessKey.slice(25,34)!==item.number.padStart(9,'0'))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:'Modelo, serie ou numero nao corresponde a chave de acesso.',path:['accessKey']});
});

export const externalOrderUpdate = z.object({
  eventId: z.string().uuid(),
  sourceVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  externalOrderId: z.string().trim().min(1).max(180),
  externalStatus: z.enum(['RECEIVED','ACCEPTED','PROCESSING','INVOICED','DISPATCHED','DELIVERED','CANCELED','ERROR']),
  // Apenas proxima transicao valida. Nunca altera pagamento, cancelamento ou reembolso.
  fulfillmentStatus: z.enum(['PREPARING','SHIPPED','DELIVERED']).optional(),
  notes: z.string().trim().max(300).optional(),
  invoice: fiscalDocument.optional(),
}).strict();

export type ExternalOrderUpdate = z.infer<typeof externalOrderUpdate>;

export function assertFulfillmentTransition(current: string, target: 'PREPARING'|'SHIPPED'|'DELIVERED',
  fulfillment: string, shippingServiceId: string|null): boolean {
  if (current===target) return false;
  const next:Record<string,string>={PAID:'PREPARING',PREPARING:'SHIPPED',SHIPPED:'DELIVERED'};
  if (next[current]!==target) throw new ApiError(409,'Transicao de pedido invalida ou pagamento nao confirmado.');
  if ((target==='SHIPPED' || target==='DELIVERED') && fulfillment==='DELIVERY' && shippingServiceId!=='0')
    throw new ApiError(409,'Entrega por transportadora exige a area de expedicao/rastreamento; alteracao recusada.');
  return true;
}
