# Fase 5.6 — fila LEASED para envio seguro de pedidos

## Contrato de claim (aditivo)

`POST /v1/external/events/claim` (Bearer `events.read`, integracao em modo `LEASED`)

```json
{"limit":5,"types":["order.changed"]}
```

O campo `types` e opcional para clientes existentes. Aceita tipos conhecidos de eventos e rejeita valores duplicados, desconhecidos e arrays vazios. O filtro se aplica **tanto** a materializacao de entregas quanto a selecao de eventos pendentes. Portanto o worker de pedidos nao recebe ou faz ACK de eventos de produtos/variantes. `ACK` e `NACK` permanecem conforme o contrato da Fase 4. A chamada nao cria pedidos diretamente.

## Fluxo do worker

```text
Config habilitada + API autorizada + LEASED
  -> claim somente order.changed
  -> confirmar pedido autorizado no arquivo de configuracao
  -> consultar estado atual do pedido no Store App
  -> PENDING_PAYMENT: ACK sem exportar (aguarda futuro evento)
  -> PAID + APPROVED: executar exportador assistido da F5.4/F5.5
  -> obter ID do ERP e registrar vinculo de volta na Store App
  -> ACK pelo lease
  -> qualquer resultado incerto: NACK irreversivel / fila DEAD para conferencia
```

Os exportadores guardam estado persistente **antes** do POST de criacao e impedem reenvio cego. Se a resposta do ERP se perder, **nao** criar o mesmo pedido de novo. Conferir no ERP por referencia `F40-{orderId}`, conciliar com o procedimento da fase anterior e somente entao reabrir o evento em `POST /v1/stores/:storeId/integrations/:integrationId/events/:eventId/retry` (OWNER).

## Variaveis do worker (nao do backend)

| Variavel | Objetivo |
| --- | --- |
| `F40_QUEUE_ENABLED` | `SIM_HOMOLOGADO` para permitir operacao |
| `F40_APPLY` | `CONFIRMO_ENVIO_PEDIDOS` |
| `F40_ORDER_PROVIDER_CONTRACT_CONFIRMED` | `SIM_HOMOLOGACAO` |
| `F40_QUEUE_BATCH_LIMIT` | 1..10, padrao 5 |
| `F40_QUEUE_INTERVAL_MS` | 5000..60000, padrao 10000 |
| `F40_API_URL`, `F40_INTEGRATION_TOKEN` | Endpoint HTTPS da API e credencial daquela loja |
| `F40_ORDER_STATE_FILE` | Arquivo absoluto, privado e persistente para idempotencia |

Configurar ainda os parametros de cada fornecedor, conforme os manuais anteriores. Nao usar a mesma credencial/estado para varias lojas; aplicar controle de acesso aos arquivos de estado, que podem conter referencias de pedidos.

## Observabilidade

- `GET /v1/stores/:storeId/integrations/:integrationId/delivery` mostra quantidade por estado e falhas para o proprietario.
- Eventos de pagamentos pendentes sao ACKed sem criar pedidos, porque um novo `order.changed` sera emitido quando seu status mudar.
- Eventos sem aprovacao e erros nao recuperaveis ficam em `DEAD`. O operador deve analisar e corrigir o mapeamento antes de reprocessar.
- Os logs imprimem apenas codigos de erro e IDs internos, nao incluem contatos, tokens nem corpos fiscais.

## Limites

A operacao automatica nao esta homologada com ERPs reais. Nenhuma nota fiscal e emitida, nenhum pagamento e confirmado no ERP e nenhum controle de estoque externo e escrito por este worker. O envio posterior de cancelamentos, faturamento e atualizacoes de status deve ser tratado em etapas seguintes. Evite habilitar essa fila em producao ate testar ponta a ponta com uma conta ERP real, dados de homologacao e armazenamento persistente confiavel.
