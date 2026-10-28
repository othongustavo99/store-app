import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(10).refine((s) => s.startsWith('postgres://') || s.startsWith('postgresql://'), 'Esperado URL postgres'),
  JWT_SECRET: z.string().min(43).refine((v) => !/COLOQUE|CHANGE[_-]?ME|EXAMPLE|SENHA/i.test(v) && new Set(v).size >= 12, 'Use segredo aleatório gerado com randomBytes(48)'),
  JWT_ISSUER: z.string().min(4).default('loja-api'),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(30).default(5),
  ALLOW_STORE_SELF_SERVICE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Variáveis de ambiente inválidas ou ausentes: ${names}. Veja backend/.env.example`);
}
export const config = parsed.data;
