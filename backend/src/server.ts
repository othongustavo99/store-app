import { buildApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { expireReservations } from './routes/commerce.js';

const app = await buildApp();
const expiryTimer = setInterval(() => { void expireReservations().catch(e => app.log.error({err:e},'Falha no agendador de reservas')); }, 60000);
expiryTimer.unref();
async function shutdown(signal: string) {
  app.log.info({ signal }, 'Encerrando aplicação');
  clearInterval(expiryTimer);
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
  clearInterval(expiryTimer);
  await app.close();
  await pool.end();
}
