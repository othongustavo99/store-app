# Frequência40 — Store App: pacote incremental da Fase 2

**Objetivo:** receber produtos, variantes e preços de ERPs/PDVs por uma API genérica e idempotente, mantendo o estoque e os pedidos do Store App intactos.

## Aplicação

1. Confirme que a **Fase 1** já foi aplicada (migration 019, endpoint `/v1/external/events`, APIs do backend), e faça **backup do banco Railway**.
2. No diretório do projeto (`loja_roupas`), crie um commit/branch de segurança.
3. Extraia este ZIP SOBRE a raiz `loja_roupas`, preservando a estrutura das pastas. Copie somente os arquivos listados no `MANIFESTO_FASE_2_INTEGRACOES.json`. **Não exclua mais nenhum arquivo.**
4. O pacote contém migration **nova** `backend/migrations/020_external_catalog_sync.sql`. Não edite ou reaplique manualmente as migrations anteriores.
5. No terminal PowerShell do VS Code, na raiz do projeto:

```powershell
cd backend
npm ci
npm run build
npm test
```

6. Em Railway ou staging, faça deploy primeiro com **`ENABLE_EXTERNAL_INTEGRATIONS=false`** e cheque se a migration 020 foi aplicada (logs de `db:migrate:prod`).
7. Teste o banco e API em **homologação**. Somente depois habilite `ENABLE_EXTERNAL_INTEGRATIONS=true` em ambiente adequado. Se sua Fase 1 estava ligada, desligue temporariamente antes da primeira implantação da Fase 2.
8. Commit quando todos os testes locais passarem e as migrations tiverem sido conferidas.

**O ZIP não contém `.env`, credenciais, `node_modules`, Flutter, builds, banco de dados nem alterações nos serviços de venda atuais.**

## Conteúdo principal

- `020_external_catalog_sync.sql`: permissões por loja, GTIN, mapeamento de produtos, versões, idempotência, origem dos eventos.
- `external_catalog_sync.ts`: validações e transação SQL atômica para produtos/variantes e preços, **sem alterar estoque**.
- `external_catalog_import.ts`: endpoints de categorias, produto único, lote e mapeamento.
- `external_integrations.ts` e `core.ts`: registro da nova permissão e leitura de GTIN.
- `external_catalog_sync.test.ts`: testes novos da importação.
- `docs/openapi_external_v1.yaml`: OpenAPI atualizado.
- `docs/INTEGRACOES_FASE_2.md`: documentação completa e exemplos de chamadas.

## Estado da entrega

- `npm run build`: compilação TypeScript validada.
- `npm test`: **159 testes aprovados** com variáveis de ambiente de teste, inclusive Fase 1 e Fase 2.
- **Não** houve execução real da migration em PostgreSQL remoto/local neste ambiente, testes com provedores ERP nem testes com hardware PDV. Não anunciar a clientes como integração homologada.

**Próximo passo (Fase 3):** contratos de pedido, vinculação ao pedido do ERP, sincronização de status de expedição/fiscal/pagamento e entrega confiável por adaptadores, sem duplicar operações financeiras.
