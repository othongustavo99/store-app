import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from './pool.js';

const migrationDir = resolve(process.cwd(), 'migrations');

async function run() {
  const client = await pool.connect();
  try {
    // A mesma chave bloqueia migrations concorrentes de diferentes instâncias.
    await client.query('SELECT pg_advisory_lock(418036712)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(migrationDir)).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
    if (!files.length) throw new Error('Nenhuma migration SQL encontrada.');
    for (const name of files) {
      const sql = await readFile(resolve(migrationDir, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE name = $1', [name],
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Migration alterada após execução: ${name}. Crie uma nova migration.`);
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
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(418036712)'); } finally { client.release(); }
  }
}

run().catch((err: unknown) => {
  console.error('Falha nas migrations:', err instanceof Error ? err.message : 'erro desconhecido');
  process.exitCode = 1;
}).finally(async () => { await pool.end(); });
