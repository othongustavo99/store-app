# Fase 4.6 — Reembolsos integrais e conciliação Mercado Pago

## Escopo e segurança

Esta entrega estende a Fase 4.5. Os novos estornos **não** são automáticos, nem disparados pelo cliente ao abrir uma solicitação. Só o **OWNER** da loja-piloto pode executar o reembolso integral depois que a equipe mudar a solicitação para `MANUAL_ACTION`. O backend verifica o pedido, o valor, o pagamento aprovado, a referência externa, a moeda BRL e a identidade do lojista. O gateway fica **desativado por padrão** (`ENABLE_REFUNDS=false`).

**Não está implementado:** reembolso parcial, múltiplos recebimentos por loja, devolução automática de unidades, cancelamento de pagamento pendente via gateway, relatório fiscal, reconciliação em lote, automação de logística reversa. Não liberar ambiente de produção para compradores sem validar estes limites e os cenários abaixo.

## Arquivos

Adicionados:
- `backend/migrations/008_payment_refunds.sql`
- `backend/src/routes/refunds.ts`
- `backend/src/services/refund_rules.ts`
- `backend/src/tests/refund_rules.test.ts`
- `lib/features/support/railway_refund_dialog.dart`
- este documento.

Substituídos:
- `backend/src/app.ts`
- `backend/src/config.ts`
- `backend/src/routes/commerce.ts`
- `backend/src/routes/after_sales.ts`
- `lib/data/repositories/railway_after_sales_repository.dart`
- `lib/features/admin/orders/railway_admin_orders_screen.dart`
- `lib/features/client/orders/railway_orders_screen.dart`

Nenhum arquivo deve ser excluído. Manter o Firebase legado desativado no modo Railway.

## 1. Aplicar ZIP

Extraia a pasta `loja_roupas/` sobre a raiz do repositório. Confira com `git diff` que somente os arquivos listados mudaram.

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

Se passar, faça:

```powershell
git add backend/src backend/migrations/008_payment_refunds.sql lib/data/repositories/railway_after_sales_repository.dart lib/features/admin/orders/railway_admin_orders_screen.dart lib/features/client/orders/railway_orders_screen.dart lib/features/support/railway_refund_dialog.dart docs/FASE_4_6_REEMBOLSOS_CONCILIACAO.md
git commit -m "feat: fase 4.6 estornos integrais e conciliacao"
git push origin master
```

No Railway, confirme no Deploy Logs a aplicação de `008_payment_refunds.sql`, depois `/health/ready` deve indicar `ready`.

## 2. Variáveis Railway (serviço store-app)

Mantenha o banco PostgreSQL existente. Adicione:

```env
ENABLE_REFUNDS=false
```

E confira se já estão configuradas as variáveis da Fase 3:

```env
ENABLE_REAL_PAYMENTS=false
PAYMENT_PILOT_STORE_ID=<UUID real da loja piloto>
MERCADOPAGO_ACCESS_TOKEN=<token do ambiente de teste>
MERCADOPAGO_WEBHOOK_SECRET=<segredo da assinatura webhook>
PUBLIC_BASE_URL=https://SEU-DOMINIO.up.railway.app
```

**Primeiro configure em um ambiente Railway separado, de homologação.** Não use token de produção nem habilite estornos reais em uma loja com compradores de verdade para o primeiro teste.

Somente após confirmar pedidos pagos de teste e webhook válido, altere **na homologação** `ENABLE_REAL_PAYMENTS=true` e `ENABLE_REFUNDS=true` e faça novo deploy.

Não publique tokens, IDs de pagamento e senhas em Git, prints, logs ou chat. Os IDs dos exemplos são ilustrativos.

## 3. Fluxo no aplicativo Windows

```powershell
flutter run -d windows `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://SEU-DOMINIO.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

