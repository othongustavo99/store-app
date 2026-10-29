import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export type MigrationFile = { name: string; sql: string; checksum: string };
export type AppliedMigration = { name: string; checksum: string };

// Funciona em src/db e dist/db, sem depender do diretório do terminal.
export const migrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));

export async function readMigrationFiles(): Promise<MigrationFile[]> {
  const names = (await readdir(migrationDirectory))
    .filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!names.length) throw new Error('Nenhuma migration SQL encontrada.');
  return Promise.all(names.map(async name => {
    const sql = await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
}

export function migrationStatus(files: readonly MigrationFile[], applied: readonly AppliedMigration[]) {
  const history = new Map(applied.map(row => [row.name, row.checksum]));
  const local = new Set(files.map(file => file.name));
  return {
    pending: files.filter(file => !history.has(file.name)).map(file => file.name),
    changed: files.filter(file => history.has(file.name) && history.get(file.name) !== file.checksum).map(file => file.name),
    missing: applied.filter(row => !local.has(row.name)).map(row => row.name),
    applied: files.filter(file => history.get(file.name) === file.checksum).map(file => file.name),
  };
}
