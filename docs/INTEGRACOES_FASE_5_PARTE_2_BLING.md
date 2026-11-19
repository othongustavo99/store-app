# Store App | Fase 5 Parte 2: Bling ERP v3

## Escopo implementado

Novo conector isolado em `backend/connectors/bling`, construido sobre APIs externas existentes do Store App:

- OAuth 2.0 Authorization Code e refresh rotativo do Bling, com `enable-jwt: 1`.
- Autorizacao via listener loopback **somente se callback local for aceito/cadastrado**; alternativa com URL de retorno HTTPS manual.
- Consulta por ID em `GET /Api/v3/produtos/{idProduto}`.
- Consulta opcional de saldo fisico total `GET /Api/v3/estoques/saldos?idsProdutos[]=ID`.
- Transformacao com validacao de campos e escrita controlada em `POST /v1/external/catalog/products/upsert`.
- Consulta do vinculo por `GET /v1/external/catalog/variants` e atualizacao opcional via `PUT /v1/external/inventory/{variantId}`.
- `eventId` duravel e `sourceVersion` crescente, reenvio idempotente, hashes de alteracao, travamento de execucao e logs sem credenciais.
- Preview padrao; apply exige dois opt-ins (flag `--apply` e `F40_APPLY=CONFIRMO_SINCRONIZACAO`).

## Fora do escopo

Pedidos Store -> Bling, clientes, pagamentos, notas fiscais, status logistico, webhooks Bling e importacao de grades. Suporte a multiplos depositos exige modelagem adicional. Nenhum componente antigo foi modificado e nenhuma migration foi criada.

## Proximo trabalho recomendado

Criar processamento de pedidos do Store App no Bling com mapeamento fiscal e de contatos, sem duplicar vendas. Antes disso homologar o conector atual numa conta de testes e validar como o saldo fisico deve ser atribuido a cada filial/deposito. A API oficial permite webhooks assinados via HMAC SHA-256; o receptor futuro devera verificar `X-Bling-Signature-256` sobre o corpo bruto, enfileirar o evento e processar fora da requisicao, respondendo em ate 5s.

## Referencias

- https://developer.bling.com.br/aplicativos
- https://developer.bling.com.br/migracao-jwt
- https://developer.bling.com.br/bling-api
- https://developer.bling.com.br/limites
- https://developer.bling.com.br/webhooks
