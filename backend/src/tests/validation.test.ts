import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../security/errors.js';
import { emailField, slugField, validated } from '../security/validation.js';

test('email é normalizado', () => {
  assert.equal(emailField.parse('  TESTE@EXEMPLO.COM  '), 'teste@exemplo.com');
});

test('slug rejeita caracteres que poderiam afetar URLs e consultas', () => {
  assert.equal(slugField.safeParse('loja-da-maria').success, true);
  assert.equal(slugField.safeParse('LOJA COM ESPAÇOS').success, false);
  assert.equal(slugField.safeParse('../../outra-loja').success, false);
});

test('validação não expõe detalhes internos', () => {
  assert.throws(() => validated(slugField, '<script>'), ApiError);
});
