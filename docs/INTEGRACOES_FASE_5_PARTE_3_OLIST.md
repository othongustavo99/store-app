# Fase 5 Parte 3 - Olist/Tiny ERP V3

Implementado: `backend/connectors/olist/`, modulo externo e independente do Fastify, sem substituicao de arquivos existentes. Primeiro passo para compatibilidade com Olist/Tiny:

1. OAuth 2.0 Authorization Code (`state` antifornery, callback verificado) + persistencia privada de refresh token.
2. GET `/produtos/{idProduto}` da API V3, SKU (`sku`), descricao, GTIN, `precos.preco`, tipo/status.
3. GET `/estoque/{idProduto}` e importacao de `saldo` fisico somente quando ativado; bloqueia multiplos depositos e quantidade fracionaria.
4. API Store App `/v1/external/catalog/products/upsert` com eventId e sourceVersion duraveis, mapeamento por ID externo, e `/v1/external/inventory/{variantId}` para saldo.
5. Retry somente em chamadas GET ao Olist/Tiny em erros transitórios, idempotencia para chamadas de escrita ao Store App e protecao de estado em disco.
6. Modo preview padrao e apply protegido por `F40_APPLY=CONFIRMO_SINCRONIZACAO`.

**Nao implementado**: autenticação e homologacao real com seller, sincronizacao de pedidos, notas fiscais, grades, kits, varios depositos, faturamento, cron/worker, integracao de clientes ou webhooks. Continuam etapas futuras.

## Testes

```powershell
cd backend\connectors\olist
node --test
```

Este modulo nao exige `npm ci`, nao possui dependencias externas nem migrations. Ainda recomenda-se executar `npm run build` e `npm test` no `backend` apos integrar os arquivos ao projeto e antes de deploy.

**Importante:** integracao nao e universal apenas por existir API; cada cliente Olist/Tiny precisa criar app privado na propria conta, conceder permissoes e passar pelos testes de homologacao.
