/**
 * Recuperação administrativa LOCAL (via Railway SSH), não é endpoint HTTP.
 * Executar apenas por operadores autorizados com acesso ao serviço Railway.
 * Nunca recebe senha por argumento, variável de ambiente ou comando de shell.
 */
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pool } from '../db/pool.js';
import { hashPassword } from '../security/password.js';

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  password_hash: string;
};

async function run(): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Abra uma sessão interativa do Railway SSH (terminal TTY). Não execute via CI ou pipe.');
  }

  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    console.log('\nRECUPERAÇÃO DE SENHA — acesso administrativo ao PostgreSQL');
    console.log('Atenção: esta operação invalida todas as sessões da conta.');

    const email = (await prompt.question('Email cadastrado no e-commerce: ')).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      console.log('Email inválido. Nenhuma alteração realizada.');
      return;
    }

    const found = await pool.query<UserRow>(
      'SELECT id, email, display_name, status, password_hash FROM users WHERE email = $1',
      [email],
    );
    const user = found.rows[0];
    if (!user) {
      console.log('Conta não encontrada no PostgreSQL. Nenhuma alteração realizada.');
      return;
    }
    console.log(`Conta: ${user.display_name} (${user.email}); status: ${user.status}`);
    const format = /^scrypt\$v1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/.test(user.password_hash)
      ? 'scrypt v1' : 'desconhecido (incompatível com login atual)';
    console.log(`Formato da senha salva: ${format} (hash não será exibido)`);

    const memberships = await pool.query<{ name: string; slug: string; role: string }>(
      `SELECT s.name, s.slug, sm.role
       FROM store_memberships sm JOIN stores s ON s.id = sm.store_id
       WHERE sm.user_id = $1 ORDER BY s.name LIMIT 20`,
      [user.id],
    );
    for (const member of memberships.rows) {
      console.log(`Loja vinculada: ${member.name} | slug: ${member.slug} | função: ${member.role}`);
    }

    if (user.status !== 'ACTIVE') {
      console.log('Conta suspensa. A senha não será redefinida nem a suspensão alterada.');
      return;
    }

    console.log('\nUma senha aleatória forte será criada, exibida UMA VEZ e não será salva em logs.');
    const confirmation = (await prompt.question(`Para confirmar, digite exatamente: REDEFINIR ${email}\n> `)).trim();
    if (confirmation !== `REDEFINIR ${email}`) {
      console.log('Operação cancelada, sem modificações.');
      return;
    }

    const generatedPassword = randomBytes(32).toString('base64url');
    const passwordHash = await hashPassword(generatedPassword);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE users SET password_hash=$1, updated_at=now()
         WHERE id=$2 AND email=$3 AND status='ACTIVE' RETURNING id`,
        [passwordHash, user.id, user.email],
      );
      if (updated.rowCount !== 1) throw new Error('Conta mudou de estado durante a operação.');
      await client.query(
        `UPDATE refresh_sessions SET revoked_at=now()
         WHERE user_id=$1 AND revoked_at IS NULL`,
        [user.id],
      );
      await client.query(
        `INSERT INTO audit_logs (store_id,actor_id,event,entity_type,entity_id,metadata)
         VALUES (NULL,NULL,'USER_PASSWORD_ADMIN_RESET','user',$1,'{"method":"railway_ssh"}'::jsonb)`,
        [user.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    console.log('\nSENHA REDEFINIDA COM SUCESSO.\n');
    console.log(`Conta: ${user.email}`);
    console.log(`Nova senha (EXIBIDA APENAS AGORA): ${generatedPassword}`);
    console.log('\nCopie para um gerenciador de senhas. Não envie esta senha em prints ou mensagens.');
    console.log('As sessões anteriores foram revogadas. Faça login novamente no aplicativo.');
  } finally {
    prompt.close();
  }
}

run().catch((err: unknown) => {
  // Evita imprimir dados confidenciais de drivers e URLs de conexão.
  const message = err instanceof Error ? err.message : 'erro inesperado';
  console.error(`Não foi possível concluir a recuperação: ${message}`);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
