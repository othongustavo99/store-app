# Integrações comerciais | Fase 5.4 — Exportação de pedidos

## Objetivo

Adicionar a primeira execução **assistida** de envio de pedidos Store App -> ERP, separada das integrações de catálogo. O destino inicial é a API V3 Olist/Tiny. Os conectores Omie e Bling permanecem com leitura de catálogo/estoque (fases anteriores).

## Fluxo

1. Operador escolhe pedidos específicos e mapeia `idContato` do ERP para cada `orderId`.
2. `GET /v1/external/orders/{uuid}` traz snapshot e `externalVariantId` no escopo da integração Olist.
3. Validações: pedido pago e aprovado, não-demonstrativo, retirada local, GTIN não é usado como identidade, IDs ERP numéricos existentes, aritmética integral de centavos (soma das linhas = subtotal e subtotal + frete - desconto = total).
4. `GET /v1/external/orders/{uuid}/sync` verifica vínculo já existente e impede nova criação.
5. Journal persistente por loja registra `CREATE_IN_FLIGHT` **antes** do POST de criação. Sem retries automáticos de criação no ERP.
6. Em sucesso, salva `erpId` em estado `CREATED`. Consulta GET Olist e compara `numeroOrdemCompra` com `F40-{uuid}`.
7. Envia vínculo via `POST /v1/external/orders/{uuid}/sync`, com `eventId` fixo por operação, `sourceVersion` e `externalStatus: RECEIVED`. O backend verifica permissão `orders.write` e idempotência.
8. Somente após resposta confirmada grava `LINKED` no journal. Eventos/atualizações posteriores e reprocessamento contínuo são outra etapa.

## Entrega ao menos uma vez e incerteza de criação

O fornecedor não foi confirmado como disponibilizando uma chave única de idempotência na criação. Após uma solicitação POST de resultado desconhecido, nunca repetir a criação cegamente. O journal impede reenvio. O operador verifica o ERP pelo número de origem e usa `--reconcile`. Caso haja divergência, paralisa a integração e investiga.

## Limitações

- Operação manual/selecionada; não lê ou confirma automaticamente eventos da fila LEASED.
- Somente Olist/Tiny, e ainda não homologado em conta real.
- Somente pedidos de retirada, com contato do ERP vinculado manualmente.
- Sem sincronização de pagamentos, NF-e/NFC-e, status logísticos, devoluções ou mudanças posteriores.
- Nenhum ajuste de estoque ou pagamento disparado por nosso código; configurações internas do ERP podem ter gatilhos e precisam ser verificadas.

## Fontes de API consultadas em novembro de 2026

- Olist ERP V3 criar pedido: https://skmtc.dev/olist/apis/olist-erp-api-v3/docs/pedidos/post
- Olist ERP V3 obter pedido: https://skmtc.dev/olist/apis/olist-erp-api-v3/docs/pedidos/:idPedido/get
- Olist ERP V3 listar pedidos: https://skmtc.dev/olist/apis/olist-erp-api-v3/docs/pedidos/get
- Ajuda Olist API V3: https://ajuda.olist.com/pt_BR/hubs-e-plataformas-via-api/aplicativos-api-v3-configuracoes-e-utilizacao

**ATENÇÃO:** testes locais usam respostas simuladas. O payload de criação, permissões e regras de gatilhos devem ser homologados com um estabelecimento de teste antes do lançamento.
