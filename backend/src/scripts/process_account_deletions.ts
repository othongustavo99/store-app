/** Executar manualmente somente após verificar pedidos, vínculos e obrigações legais. */
import { pool } from '../db/pool.js';
import { finalizeOrQueueDeletion } from '../services/account_privacy.js';

async function main() {
  const pending = await pool.query<{user_id:string}>(
    `SELECT user_id FROM account_deletion_requests WHERE status='PENDING' ORDER BY requested_at LIMIT 100`);
  for (const {user_id} of pending.rows) {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const row=await client.query<{status:string}>('SELECT status FROM users WHERE id=$1 FOR UPDATE',[user_id]);
      if (!row.rowCount || row.rows[0].status!=='ACTIVE') {await client.query('ROLLBACK');continue;}
      const state=await finalizeOrQueueDeletion(client,user_id);
      await client.query('COMMIT');
      console.log(`Pedido ${user_id}: ${state.status}`);
    } catch(e) {
      await client.query('ROLLBACK');console.error(`Erro ao processar ${user_id}`,e instanceof Error?e.message:'erro');
      process.exitCode=1;
    } finally {client.release();}
  }
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>pool.end());
