import assert from 'node:assert/strict';
import test from 'node:test';
import {runOfflineSafetyAudit} from '../commercial_safety.mjs';

test('auditoria offline cobre os tres provedores e os principais bloqueios de escrita',async()=>{
  const result=await runOfflineSafetyAudit();
  assert.equal(result.success,true);
  assert.equal(result.summary.failed,0);
  assert.ok(result.summary.passed>=12);
  assert.ok(result.checks.every(c=>c.passed===true));
  for(const code of ['BLING_ORIGIN_REFERENCE','OMIE_EXPLICIT_TAX_MAPPING','OLIST_ORIGIN_REFERENCE',
    'QUEUE_DUPLICATE_BATCH_GUARD','QUEUE_WRONG_ORDER_REJECTED','QUEUE_UNCERTAIN_EXPORT_NEVER_ACKED',
    'ACK_TIMEOUT_NOT_NACKED','TENANT_JOURNAL_ISOLATION'])
    assert.ok(result.checks.some(c=>c.code===code&&c.passed),code);
  assert.equal(result.homologated,false);
  assert.equal(result.productionApproved,false);
  assert.equal(result.automationActivated,false);
  assert.equal(result.realErpCalls,0);
});

test('relatorio nao contem credenciais ou informacoes pessoais',async()=>{
  const output=JSON.stringify(await runOfflineSafetyAudit()).toLowerCase();
  for(const forbidden of ['access_token','refresh_token','cpf','password','authorization',
    'email','customer','f40i_','secret','http://','https://'])
    assert.equal(output.includes(forbidden),false,forbidden);
});
