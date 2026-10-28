import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Railway/Fastify: :: permite atender nas redes IPv6 e IPv4 do container.
  // HOST explícito no ambiente continua tendo prioridade.
  HOST: z.string().default('::'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(10).refine((s) => s.startsWith('postgres://') || s.startsWith('postgresql://'), 'Esperado URL postgres'),
  JWT_SECRET: z.string().min(43).refine((v) => !/COLOQUE|CHANGE[_-]?ME|EXAMPLE|SENHA/i.test(v) && new Set(v).size >= 12, 'Use segredo aleatório gerado com randomBytes(48)'),
  JWT_ISSUER: z.string().min(4).default('loja-api'),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(30).default(5),
  ALLOW_STORE_SELF_SERVICE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  ENABLE_REAL_PAYMENTS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Habilitação independente para estornos reais. Inicia sempre desativada.
  ENABLE_REFUNDS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Proteção de piloto: um token do Mercado Pago NÃO pode receber por todas as lojas.
  PAYMENT_PILOT_STORE_ID: z.string().uuid().optional(),
  MERCADOPAGO_ACCESS_TOKEN: z.string().min(20).optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(16).optional(),
  PUBLIC_BASE_URL: z.string().url().startsWith('https://').optional(),
  CLOUDINARY_CLOUD_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).optional(),
  CLOUDINARY_API_KEY: z.string().min(5).optional(),
  CLOUDINARY_API_SECRET: z.string().min(8).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Variáveis de ambiente inválidas ou ausentes: ${names}. Veja backend/.env.example`);
}
export const config = parsed.data;
