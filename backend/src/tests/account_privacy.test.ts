import test from 'node:test';
import assert from 'node:assert/strict';
import { blockReason, isValidActionToken, newActionToken } from '../services/account_privacy.js';

test('token aleatório tem formato permitido e comprimento correto',()=>{
  const token=newActionToken();assert.equal(token.length,43);assert.equal(isValidActionToken(token),true);
  assert.notEqual(newActionToken(),token);
});
test('links incorretos nunca são aceitos',()=>{
  for(const t of ['','abc','../abc','x'.repeat(100),'a/b','A'.repeat(44)]) assert.equal(isValidActionToken(t),false);
});
test('exclusão automática apenas sem pendências',()=>{
  assert.equal(blockReason(0,0,0,0),null);
  assert.match(blockReason(1,0,0,0)??'',/equipe/);
  assert.match(blockReason(0,1,0,0)??'',/pedidos/);
  assert.match(blockReason(0,0,1,0)??'',/atendimentos/);
  assert.match(blockReason(0,0,0,1)??'',/pós-venda/);
});
