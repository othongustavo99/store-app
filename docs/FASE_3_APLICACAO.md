# Fase 3 — Pedidos, reserva de estoque, checkout externo e confirmação de pagamento

## Pré-requisitos
- Fases 0, 1 e 2 aplicadas; API Railway `GET /health/ready` = ready.
- Backup do PostgreSQL antes de implantar `003_orders_checkout.sql`.
- A loja-piloto já existe no PostgreSQL, e seu catálogo tem produtos publicados e estoque válido.
- O Flutter é executado com `LOJA_BACKEND=railway`, `LOJA_API_BASE_URL` e `LOJA_STORE_SLUG`.

## Alterações deste ZIP
- `backend/migrations/003_orders_checkout.sql` (novo)
- `backend/src/routes/commerce.ts` (novo)
- `backend/src/security/payment_signature.ts` (novo)
- `backend/src/tests/payment_signature.test.ts` (novo)
- `backend/src/app.ts`, `backend/src/server.ts`, `backend/src/config.ts`, `backend/src/routes/catalog.ts` (substituir completos)
- `backend/.env.phase3.example` (novo; só referência, NÃO enviar valores secretos)
- `lib/core/network/loja_api.dart` (substituir completo para suportar SSE de pedidos)
- `lib/data/repositories/railway_order_repository.dart` (novo)
- `lib/features/client/checkout/railway_checkout_screen.dart` (novo)
- `lib/features/client/orders/railway_orders_screen.dart` (novo)
- `lib/features/admin/orders/railway_admin_orders_screen.dart` (novo)
- `lib/router/app_router.dart` e `lib/features/admin/remote_admin_home.dart` (substituir completos)

Nenhum arquivo é removido; Firestore e checkout simulado ficam somente no modo legado e este checkout real não os utiliza.

## Instalação e verificações locais
Na raiz do projeto:

```powershell
cd backend
npm ci
npm run build
npm test
cd ..
flutter pub get
flutter analyze
flutter test
```

O backend executa migrations no início do container. Confira os Deploy Logs por `003_orders_checkout.sql` e, depois, `/health/ready`.

## Railway / Mercado Pago — LOJA PILOTO APENAS

