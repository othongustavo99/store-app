import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { authRoutes } from './routes/auth.js';
import { storeRoutes } from './routes/stores.js';
import { catalogRoutes, startCatalogListener } from './routes/catalog.js';
import { ApiError } from './security/errors.js';

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] },
    bodyLimit: 64 * 1024,
    trustProxy: config.TRUST_PROXY,
    requestTimeout: 15000,
  });
  await app.register(helmet);
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({ error: 'RATE_LIMIT', message: 'Muitas tentativas. Tente novamente depois.' }),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({ error: 'REQUEST_FAILED', message: error.message, requestId: request.id });
    }
    const statusCode = typeof error === 'object' && error !== null
      && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode : undefined;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: 'INVALID_REQUEST', message: 'Requisição inválida.', requestId: request.id });
    }
    request.log.error({ err: error }, 'Falha interna da API');
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.', requestId: request.id });
  });

  // Alias compatível com a URL /health usada nos testes de publicação.
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  await app.register(authRoutes);
  await app.register(storeRoutes);
  await app.register(catalogRoutes);
  await startCatalogListener(app);
  return app;
}
