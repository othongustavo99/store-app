import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDatabaseError } from '../db/diagnostics.js';
import { migrationStatus, readMigrationFiles } from '../db/migration_files.js';

test('erro agregado sem mensagem mostra conexão recusada e orientação', () => {
  const error = new AggregateError([
    Object.assign(new Error('connect ECONNREFUSED ::1:5432'), { code: 'ECONNREFUSED' }),
    Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }),
  ]);
  const result = formatDatabaseError(error);
  assert.match(result, /ECONNREFUSED/);
  assert.match(result, /localhost/);
  assert.match(result, /127\.0\.0\.1/);
});

test('diagnóstico não imprime URL privada, senha ou token', () => {
  const result = formatDatabaseError(new Error('failed postgresql://user:secret-value@host/db password=other-secret token=token-secret'));
  for (const secret of ['secret-value', 'other-secret', 'token-secret', 'postgresql://']) assert.ok(!result.includes(secret));
  assert.match(result, /ocult/);
});

test('causas circulares e erros desconhecidos têm saída finita e legível', () => {
  const error: { cause?: unknown; code: string } = { code: '28P01' };
  error.cause = error;
  assert.match(formatDatabaseError(error), /Credenciais recusadas/);
  assert.match(formatDatabaseError({}), /Erro sem mensagem/);
});

test('verificação distingue migration pendente, alterada e arquivo ausente', () => {
  const status = migrationStatus([
    { name: '001_core.sql', sql: '', checksum: 'a' },
    { name: '002_catalog.sql', sql: '', checksum: 'b' },
    { name: '003_orders.sql', sql: '', checksum: 'c' },
  ], [
    { name: '001_core.sql', checksum: 'a' },
    { name: '002_catalog.sql', checksum: 'original' },
    { name: '999_missing.sql', checksum: 'x' },
  ]);
  assert.deepEqual(status, { applied: ['001_core.sql'], changed: ['002_catalog.sql'], pending: ['003_orders.sql'], missing: ['999_missing.sql'] });
});

test('arquivos SQL são encontrados a partir do módulo compilado', async () => {
  const files = await readMigrationFiles();
  assert.ok(files.length >= 16);
  assert.equal(files[0].name, '001_core.sql');
  assert.ok(files.every(file => /^[a-f0-9]{64}$/.test(file.checksum)));
});
