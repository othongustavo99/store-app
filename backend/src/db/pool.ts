import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.PG_POOL_MAX,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  application_name: 'loja-api',
});

pool.on('error', (err) => {
  // Não registrar connectionString, senhas nem payloads.
  console.error('Erro de conexão ociosa ao PostgreSQL:', err.message);
});