1. Crie um pedido de teste e conclua um pagamento aprovado no Mercado Pago de testes. O pedido deverá estar `PAID` (ou outra etapa operacional paga), e o pagamento `APPROVED`.
2. Com a conta do cliente, abra uma solicitação de cancelamento/devolução/reembolso.
3. Como `OWNER` ou `MANAGER`, analise o caso e mova para `MANUAL_ACTION`. Verifique a mercadoria e a política de devolução aplicável.
4. Com a conta `OWNER`, abra **Administração → Pedidos**. Clique em **Reembolsar integralmente**, leia o aviso, marque a confirmação e digite `REEMBOLSAR`.
5. O servidor registra a operação única e consulta o pagamento original. A solicitação de estorno só será enviada se os dados corresponderem.
6. Se o gateway retornar e confirmar o registro, o pedido muda para `REFUNDED`, o pagamento para `REFUNDED`, o protocolo é encerrado e o cliente verá **Reembolsado** em seus pedidos.
7. Se o resultado estiver incerto, **não execute outra operação**. Use o botão **Conciliar estorno**, que faz somente uma consulta `GET` dos reembolsos do pagamento. Se ainda estiver incerto, confira o painel Mercado Pago e investigue manualmente.

O estoque NÃO aumenta automaticamente. A reposição deve ser feita somente depois de receber/conferir a mercadoria, usando **Inventário e movimentações**. Isso também vale para pedidos de retirada.

## 4. Cenários de teste obrigatórios antes de habilitar em produção

- Pedido não pago ou cobrança pendente: não permite estorno.
- Caso `OPEN` ou `IN_REVIEW`: não permite estorno até `MANUAL_ACTION`.
- Gerente/funcionário/cliente: não pode executar nem conciliar estorno.
- Um pedido de outra loja: não pode gerar estorno usando o `storeId` de terceiros.
- Dois cliques simultâneos: só uma operação é registrada (UNIQUE `order_id`).
- Gateway indisponível/timeout: estado inconclusivo, sem nova chamada POST automática.
- Repetir clique após timeout: retorna a operação existente, sem segundo reembolso.
- Reembolso externo anterior ao nosso aplicativo: bloqueia estorno novo e exige revisão manual.
- Webhook atrasado `approved` após reembolso: não retorna o pagamento a `APPROVED`.
- Webhook `refunded` após confirmação: mantém o pedido conciliado; `charged_back` independente exige revisão.
- Pedido entregue: verificar devolução e estado físico antes de repor estoque.
- Desabilitar `ENABLE_REFUNDS`: todos os POST de estorno falham, mas histórico permanece.
- Backup e restauração do PostgreSQL, incluindo tabela de operações, devem ser verificados.

**Observação:** os testes unitários NÃO equivalem a uma transação financeira homologada. Use conta e credenciais de teste apropriadas para o fluxo de Checkout Pro utilizado no projeto. A API para pagamento de Checkout Pro é `POST /v1/payments/{payment_id}/refunds` (reembolso total sem `amount`), com `X-Idempotency-Key` e consulta `GET /v1/payments/{id}/refunds`.

## 5. Controle de segurança e limitações deliberadas

- Apenas o proprietário (`OWNER`) pode executar a operação financeira.
- O token do Mercado Pago nunca sai do backend Railway.
- O sistema é **fail closed**: qualquer inconsistência de referência, valor, moeda, status ou reembolso existente impede nova chamada de estorno.
- Caso a chamada externa tenha sido realizada mas o processo falhe antes de gravar o identificador, não há nova execução automática. A recuperação exige investigação no painel Mercado Pago.
- A conciliação só confirma um reembolso com ID capturado pela aplicação e valor aprovado exatamente igual ao total do pedido.
- O botão não permite lançar novos reembolsos do mesmo pedido e não gera crédito de estoque.
- Nenhum e-commerce está pronto para operação financeira pública apenas por ter esta fase instalada. Regras fiscais, rastreabilidade e cenários de disputa/chargeback exigem homologação adicional.

## 6. Remoção/rollback

O rollback seguro do **código** é voltar ao commit anterior e manter `ENABLE_REFUNDS=false`. **Não apague a migration 008, nem a tabela** se existirem operações registradas. Reembolsos já processados no Mercado Pago não são revertidos pelo rollback do código.
