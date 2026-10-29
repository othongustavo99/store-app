import { ApiError } from '../security/errors.js';

export type Coupon = { id:string; code:string; discount_type:'PERCENT'|'FIXED'; amount:number;
 minimum_subtotal_cents:string; max_uses:number|null; used_count:number; max_uses_per_user:number;
 starts_at:Date|null; expires_at:Date|null; active:boolean };
export function calculateCoupon(c:Coupon, subtotal:bigint, userUses:number, at=new Date()):bigint {
 if (!c.active || (c.starts_at && c.starts_at>at) || (c.expires_at && c.expires_at<=at))
   throw new ApiError(409,'Cupom inativo ou fora do período de validade.');
 if (subtotal<BigInt(c.minimum_subtotal_cents)) throw new ApiError(409,'Valor mínimo do cupom não atingido.');
 if (c.max_uses!==null && c.used_count>=c.max_uses) throw new ApiError(409,'Cupom esgotado.');
 if (userUses>=c.max_uses_per_user) throw new ApiError(409,'Você já atingiu o limite deste cupom.');
 const raw=c.discount_type==='PERCENT' ? subtotal*BigInt(c.amount)/10000n : BigInt(c.amount);
 // Um pedido não pode ter total negativo ou zerado (gateways e relatórios).
 const discount=raw<subtotal ? raw : subtotal-1n;
 if(discount<=0n) throw new ApiError(409,'Cupom não aplicável a este pedido.');
 return discount;
}
export function cleanCode(raw:string):string {return raw.trim().toUpperCase();}
