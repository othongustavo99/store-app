# Frequência40 — Store App: patch incremental da Fase 3

**Objetivo:** conciliar pedidos existentes do Store App com ERPs e PDVs, mantendo o checkout, pagamentos e as reservas de estoque como fonte oficial do aplicativo.

## Pré-requisitos

- Fases **1 e 2 aplicadas e validadas**, com `019_external_integrations.sql` e `020_external_catalog_sync.sql` já presentes.
- Cópia de segurança do banco PostgreSQL da Railway e um commit local de segurança.
- Aplicar o patch **sobre a raiz `loja_roupas`**, preservando as pastas. Não copiar a pasta `backend` inteira do projeto anterior nem excluir outros arquivos.
- **Atenção:** o patch substitui `backend/src/routes/external_integrations.ts`, `backend/src/integrations/core.ts` e `backend/src/tests/external_integrations.test.ts` da Fase 2. Se você fez mudanças manuais nesses arquivos depois, faça merge cuidadoso.

## Executar no VS Code (PowerShell)

Abra o terminal na raiz `loja_roupas`:

```powershell
cd backend
npm ci
npm run build
npm test
```

`npm ci` é executado **dentro de `backend`**, onde existem `package.json` e `package-lock.json`. Os testes usam `DATABASE_URL` e `JWT_SECRET` definidos no ambiente/`.env` do backend; não requerem PostgreSQL em execução porque a suíte nova simula o acesso às tabelas.

## Railway

**Não há variável nova.** Preserve as existentes. No primeiro deploy, defina `ENABLE_EXTERNAL_INTEGRATIONS=false`, faça backup e confira a migration **`021_external_order_sync.sql`** nos logs da Railway. O `backend/Dockerfile` atual executa migrations no startup; não rode migrações duas vezes por conta própria.

Em staging, após confirmar `/health/ready`, rode testes reais de API e PostgreSQL. Só então habilite `ENABLE_EXTERNAL_INTEGRATIONS=true` e conceda `orders.write` explicitamente pelo OWNER.

Para reutilizar a **mesma credencial de integração** criada nas Fases 1/2, use a rota `POST /v1/stores/{storeId}/integrations/{integrationId}/enable-orders`. Se o ERP precisar dos dados pessoais do comprador, use **separadamente** `POST /v1/stores/{storeId}/integrations/{integrationId}/enable-customer-data`.

## Arquivos entregues e funcionamento

Veja `MANIFESTO_FASE_3_INTEGRACOES.json` e `docs/INTEGRACOES_FASE_3.md`. Os novos endpoints são `GET/POST /v1/external/orders/{orderId}/sync` e `GET /v1/external/orders/{orderId}/customer`, além das duas rotas OWNER de habilitação. `docs/openapi_external_v1.yaml` foi atualizado.

A Fase 3 **não implementa um ERP ou PDV, não integra um fornecedor comercial específico, não emite notas fiscais e não confirma pagamentos**. Referências fiscais são armazenadas como informações vindas do ERP e não substituem a consulta oficial à SEFAZ. Para entrega por transportadora, continue usando o fluxo próprio de expedição.

## Estado de validação

- TypeScript compilou com sucesso.
- Testes automatizados de backend passaram (incluindo os novos testes de idempotência, isolamento, acesso a dados pessoais e transições de status).
- A migration 021 ainda **não** foi executada contra PostgreSQL real neste ambiente. A implantação comercial exige homologação no banco de staging e teste de ponta a ponta com o ERP do cliente.

**Próxima fase sugerida:** conectores de provedores concretos e sincronização operacional (incluindo rastreamento, dashboard de erros/reprocessamento e tratamento de situações de divergência fiscal/financeira), sem misturar APIs com um fornecedor específico.
