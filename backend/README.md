# Loja API — Fundação da Fase 1

API Fastify + TypeScript + PostgreSQL, dedicada à futura plataforma multi-loja.
O aplicativo Flutter **continua usando Firebase nesta fase**. Não há checkout real.

## Executar localmente

Requisitos: Node.js 22, npm e PostgreSQL 14+.

```powershell
cd loja_roupas\backend
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
# Copie o segredo gerado para JWT_SECRET em .env
# Ajuste DATABASE_URL para seu PostgreSQL local (crie um banco separado)
npm install
npm run build
npm run db:migrate
npm test
npm run dev
```

Rotas base:

| Método | Rota | Autorização | Resultado |
| --- | --- | --- | --- |
| GET | `/health/live` | Pública | Processo ativo |
| GET | `/health/ready` | Pública | Conexão com banco |
| POST | `/v1/auth/register` | Pública, rate limit | Cadastro + tokens |
| POST | `/v1/auth/login` | Pública, rate limit | Login + tokens |
| POST | `/v1/auth/refresh` | Token de renovação | Rotação do refresh token |
| POST | `/v1/auth/logout` | Access token | Revoga sessão |
| GET | `/v1/me` | Access token | Perfil atual |
| GET | `/v1/shops/:slug` | Pública | Vitrine pública, dados básicos |
| POST | `/v1/stores` | Access token + feature flag | Cria loja (somente piloto) |
| GET | `/v1/stores/mine` | Access token | Lojas vinculadas |
| GET | `/v1/stores/:storeId` | OWNER/MANAGER/STAFF | Dados da loja |
| GET | `/v1/stores/:storeId/members` | OWNER/MANAGER | Equipe da loja |

`accessToken`: JWT HS256, 15 minutos. `refreshToken`: token opaco, renovado a cada uso e persistido apenas como hash SHA-256. Senhas são hash scrypt com salt independente. No cliente futuro, tokens deverão ser guardados em armazenamento seguro, não em SharedPreferences.

## Implantar no Railway

Veja `../docs/FASE_1_RAILWAY_APLICACAO.md` para o roteiro completo, com testes.

- API: serviço baseado na pasta `/backend`, sem volume dedicado.
- PostgreSQL: serviço separado com seu próprio volume e backups ativos.
- API recebe `DATABASE_URL` por referência ao PostgreSQL.
- Dockerfile reconhecido automaticamente na raiz `/backend`; configure healthcheck `/health/live` no painel do serviço. Ao iniciar, aplica SQL migrations por ordem, com lock.
- Não publique credenciais, `.env`, dados sensíveis nem URL interna do banco.

## Organização

- `src/app.ts`: Fastify, middlewares e rotas.
- `src/routes/auth.ts`: cadastro, login, sessão, perfil.
- `src/routes/stores.ts`: lojas públicas/privadas e autorização.
- `src/security/`: hashing, JWT, autorização e validação.
- `src/db/migrate.ts`: migrador com lock e checksum.
- `migrations/001_core.sql`: modelo inicial e integridade multi-loja.
- `src/tests/`: testes unitários de segurança e validação.

## Escopo de segurança desta fase

Pronto para validar autenticação e gerenciamento inicial de lojas **em homologação**.
Ainda não é uma API pronta para operar comércio: falta comprovação de email, recuperação de senha, MFA para operadores, proteção antiabuso distribuída, autorização em todas as futuras rotas, gateway de pagamentos, migração Firebase, RLS PostgreSQL opcional como defesa extra, logs centralizados, testes de integração e observabilidade.

A criação pública de lojas é **false por padrão**. Habilitar `ALLOW_STORE_SELF_SERVICE=true` somente no piloto em ambiente de teste, depois voltar para `false`. Um usuário pode ser dono de no máximo uma loja nesse modo de piloto. A área de provisionamento comercial será feita em fases seguintes.
