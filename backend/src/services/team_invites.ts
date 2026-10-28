import { createHash, randomBytes } from 'node:crypto';

/** Código de alta entropia; o texto claro é devolvido uma única vez ao proprietário. */
export function newInviteCode(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export function canAssignRole(role: string): role is 'MANAGER' | 'STAFF' {
  return role === 'MANAGER' || role === 'STAFF';
}

export function canChangeMemberRole(current: string, next: string): boolean {
  return current !== 'OWNER' && canAssignRole(current) && canAssignRole(next);
}
