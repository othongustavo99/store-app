import assert from 'node:assert/strict';
import test from 'node:test';
import { hashToken, newRefreshToken, refreshTokenId } from '../security/tokens.js';

test('refresh token tem entropia e hash; nunca retorna o segredo do banco', () => {
  const first = newRefreshToken();
  const second = newRefreshToken();
  assert.notEqual(first.token, second.token);
  assert.equal(first.hash, hashToken(first.token));
  assert.equal(refreshTokenId(first.token), first.id);
  assert.equal(refreshTokenId('malformado'), null);
});
