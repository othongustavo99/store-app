import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { newInviteCode, hashInviteCode, canAssignRole, canChangeMemberRole } from '../services/team_invites.js';

test('códigos aleatórios não se repetem e o hash é estável', () => {
  const first = newInviteCode();
  const second = newInviteCode();
  assert.match(first, /^[a-zA-Z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(hashInviteCode(first), hashInviteCode(first));
  assert.notEqual(hashInviteCode(first), first);
  assert.notEqual(hashInviteCode(first), hashInviteCode(second));
});

test('OWNER nunca é papel delegável nesta interface', () => {
  assert.equal(canAssignRole('MANAGER'), true);
  assert.equal(canAssignRole('STAFF'), true);
  assert.equal(canAssignRole('OWNER'), false);
  assert.equal(canChangeMemberRole('OWNER', 'STAFF'), false);
  assert.equal(canChangeMemberRole('STAFF', 'OWNER'), false);
  assert.equal(canChangeMemberRole('MANAGER', 'STAFF'), true);
});
