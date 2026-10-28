import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { toCents, eligibleForFullRefund, matchingApprovedRefund } from '../services/refund_rules.js';

test('conversão financeira recusa valores inválidos e arredondamentos indevidos',()=>{
  assert.equal(toCents('18.99'),1899);
  assert.equal(toCents(18.99),1899);
  assert.equal(toCents('10.001'),null);
  assert.equal(toCents(-1),null);
  assert.equal(toCents('abc'),null);
});
test('reembolso somente aprovado com ticket em ação e pedido pago',()=>{
  assert.equal(eligibleForFullRefund('PAID','APPROVED','MANUAL_ACTION','REFUND',1000,new Date()),true);
  assert.equal(eligibleForFullRefund('PAID','REVIEW','MANUAL_ACTION','REFUND',1000,new Date()),false);
  assert.equal(eligibleForFullRefund('PENDING_PAYMENT','APPROVED','MANUAL_ACTION','REFUND',1000,new Date()),false);
  assert.equal(eligibleForFullRefund('PAID','APPROVED','OPEN','REFUND',1000,new Date()),false);
  assert.equal(eligibleForFullRefund('PAID','APPROVED','MANUAL_ACTION','REFUND',1000,null),false);
});
test('conciliação exige identificador exato, valor, status e pagamento',()=>{
  const r=[{id:12,payment_id:345,amount:90.75,status:'approved'}];
  assert.equal(matchingApprovedRefund(r,'345','12',9075),'12');
  assert.equal(matchingApprovedRefund(r,'345',null,9075),null);
  assert.equal(matchingApprovedRefund(r,'345','13',9075),null);
  assert.equal(matchingApprovedRefund(r,'345','12',9074),null);
  assert.equal(matchingApprovedRefund(r,'346','12',9075),null);
  assert.equal(matchingApprovedRefund([{...r[0],status:'pending'}],'345','12',9075),null);
});
