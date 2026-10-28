import { buildApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';

const app = await buildApp();
async function shutdown(signal: string) {
  app.log.info({ signal }, 'Encerrando aplicação');
  await app.close();
  await pool.end();
}
process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
  await pool.end();
}
