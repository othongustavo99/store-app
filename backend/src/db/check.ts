import { pool } from './pool.js';
import { formatDatabaseError } from './diagnostics.js';
import { migrationStatus, readMigrationFiles, type AppliedMigration } from './migration_files.js';

async function check() {
  const files = await readMigrationFiles();
  const client = await pool.connect();
  try {
    // A transação read-only impede alterações mesmo se o comando for expandido.
    await client.query('BEGIN READ ONLY');
    await client.query('SELECT 1');
    console.log('Conexão PostgreSQL: OK.');
    const table = await client.query<{ present: boolean }>("SELECT to_regclass('schema_migrations') IS NOT NULL AS present");
    const history = table.rows[0].present
      ? (await client.query<AppliedMigration>('SELECT name, checksum FROM schema_migrations ORDER BY name')).rows
      : [];
    const status = migrationStatus(files, history);
    console.log(`Migrations: ${status.applied.length} aplicadas; ${status.pending.length} pendentes; ${status.changed.length} divergentes; ${status.missing.length} ausentes nos arquivos.`);
    for (const name of status.pending) console.log(`Pendente: ${name}`);
    for (const name of status.changed) console.error(`Checksum divergente: ${name}`);
    for (const name of status.missing) console.error(`Arquivo ausente: ${name}`);
    await client.query('ROLLBACK');
    if (status.changed.length || status.missing.length) process.exitCode = 1;
    console.log('Verificação concluída sem aplicar migrations ou alterar dados.');
  } finally {
    client.release(true);
  }
}

check().catch((error: unknown) => {
  console.error(`Falha na verificação do banco:\n${formatDatabaseError(error)}`);
  process.exitCode = 1;
}).finally(async () => { await pool.end(); });
