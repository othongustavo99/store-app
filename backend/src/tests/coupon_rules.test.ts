import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCoupon, type Coupon } from '../services/coupon_rules.js';
const c:Coupon={id:'a',code:'PROMO10',discount_type:'PERCENT',amount:1000,minimum_subtotal_cents:'1000',max_uses:10,used_count:0,max_uses_per_user:1,starts_at:null,expires_at:null,active:true};
test('cupom de porcentagem com aritmética inteira',()=> assert.equal(calculateCoupon(c,3999n,0),399n));
test('desconto fixo nunca zera pedido',()=>assert.equal(calculateCoupon({...c,discount_type:'FIXED',amount:100000},2000n,0),1999n));
test('impede limites, vencimento e subtotal mínimo',()=>{
 for(const overrides of [{used_count:10},{active:false},{expires_at:new Date('2020-01-01')},{minimum_subtotal_cents:'9999'}])
   assert.throws(()=>calculateCoupon({...c,...overrides},2000n,0));
 assert.throws(()=>calculateCoupon(c,2000n,1));
});
