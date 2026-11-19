# Store App — Atualização Fase 1: Integrações ERP/PDV

**Entrega incremental — NÃO é um projeto completo para substituir seu Store App.**

## Arquivos

Coloque todos os arquivos incluídos neste pacote na raiz da pasta `loja_roupas/`, mantendo a mesma estrutura. Substitua somente os arquivos com o mesmo caminho. Os demais permanecem intactos. Não remova arquivos do projeto original.

### Atualizados

- `backend/src/app.ts`: registra as novas rotas.
- `backend/src/config.ts`: flag `ENABLE_EXTERNAL_INTEGRATIONS` (inicia desativada).
- `backend/.env.example`: exemplo da flag, sem credenciais reais.

### Novos

- `backend/migrations/019_external_integrations.sql`: tabelas de conexões, mapeamentos, saldos, operações e eventos transacionais.
- `backend/src/integrations/core.ts`: credenciais e contrato auxiliar.
- `backend/src/routes/external_integrations.ts`: gestão pelo proprietário e APIs externas.
- `backend/src/tests/external_integrations.test.ts`: 10 testes automatizados da integração.
- `docs/INTEGRACOES_FASE_1.md`: documentação e sequência completa de ativação.
- `docs/openapi_external_v1.yaml`: contrato OpenAPI 3.0 importável em ferramentas de API.
- `MANIFESTO_FASE_1_INTEGRACOES.json`: lista dos arquivos e seus objetivos.

## Ordem de aplicação

1. Faça backup do banco Railway e commit da versão anterior.
2. Crie uma branch separada antes de aplicar o ZIP.
3. Copie os arquivos deste pacote para a raiz do projeto, preservando os demais.
4. Rode no terminal: `cd backend`, `npm ci`, `npm run build`, `npm test`.
5. No Railway, no primeiro deploy **deixe** `ENABLE_EXTERNAL_INTEGRATIONS=false`. O Dockerfile atual aplica a migration 019 na inicialização (consulte os logs do deploy).
6. Verifique a saúde da API, os logs da migration e os fluxos atuais de checkout/catálogo.
7. Valide as novas rotas com PostgreSQL de homologação e somente **depois** habilite `ENABLE_EXTERNAL_INTEGRATIONS=true`.

**Não rode testes de saldo/estoque em loja real. Não salve tokens `f40i_` no aplicativo Flutter e não commite `.env`.**

A próxima fase acrescentará criação/atualização de catálogo por ERP, sincronização de preços, códigos GTIN e resolução de conflitos. Nenhum ERP específico foi homologado ainda.
