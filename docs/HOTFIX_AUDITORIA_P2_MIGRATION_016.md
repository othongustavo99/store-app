# Auditoria / hotfix P2 — migration 016 (29/10/2026)

## Causa
`backend/migrations/001_core.sql` ja declara `orders.discount_cents`. A migration `016_p2_coupons_push.sql` entregou `ALTER TABLE orders ADD COLUMN discount_cents` sem `IF NOT EXISTS`, causando erro `column "discount_cents" of relation "orders" already exists` em um banco migrado normalmente.

## O que este ZIP altera
- Somente `backend/migrations/016_p2_coupons_push.sql`: acrescenta `IF NOT EXISTS` ao ADD COLUMN, mantendo os demais comandos intactos.

## Aplique com seguranca
1. Faça backup do PostgreSQL/Railway antes de migrar.
2. Confirme no PostgreSQL: `SELECT name, applied_at FROM schema_migrations WHERE name = '016_p2_coupons_push.sql';`
3. **Se ja houver um registro de aplicacao da 016, PARE.** O migrador valida SHA-256 e modificar a migration historica causaria conflito. Solicite uma migration nova (017) adaptada ao estado real do banco, e nao altere manualmente checksums.
4. Se a 016 ainda NAO foi registrada, substitua o arquivo na raiz do projeto e publique o backend atualizado.
5. No diretorio `backend`, execute `npm run build` e `npm run db:migrate:prod` com DATABASE_URL apontando para o banco certo, ou deixe o deploy Railway executar seu fluxo normal de migrations.
6. Confira `SELECT name FROM schema_migrations WHERE name = '016_p2_coupons_push.sql';`, e confirme que `store_coupons`, `order_coupons`, `push_device_tokens` e `push_outbox` existem no PostgreSQL.

## O que NAO prova
A auditoria confirmou que os arquivos P0-P2 foram copiados e que o backend passa nos testes; nao foi possivel comprovar o schema remoto, o comportamento do aplicativo Flutter ou as notificacoes FCM.

## Observacoes adicionais
- O uso de cupom conta no momento de criar o pedido e nao volta automaticamente em cancelamentos. Requer evolucao de regra de negocio para venda real.
- O APK Android ainda usa `signingConfigs.getByName("debug")` no release e exige assinatura de distribuicao antes de publicar.
- Evite compartilhar ZIPs completos com `backend/.env`, `.git` e `node_modules`.