1. No Railway, **store-app > Variables**: mantenha `DATABASE_URL` referenciando `Postgres.DATABASE_URL`, com `JWT_SECRET` forte; nunca cole senhas em screenshots.
2. Obtenha o `storeId` UUID em `GET /v1/shops/SEU-SLUG` (JSON -> `store.id`).
3. Em [Mercado Pago Developers > Suas integrações](https://www.mercadopago.com.br/developers/pt), crie uma aplicação **Checkout Pro (Preferências)** com credenciais de **teste**; configure webhook de pagamentos:
   `https://SEU-DOMINIO.up.railway.app/v1/payments/mercadopago/webhook`
4. No serviço da API, configure:

| Nome | Valor |
|---|---|
| `ENABLE_REAL_PAYMENTS` | `false` antes da verificação; `true` somente ao testar com sandbox |
| `PAYMENT_PILOT_STORE_ID` | UUID da única loja que pode receber nesta fase |
| `MERCADOPAGO_ACCESS_TOKEN` | Token privado do ambiente selecionado |
| `MERCADOPAGO_WEBHOOK_SECRET` | Assinatura secreta Webhook do mesmo ambiente |
| `PUBLIC_BASE_URL` | URL HTTPS de `store-app` (sem barra final) |

5. Faça deploy e verifique `GET /v1/shops/SEU-SLUG/checkout/availability` -> `{ "enabled": true, "fulfillment": ["PICKUP"] }`.
6. Teste **somente com contas e pagamentos de teste** do Mercado Pago. Não utilize credenciais reais ou cartão pessoal para verificar uma integração ainda não auditada.
7. Abra a vitrine, adicione uma peça ao carrinho, escolha **Retirada na loja**, confira o valor no checkout do Mercado Pago; pague com conta de teste. A aba Pedidos deve mostrar `PAID` após o webhook legítimo, sem atualizar manualmente (SSE autenticado).
8. Verifique no PostgreSQL `product_variants` (`on_hand` diminui, `reserved` retorna a zero) e `inventory_movements` (`RESERVATION` e `SALE`). Faça o mesmo com pagamento recusado/cancelado (`RELEASE`, pedido `CANCELED`).

### Importantíssimo: recebimento multi-loja
O token Mercado Pago configurado na API **recebe pagamentos apenas na conta associada a ele**. Nesta fase, o backend recusa qualquer checkout que não pertença ao UUID `PAYMENT_PILOT_STORE_ID`. Antes de vender a plataforma a outros comerciantes, implemente credenciais por loja (OAuth e onboarding financeiro), ciclo de reembolsos, conciliação, impostos, fretes e atendimento.

### Segurança das cobranças
- Os valores vêm do preço atual no PostgreSQL, nunca dos preços enviados pelo celular.
- O mesmo `idempotencyKey` do checkout não reserva o estoque duas vezes; o cliente também pode retomar um pedido cujo gateway falhou na primeira tentativa.
- Alterações de pedido por cliente não são permitidas.
- O pagamento só é aprovado após assinatura HMAC do webhook e consulta autenticada à API do Mercado Pago; redirecionamentos não alteram status.
- Estoque é reservado com transação, lock e validação concorrente.
- O pedido não é aprovado se chegar pagamento após expiração da reserva: entra em `PAYMENT_REVIEW` e precisa de reconciliação/reembolso manual.
- A reserva dura 48 horas como margem de segurança; a preferência de pagamento vence em 30 minutos. Reservas antigas são liberadas pelo processo de limpeza a cada minuto. **Para produção comercial ampla, é necessário um worker independente e reconciliação programada com gateway antes de liberar reservas.**
- Frete por transportadora **não está implementado** nesta fase. Não há valor de frete inventado: apenas `PICKUP` com frete zero. Também faltam cancelamento/reembolso automático de pedidos já pagos, nota fiscal e testes de carga/integração.

## Endpoints adicionados

| Método | Endpoint | Acesso |
|---|---|---|
| GET | `/v1/shops/:slug/checkout/availability` | Público |
| POST | `/v1/shops/:slug/checkout/orders` | Cliente autenticado, loja habilitada |
| GET | `/v1/shops/:slug/orders` | Cliente autenticado; só seus pedidos |
| POST | `/v1/shops/:slug/orders/:orderId/checkout` | Retomar checkout pendente da própria conta |
| GET | `/v1/shops/:slug/orders/events` | SSE do cliente autenticado, loja atual |
| GET | `/v1/stores/:storeId/orders/events` | SSE restrito à equipe da loja |
| GET | `/v1/shops/:slug/orders/:orderId` | Cliente proprietário do pedido |
| GET | `/v1/stores/:storeId/orders` | Equipe da loja |
| PATCH | `/v1/stores/:storeId/orders/:orderId/status` | Proprietário/gerente; sem aprovar pagamento manualmente |
| POST | `/v1/payments/mercadopago/webhook` | Mercado Pago com assinatura HMAC válida |
| GET | `/v1/payments/return` | Página informativa (nunca confirma pagamento) |

### Checklist obrigatório antes da Fase 4
- [ ] Backend compila e testes passam.
- [ ] Migration 003 aplicada sem alterações manuais.
- [ ] Checkout de outra loja bloqueado (HTTP 503).
- [ ] Token ausente mantém checkout bloqueado.
- [ ] Falha de pagamento não marca pedido como pago.
- [ ] Com dois clientes, última unidade não pode ser vendida duas vezes.
- [ ] Webhook com assinatura inválida rejeitado (HTTP 401).
- [ ] Histórico de pedidos de um cliente não vaza para outro.
- [ ] Somente proprietário/gerente avança o pedido; funcionário apenas lê.
- [ ] Pedido pago e entrega/retirada exibidos na área do administrador e do cliente.

## GitHub e deploy

```powershell
git add backend/src backend/migrations/003_orders_checkout.sql backend/.env.phase3.example lib docs/FASE_3_APLICACAO.md
git commit -m "feat: fase 3 pedidos transacionais e checkout Mercado Pago piloto"
git push origin master
```

**Não adicione `.env`, credenciais, exports do banco ou dumps ao Git.**
