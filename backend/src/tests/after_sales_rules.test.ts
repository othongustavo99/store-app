import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedRequestTypes,permittedTransition,needsResolutionNote} from '../services/after_sales_rules.js';

test('solicitação cancelamento antes de pagar',()=>{
  assert.deepEqual(allowedRequestTypes('PENDING_PAYMENT'),['CANCEL']);
  assert.deepEqual(allowedRequestTypes('REFUNDED'),[]);
  assert.deepEqual(allowedRequestTypes('DELIVERED'),['RETURN','REFUND']);
});
test('não permite transições indevidas ou reabrir casos encerrados',()=>{
  assert.equal(permittedTransition('OPEN','IN_REVIEW'),true);
  assert.equal(permittedTransition('OPEN','CLOSED'),false);
  assert.equal(permittedTransition('CLOSED','IN_REVIEW'),false);
  assert.equal(permittedTransition('MANUAL_ACTION','CLOSED'),true);
});
test('rejeição e fechamento exigem justificativa',()=>{
  assert.equal(needsResolutionNote('REJECTED'),true);
  assert.equal(needsResolutionNote('CLOSED'),true);
  assert.equal(needsResolutionNote('IN_REVIEW'),false);
});
