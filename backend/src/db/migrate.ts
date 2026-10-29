import { pool } from './pool.js';
import { formatDatabaseError } from './diagnostics.js';
import { migrationStatus, readMigrationFiles, type AppliedMigration } from './migration_files.js';

let phase = 'leitura dos arquivos SQL';

async function run() {
  const files = await readMigrationFiles();
  phase = 'conexão com PostgreSQL';
  const client = await pool.connect();
  let locked = false;
  let failed = false;
  let cleanupFailed = false;
  try {
    phase = 'bloqueio e histórico de migrations';
    await client.query('SELECT pg_advisory_lock(418036712)');
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const history = await client.query<AppliedMigration>('SELECT name, checksum FROM schema_migrations');
    const status = migrationStatus(files, history.rows);
    if (status.changed.length) throw new Error(`Migration alterada após execução: ${status.changed.join(', ')}. Restaure o arquivo original e crie uma nova migration.`);
    if (status.missing.length) throw new Error(`Histórico do banco contém migrations ausentes no projeto: ${status.missing.join(', ')}. Confira a versão antes de continuar.`);
    const applied = new Set(status.applied);
    for (const { name, sql, checksum } of files) {
      phase = name;
      if (applied.has(name)) {
        console.log(`Já aplicada: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
        await client.query('COMMIT');
        console.log(`Aplicada: ${name}`);
      } catch (error) {
        // Falha no rollback não deve esconder a causa original.
        try { await client.query('ROLLBACK'); } catch { /* descartar conexão abaixo */ }
        throw error;
      }
    }
    console.log('Migrations concluídas.');
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock(418036712)');
    } catch (error) {
      cleanupFailed = true;
      if (!failed) throw error;
    } finally {
      client.release(failed || cleanupFailed);
    }
  }
}

run().catch((error: unknown) => {
  console.error(`Falha nas migrations (${phase}):\n${formatDatabaseError(error)}`);
  process.exitCode = 1;
}).finally(async () => { await pool.end(); });
