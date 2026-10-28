import test from 'node:test';
import assert from 'node:assert/strict';
import { supportTicketInput, supportMessageInput, supportStateInput } from '../services/support_inputs.js';

test('somente campos permitidos podem criar um chamado', () => {
  const result = supportTicketInput.parse({subject:' Dúvida de pedido ',message:' Olá '});
  assert.equal(result.subject,'Dúvida de pedido');
  assert.equal(result.message,'Olá');
  assert.equal(supportTicketInput.safeParse({subject:'Dúvida',message:'Oi',storeId:'outro'}).success,false);
  assert.equal(supportTicketInput.safeParse({subject:'X',message:'Oi'}).success,false);
});

test('mensagens têm tamanho controlado, sem IDs ou privilégios adicionais', () => {
  assert.equal(supportMessageInput.safeParse({body:'   '}).success,false);
  assert.equal(supportMessageInput.safeParse({body:'A'.repeat(4001)}).success,false);
  assert.equal(supportMessageInput.safeParse({body:'Olá',senderId:'admin'}).success,false);
  assert.equal(supportMessageInput.parse({body:'Oi'}).body,'Oi');
});

test('atendimento não aceita status financeiro nem de pedido', () => {
  assert.equal(supportStateInput.safeParse({status:'PAID'}).success,false);
  assert.equal(supportStateInput.safeParse({status:'OPEN'}).success,true);
  assert.equal(supportStateInput.safeParse({status:'CLOSED'}).success,true);
});
