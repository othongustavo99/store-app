# Frequência40 Store App — Fase 5.10
## Diagnóstico de implantação por loja (ERP/PDV)

Esta entrega acrescenta um **checklist operacional de exportação de pedidos** por integração. Não registra, altera ou confirma pedidos e não liga conectores automaticamente.

### Conteúdo

- `backend/src/services/external_integration_readiness.ts` — avaliador puro das condições técnicas;
- `backend/src/routes/external_integration_readiness.ts` — rota administrativa protegida para diagnóstico;
- `backend/src/routes/external_integrations.ts` — registro da nova rota, preservando as demais;
- `backend/src/tests/external_integration_readiness.test.ts` — sete testes de regras e autorização;
- `lib/data/repositories/railway_integrations_repository.dart` — método de consulta;
- `lib/features/admin/integrations/railway_integrations_screen.dart` — botão e diálogo de diagnóstico;
- `test/phase510_readiness_screen_test.dart` — teste de interface adicional.

### Instalação no Windows

1. Preserve um commit de segurança e backup do banco.
2. Extraia o ZIP na raiz `loja_roupas`, sem criar pastas adicionais e mantendo a estrutura interna.
3. A partir **da raiz** do projeto, execute:

```powershell
cd backend
npm ci
npm run build
npm test
node --test connectors/shared/test/*.test.mjs connectors/bling/test/*.test.mjs connectors/omie/test/*.test.mjs connectors/olist/test/*.test.mjs
cd ..
flutter pub get
flutter analyze
flutter test test/phase510_readiness_screen_test.dart
flutter test
```

> O PowerShell do Windows nem sempre expande `*.mjs` nos comandos Node como o Bash. Se não funcionar, execute `node --test` dentro de cada pasta `backend/connectors/<fornecedor>` e `backend/connectors/shared`.

### Railway

- **Nenhuma variável nova.** Mantenha as existentes.
- **Nenhuma migration nova.** Depende das migrations **019 a 023** já instaladas.
- **Não habilite** `ENABLE_EXTERNAL_INTEGRATIONS` antes de homologar o banco e o acesso.
- Com a flag desativada, o diagnóstico também permanece desativado (HTTP 503).
- Não é necessário adicionar tokens Omie/Bling/Olist ao backend central.

### Endpoint administrativo

`GET /v1/stores/:storeId/integrations/:integrationId/readiness`

Requer sessão do **OWNER** da loja, com filtro em banco para a mesma loja e integração. Não aceita token de ERP em vez de sessão administrativa. Não expõe credenciais, CPF, nome ou documento fiscal.

Exemplo **ilustrativo** de resposta:

```json
{
  "provider": "bling",
  "status": "NEEDS_ACTION",
  "homologated": false,
  "scope": "ORDER_EXPORT",
  "counts": { "activeVariants": 2, "mappedVariants": 1, "unmappedVariants": 1, "deadEvents": 0 },
  "checks": [
    { "code": "ACTIVE", "ok": true, "detail": "Credencial ativa nesta loja." },
    { "code": "CATALOG_MAPPED", "ok": false, "detail": "1 de 2 variantes ativas vinculadas ao ERP." }
  ]
}
```

### Verificações do checklist

1. Credencial não revogada.
2. Permissões para pedidos, eventos, dados do comprador e retorno de vínculo/status.
3. Modo de entrega com lease (`LEASED`).
4. Variações ativas vinculadas por identificador externo.
5. Nenhum evento `DEAD` na fila dessa integração.
6. Último relatório do **worker** recente e classificado `OK`.

Esse checklist é conservador e focado em exportação de **pedidos**. Conectores apenas de catálogo podem operar com menos permissões; a tela não considera esse cenário pronto para exportar pedidos.

**Importante:** `CHECKLIST_OK` **não significa** que o ERP esteja online, homologado, que a API externa aceite todos os campos ou que a loja esteja apta a emitir notas fiscais. É indispensável um piloto com conta real, mapeamento de tributos, conferência de estoque e testes de pagamentos, cancelamentos e recuperação de falhas.

### Testes executados neste ambiente

- Backend: TypeScript compilado + **199/199 testes** aprovados.
- Conectores: **118/118 testes** aprovados.
- Flutter: SDK não disponível no ambiente de preparação; `flutter analyze` e testes Flutter **pendentes no Windows**.
- PostgreSQL real: nenhum deploy nem query do novo endpoint foi executado num banco real; esta entrega não inclui migration.

### Mudanças deliberadamente NÃO realizadas

Não houve mudança de regras de pagamento, checkout, alteração de estoque, emissão fiscal, geração de credenciais, processamento de fila ou integração direta com fornecedores externos.
