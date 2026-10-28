import test from 'node:test';
import assert from 'node:assert/strict';
import { editProfileSchema, changePasswordSchema, addressBodySchema } from '../services/account_validation.js';

const example = {label:'Casa',zipCode:'12900000',street:'Rua Principal',number:'40',
  neighborhood:'Centro',city:'Bragança Paulista',state:'SP',isPrimary:true};
test('nome e senha passam pelas validações', () => {
  assert.equal(editProfileSchema.safeParse({ name: '  Pessoa Exemplo  ' }).success, true);
  assert.equal(editProfileSchema.safeParse({ name: 'x' }).success, false);
  assert.equal(changePasswordSchema.safeParse({ currentPassword:'senha-antiga', newPassword:'nova-senha-longa' }).success, true);
  assert.equal(changePasswordSchema.safeParse({ currentPassword:'senha-antiga', newPassword:'senha-antiga' }).success, false);
  assert.equal(changePasswordSchema.safeParse({ currentPassword:'senha-antiga', newPassword:'curta' }).success, false);
});
test('endereço brasileiro exige CEP com 8 dígitos e UF válida', () => {
  const parsed = addressBodySchema.parse(example);
  assert.equal(parsed.complement,'');
  assert.equal(addressBodySchema.safeParse({...example,zipCode:'12-900000'}).success,false);
  assert.equal(addressBodySchema.safeParse({...example,state:'XX'}).success,false);
  assert.equal(addressBodySchema.safeParse({...example,admin:true}).success,false);
});
