import type { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { ApiError } from '../security/errors.js';

export type AccountAction = 'PASSWORD_RESET' | 'ACCOUNT_DELETE';

export function isValidActionToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function blockReason(roles: number, pendingOrders: number, openSupport: number, pendingAfterSales: number): string | null {
  if (roles > 0) return 'Sua conta ainda participa da equipe de uma loja. Remova ou transfira seus vínculos administrativos para concluir a exclusão.';
  if (pendingOrders > 0) return 'Há pedidos em andamento. A exclusão será concluída após a resolução desses pedidos.';
  if (pendingAfterSales > 0) return 'Há solicitações de pós-venda pendentes. A exclusão será concluída após a resolução.';
  if (openSupport > 0) return 'Há atendimentos em aberto. A exclusão será concluída após a resolução.';
  return null;
}

export function accountEmailConfigured(): boolean {
  return Boolean(config.RESEND_API_KEY && config.ACCOUNT_EMAIL_FROM && config.PUBLIC_BASE_URL);
}

export async function sendAccountEmail(to: string, action: AccountAction, token: string): Promise<void> {
  if (!accountEmailConfigured()) throw new ApiError(503, 'Recuperação por email temporariamente indisponível.');
  const route = action === 'PASSWORD_RESET' ? 'redefinir-senha' : 'confirmar-exclusao';
  // O segredo está no fragmento (#), não aparece nos logs HTTP e não é encaminhado no Referer.
  const link = `${config.PUBLIC_BASE_URL}/account/${route}#token=${token}`;
  const subject = action === 'PASSWORD_RESET' ? 'Redefinição de senha da sua loja' : 'Confirme sua solicitação de exclusão';
  const text = action === 'PASSWORD_RESET'
    ? `Recebemos um pedido para redefinir a senha. Abra o link abaixo em até 30 minutos:\n\n${link}\n\nSe não foi você, ignore esta mensagem.`
    : `Recebemos uma solicitação de exclusão de conta. Para confirmá-la, abra o link em até 30 minutos:\n\n${link}\n\nSe não solicitou, ignore esta mensagem.`;
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.ACCOUNT_EMAIL_FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { throw new ApiError(503, 'Serviço de email temporariamente indisponível.'); }
  if (!response.ok) throw new ApiError(503, 'Serviço de email temporariamente indisponível.');
}

export function newActionToken(): string { return randomBytes(32).toString('base64url'); }

/**
 * Preserva registros de pedidos/fiscalidade por meio de uma identidade pseudonimizada.
 * Endereço de entrega já copiado para pedidos pode exigir retenção legal — revisar em produção.
 * Sempre chamado após SELECT users ... FOR UPDATE e dentro da mesma transação.
 */
export async function finalizeOrQueueDeletion(client: PoolClient, userId: string): Promise<{status: 'PENDING' | 'COMPLETED'; message: string}> {
  const roles = await client.query('SELECT 1 FROM store_memberships WHERE user_id=$1 LIMIT 1', [userId]);
  const pendingOrders = await client.query(
    `SELECT 1 FROM orders WHERE customer_id=$1 AND status IN ('PENDING_PAYMENT','PAID','PREPARING','SHIPPED') LIMIT 1`, [userId]);
  const support = await client.query('SELECT 1 FROM support_tickets WHERE customer_id=$1 AND status=$2 LIMIT 1', [userId,'OPEN']);
  const afterSales = await client.query(
    `SELECT 1 FROM after_sales_requests WHERE customer_id=$1 AND status IN ('OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION') LIMIT 1`, [userId]);
  const reason = blockReason(roles.rowCount ?? 0, pendingOrders.rowCount ?? 0, support.rowCount ?? 0, afterSales.rowCount ?? 0);
  await client.query(
    `INSERT INTO account_deletion_requests(user_id,status,reason) VALUES ($1,'PENDING',$2)
      ON CONFLICT(user_id) DO UPDATE SET status='PENDING',reason=EXCLUDED.reason,requested_at=now()`, [userId, reason]);
  if (reason) return {status:'PENDING',message:reason};

  // Revogação e anonimização no mesmo COMMIT. Não apagar compras e notas financeiras.
  await client.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
  await client.query('DELETE FROM account_action_tokens WHERE user_id=$1', [userId]);
  await client.query('DELETE FROM customer_addresses WHERE user_id=$1', [userId]);
  await client.query('DELETE FROM carts WHERE user_id=$1', [userId]);
  await client.query('DELETE FROM shipping_quotes WHERE customer_id=$1', [userId]);
  // Conversas não podem continuar expondo mensagens antigas do titular.
  await client.query(`UPDATE support_messages SET body='[Conteúdo removido por solicitação do titular]'
    WHERE sender_id=$1 OR ticket_id IN (SELECT id FROM support_tickets WHERE customer_id=$1)`, [userId]);
  await client.query(`UPDATE support_tickets SET subject='Atendimento de conta excluída' WHERE customer_id=$1`, [userId]);
  await client.query(`UPDATE after_sales_requests SET reason='Informações pessoais removidas por solicitação do titular',
    staff_notes=NULL WHERE customer_id=$1`, [userId]);
  await client.query(`UPDATE users SET email=$1,display_name='Conta excluída',password_hash=$2,
    email_verified_at=NULL,status='DELETED',updated_at=now() WHERE id=$3`,
    [`deleted-${userId}@deleted.invalid`, `deleted$${randomBytes(32).toString('hex')}`, userId]);
  await client.query(`UPDATE account_deletion_requests SET status='COMPLETED',reason=NULL,completed_at=now()
    WHERE user_id=$1`, [userId]);
  return {status:'COMPLETED',message:'Sua conta foi desativada e seus dados de perfil removidos. Alguns registros de transações podem ser retidos por obrigação legal.'};
}
