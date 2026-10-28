# Fase 4.5 — Pós-venda: solicitações de cancelamento, devolução e reembolso

**Base:** `loja_roupas(4).zip`; considere as Fases 0–4.4 já aplicadas.

## Objetivo e limites

Esta entrega adiciona **solicitações** de pós-venda ao Railway/PostgreSQL, vinculadas ao pedido, ao cliente e à loja, com registro de auditoria e acompanhamento no Windows/Android/iOS. A equipe administra o protocolo no painel de pedidos. Não é uma execução automática de cancelamento, devolução física nem reembolso financeiro.

**Muito importante:** `CLOSED` significa apenas *protocolo encerrado*, não significa *pagamento reembolsado*. O backend nesta etapa **não chama a API de estornos do Mercado Pago**, não altera `orders.status` para `REFUNDED` e não altera `payments.status`. Para estornar uma cobrança real, confirme a identidade e o pagamento do comprador, execute o estorno pelo painel autorizado do Mercado Pago e reconcilie o estado com as notificações do gateway antes de comunicar ao cliente que o dinheiro foi devolvido. Não use esta fase para automatizar reembolsos sem essa conciliação.

O checkout permanece restrito à loja-piloto e à retirada na loja. Frete por transportadora, emissão automatizada de estornos e recebimentos separados por lojista ficarão para as próximas etapas comerciais.

## Arquivos completos no ZIP

### Novos
- `backend/migrations/007_after_sales.sql`
- `backend/src/routes/after_sales.ts`
- `backend/src/services/after_sales_rules.ts`
- `backend/src/tests/after_sales_rules.test.ts`
- `lib/data/repositories/railway_after_sales_repository.dart`
- `lib/features/support/railway_after_sales_dialogs.dart`
- `docs/FASE_4_5_POS_VENDA_SEGURO.md`

### Substituir
- `backend/src/app.ts`
- `backend/src/routes/commerce.ts`
- `lib/data/repositories/railway_order_repository.dart`
- `lib/features/client/orders/railway_orders_screen.dart`
- `lib/features/admin/orders/railway_admin_orders_screen.dart`

### Remover
- Nenhum. **Não remova** Firebase legado, migrations antigas, arquivos de autenticação nem serviços de pagamento.

## Aplicação no VS Code

1. **Faça backup do repositório e do PostgreSQL** antes do deploy. Confirme a disponibilidade de restauração.
2. Extraia este pacote na pasta *acima* de `loja_roupas` e substitua os cinco arquivos listados. A árvore de diretórios foi mantida.
3. Na raiz `loja_roupas` abra PowerShell e execute:

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

4. Se os comandos terminarem sem erro, envie ao GitHub:

```powershell
git add backend/src/app.ts backend/src/routes/commerce.ts backend/src/routes/after_sales.ts backend/src/services/after_sales_rules.ts backend/src/tests/after_sales_rules.test.ts backend/migrations/007_after_sales.sql lib/data/repositories/railway_order_repository.dart lib/data/repositories/railway_after_sales_repository.dart lib/features/client/orders/railway_orders_screen.dart lib/features/admin/orders/railway_admin_orders_screen.dart lib/features/support/railway_after_sales_dialogs.dart docs/FASE_4_5_POS_VENDA_SEGURO.md
git commit -m "feat: fase 4.5 pos-venda seguro"
git push origin master
```

## Railway

- Projeto: abra o serviço do backend (`store-app`), usando o banco já conectado.
- **Não** crie nova variável. **Não** altere `DATABASE_URL`, `JWT_SECRET`, credenciais do Mercado Pago ou porta.
- O Dockerfile já roda as migrations antes de iniciar a API. Nos **Deploy Logs**, procure `Aplicada: 007_after_sales.sql` (ou `Já aplicada`, em deploy posterior).
- Confirme `https://SEU-DOMINIO/health/ready` devolvendo `{"status":"ready"}`.
- Para homologação financeira, **não** habilite pagamentos reais automaticamente; use a loja-piloto e o fluxo de teste já configurados na Fase 3.

## Windows (homologação)

```powershell
flutter run -d windows `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://SEU-DOMINIO.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

- Cliente → **Meus pedidos** → **Cancelamento / pós-venda** → escolhe o tipo e descreve o motivo. A solicitação fica vinculada exclusivamente ao pedido daquele usuário.
- Administrador → **Pedidos da loja** → vê cada solicitação com motivo e status → **Analisar** para registrar a próxima etapa.
- Funcionário (`STAFF`) pode consultar, mas não pode alterar a solicitação; somente `OWNER` e `MANAGER` podem mudar sua etapa, com autorização no servidor.
- A etapa final exige justificativa com pelo menos 15 caracteres, e o histórico permanece preservado.

## Verificações obrigatórias antes de considerar a fase validada

1. Use duas contas de clientes e uma conta administrativa no **ambiente de teste**.
2. Crie um pedido de teste; como cliente, solicite cancelamento com motivo. Verifique se a solicitação aparece na administração.
3. Tente enviar uma segunda solicitação enquanto a primeira está aberta; o backend deve recusar com `409`.
4. Enquanto o cancelamento estiver em análise, o cliente **não deve obter novo link de pagamento pelo aplicativo**, e o administrador não deve conseguir avançar o pedido para preparação/retirada. **Importante:** um link de pagamento já emitido pode continuar válido externamente; confirme status financeiro com o gateway.
5. Como gerente, marque `IN_REVIEW` e depois `MANUAL_ACTION`; verifique se o cliente vê a atualização e a observação pública.
6. Confira que tentar acessar solicitações da segunda conta ou outra loja não expõe dados.
7. Confira que um funcionário `STAFF` não consegue concluir solicitações.
8. Confira que a coluna `orders.status`, o saldo do estoque e `payments.status` **não mudaram** apenas porque um protocolo foi aberto/encerrado.
9. Verifique os registros em `after_sales_events` e `audit_logs`.

### Segurança operacional

- As observações administrativas aparecem para o cliente; não registre senhas, dados de cartão, tokens ou detalhes confidenciais nessas mensagens.
- **Reembolsos e devoluções reais** ainda exigem procedimentos financeiros e logísticos separados. Não marque o protocolo como encerrado antes de atender efetivamente à solicitação.
- Quando houver pagamento contestado ou já aprovado, primeiro verifique o status no gateway. Não libere estoque nem prometa dinheiro devolvido somente com base na solicitação.
- As transições e o histórico são persistidos no PostgreSQL e as telas são atualizadas via SSE (somente aviso; dados completos sempre consultados na API autenticada).
- Em rollback de aplicativo, **não apague** a migration 007 nem as tabelas com histórico. Restaure código anterior; migrações novas são cumulativas.

## Próximas entregas comerciais

- **Fase 4.6:** cancelamento/reembolso efetivo com conciliação do Mercado Pago, política de devolução e bloqueios de estoque.
- **Fase 4.7:** cálculo de frete real, etiquetas, transportadoras e rastreamento, conforme operadores escolhidos.
- **Fase 4.8:** credenciais e recebimentos isolados por loja, onboarding de lojistas, reconciliação e faturamento.
- Depois, acabamento de UX, acessibilidade, testes de integração/carga e conformidade Play Store/App Store.

## Validação de criação

No ambiente em que este ZIP foi produzido, o backend TypeScript compilou e **26 testes unitários passaram**. Não foram executados build Flutter, migrations em PostgreSQL real, testes de integração de duas contas ou pagamentos reais; valide-os na sua máquina e ambiente de homologação.
