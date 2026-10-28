# Fase 4.3 — Atendimento e acompanhamento do pedido (Railway)

## Base e objetivo

Partir da Fase 4.2 aplicada (incluindo correção do inventário). Essa fase **não substitui** a estrutura Flutter atual nem os dados do PostgreSQL. Introduz central de atendimento por loja/conta e histórico verificável dos estados do pedido para **retirada na loja**.

### O que está incluído

- `support_tickets` e `support_messages` no PostgreSQL; migration `006_support_center.sql` (não alterar migrations existentes).
- API de atendimentos do comprador e da equipe, com controle de acesso no servidor.
- Assuntos e mensagens validados, proteção básica por rate limit, quantidade limitada de chamados abertos, fechamento/reabertura, auditoria do fechamento.
- Eventos privados de atualização via PostgreSQL LISTEN/NOTIFY e SSE; as mensagens são consultadas por endpoint autenticado e **nunca trafegam no NOTIFY**.
- Telas Flutter de abertura, listagem, mensagens, encerramento e resposta; chat do Firebase segue apenas no modo Firebase.
- Linha do tempo dos pedidos com base em `order_events`, sem prometer rastreamento de transportadora.

### Limitações intencionais desta etapa

- O checkout da Fase 3 ainda é exclusivamente **PICKUP** (retirada). Não há frete nem integração com transportadora.
- O backend do Mercado Pago só pode cobrar a loja piloto configurada. Não altere esse limite.
- A conversa não possui envio de anexos, notificações push nem moderação automatizada; serão entregas futuras.
- O acompanhamento é dos estados confirmados pelo backend, não GPS em tempo real.
- A lista de chamados é limitada aos 100 mais recentes e cada conversa retorna até 200 mensagens mais recentes; paginação completa é necessária antes de grande escala.
- Os testes unitários não substituem testes de integração contra PostgreSQL e testes de interface Flutter.

## Arquivos

### Adicionar

- `backend/migrations/006_support_center.sql`
- `backend/src/routes/support.ts`
- `backend/src/routes/fulfillment.ts`
- `backend/src/services/support_inputs.ts`
- `backend/src/tests/support_inputs.test.ts`
- `lib/data/repositories/railway_support_repository.dart`
- `lib/features/support/railway_support_screen.dart`
- `lib/features/support/railway_support_conversation_screen.dart`
- `lib/features/support/railway_order_timeline_dialog.dart`
- `docs/FASE_4_3_ATENDIMENTO_E_ACOMPANHAMENTO.md`

### Substituir pelos arquivos completos

- `backend/src/app.ts`
- `backend/src/routes/catalog.ts`
- `lib/core/network/loja_api.dart`
- `lib/data/repositories/railway_order_repository.dart`
- `lib/features/client/orders/railway_orders_screen.dart`
- `lib/features/admin/orders/railway_admin_orders_screen.dart`
- `lib/features/admin/remote_admin_home.dart`
- `lib/router/app_router.dart`

### Remover

Nenhum. Não exclua arquivos Firebase ainda nem pastas como `lib/features/client/chat`.

## Aplicação local (PowerShell)

1. Faça backup/Git commit da versão atual.
2. Extraia o ZIP na pasta **acima** da raiz `loja_roupas/`, mantendo a estrutura e substituindo os arquivos correspondentes.
3. Na raiz `loja_roupas`, execute:

```powershell
cd backend
npm ci
npm run build
npm test
cd ..
flutter pub get
flutter analyze
```

Se houver erros, corrija antes de publicar. Não edite migrations já executadas.

## Deploy Railway

```powershell
git add backend lib docs
git commit -m "feat: fase 4.3 atendimento e acompanhamento"
git push origin master
```

Em Railway > `store-app` > Deployments > Deploy Logs, procure:

```
Aplicada: 006_support_center.sql
```

Se o serviço reiniciar, a API vai reabrir a conexão PostgreSQL LISTEN de notificações.

Não são necessárias novas variáveis de ambiente. O servidor precisa continuar com `DATABASE_URL`, `JWT_SECRET`, a porta pública correta (a do serviço) e a configuração já adotada nas fases anteriores.

Teste a disponibilidade:

```
https://store-app-production-c741.up.railway.app/health/ready
```

Se falhar, verifique Deploy Logs, healthcheck, porta pública e `DATABASE_URL` (não divulgue segredos).

## Executar o aplicativo Windows

```powershell
flutter run -d windows `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

Troque `SEU-SLUG` pelo slug que realmente existe no banco. Executar sem essas defines fará o app entrar no modo Firebase legado.

## Fluxo de testes (duas contas, sem pagamentos reais)

1. Entre como cliente da loja. Na vitrine, pressione **Chat com a loja**, ou vá a **Meus pedidos > Preciso de ajuda**.
2. Crie um atendimento com assunto e mensagem. Confirme que consta como aberto.
3. Em outro dispositivo, entre com uma conta `OWNER`, `MANAGER` ou `STAFF` vinculada à **mesma loja**.
4. No painel administrativo, abra **Atendimento ao cliente**, selecione o chamado e responda.
5. Sem reiniciar a aplicação cliente, confira a atualização. Teste também desconexão e retorno da internet.
6. Encerre como equipe. O cliente deve ver o status, mas não pode reabrir por conta própria.
7. Reabra pela equipe e envie nova mensagem. Confira se ambos os lados receberam.
8. Entre com um **segundo cliente**. Ele não deve conseguir ver a conversa do primeiro, mesmo informando manualmente a URL/UUID do chamado.
9. Entre como equipe de **outra loja**. O acesso ao ticket deve falhar (404/403, conforme a rota).
10. Abra **Meus pedidos > Acompanhar** e, como administrador, **Pedidos > Histórico**. Confira que ambos exibem o mesmo conjunto de eventos do servidor.
11. Caso não haja pedidos pagos de teste, não marque artificialmente um pedido como pago. O histórico só terá eventos reais dos pedidos já existentes.

## Controle de segurança

- Todas as consultas e mutações conferem identidade, loja e propriedade do chamado no PostgreSQL.
- `ticketId`, `storeId`, `customerId` e autor nunca são aceitos do cliente como campos de autorização.
- SSE emite somente `changed`, nunca mensagens, emails, telefone ou tokens.
- Não habilite `ALLOW_STORE_SELF_SERVICE` durante a operação comercial.
- Antes de vender a plataforma: implementar verificação de email, retenção/exclusão de dados conforme LGPD, proteção anti-abuso, paginação completa, observabilidade e testes automatizados com banco real.
