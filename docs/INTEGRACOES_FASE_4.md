# Frequência40 — Fase 4: fila operacional e conectores ERP/PDV

## Escopo

Entrega incremental sobre as fases 1, 2 e 3. O objetivo é tornar a **entrega de eventos** tolerante a falhas, com leasing, confirmação idempotente, repetição gradual e monitoramento por loja. Não altera checkout, pagamentos, emissão fiscal, código Flutter ou estoque.

**Não foi homologado nenhum ERP/PDV comercial nesta fase.** O worker de referência é uma infraestrutura de adaptação, não um conector pronto para Bling, Omie, Olist/Tiny, TOTVS ou outros fornecedores. Cada API externa, suas permissões, limites, autenticação e regras de negócio ainda deverão ser implementadas e testadas.

## Compatibilidade e ativação

- `022_external_event_delivery.sql` adiciona `delivery_mode` e a tabela de entregas. O modo inicial de **todas as integrações existentes** é `POLL`. Nada muda automaticamente no consumo legado `GET /v1/external/events` + `POST /v1/external/events/ack`.
- O proprietário ativa `LEASED` por integração, **explicitamente**. Antes da ativação: pause o worker antigo, confira seus ACKs pendentes, substitua-o pelo novo consumidor e só depois habilite o novo modo, em uma janela controlada.
- Após a ativação, o consumo legado da integração devolve **409**; deve-se utilizar a nova API de lease. Não existe desativação automática nesta fase, pois a troca reversa pode provocar processamento duplicado.
- Event IDs pertencem a um único estabelecimento. Uma integração não consegue reivindicar eventos de outra loja. Eventos originados no próprio conector são ignorados.
- Autenticação e escopo `events.read` continuam sendo os da Fase 1. Não há novas permissões nem variáveis de Railway **no backend**.

## Fluxo de consumo (modo LEASED)

1. O conector chama `POST /v1/external/events/claim` com `{ "limit": 10 }`, usando `Authorization: Bearer f40i_...`.
2. A resposta contém `events[]` com `id`, `type`, `resourceId`, `attempts`, `leaseToken` e `leaseExpiresAt`. O lease vale **300 segundos**. `limit` aceita de 1 a 30.
3. Para `order.changed`, consultar `GET /v1/external/orders/{resourceId}`; para `catalog.product.changed`, consultar `GET /v1/external/catalog/products/{resourceId}`; para `catalog.variant.changed`, consultar `GET /v1/external/catalog/variants/{resourceId}`. Outras categorias só devem ser tratadas quando o adaptador suportá-las. Buscar os dados pessoais do comprador exige o escopo separado `orders.customer.read`.
4. O conector grava a ação no ERP **com idempotência própria**, usando como chave imutável o ID do evento e/ou pedido Store App. A criação de pedidos externos, por exemplo, precisa consultar o ERP após timeout, evitando duplicação.
5. **Somente após confirmar que o ERP persistiu a operação**, o conector envia `POST /v1/external/events/{eventId}/ack` com `{ "leaseToken": "f40l_..." }`. Repetir um ACK bem-sucedido com o mesmo token é seguro: resposta `idempotent:true`.
6. Se falhar, chama `POST /v1/external/events/{eventId}/nack` com `{ "leaseToken": "f40l_...", "code": "ERP_TIMEOUT", "retryable": true }`. O campo `code` só aceita letras maiúsculas, números e underscore (3 a 48 caracteres), **não mensagens livres, nomes ou dados pessoais**.
7. Após NACK temporário, o evento retorna para a fila com intervalos de 5, 10, 20, 40... segundos; depois de **8 tentativas**, vai a `DEAD` para análise. Falhas permanentes podem usar `retryable:false`. Se o processo morrer sem NACK, o lease expira e o evento poderá ser reivindicado outra vez; ao chegar ao limite de tentativas, vai a `DEAD`.

**Propriedade da entrega:** ao menos uma vez (*at-least-once*), nunca *exactly-once* entre bancos independentes. O adaptador externo **precisa** garantir idempotência no ERP/PDV. Uma requisição ACK não confirma pagamento, não emite notas e não altera estoque por si só.

### Exemplos HTTP

```http
POST /v1/external/events/claim
Authorization: Bearer <TOKEN_F40I>
Content-Type: application/json

{"limit":10}
```

```json
{
  "events": [{
    "id":"123",
    "type":"order.changed",
    "resourceId":"3c61a941-672c-4719-b0de-491fcfc7be7a",
    "attempts":1,
    "leaseToken":"<TOKEN_F40L_ENTREGUE_PELA_API>",
    "leaseExpiresAt":"<DATA_UTC_DA_API>"
  }],
  "leaseSeconds":300,
  "maxAttempts":8
}
```

```http
POST /v1/external/events/123/ack
Authorization: Bearer <TOKEN_F40I>
Content-Type: application/json

{"leaseToken":"<TOKEN_F40L_ENTREGUE_PELA_API>"}
```

```http
POST /v1/external/events/123/nack
Authorization: Bearer <TOKEN_F40I>
Content-Type: application/json

{"leaseToken":"<TOKEN_F40L_ENTREGUE_PELA_API>","code":"ERP_TIMEOUT","retryable":true}
```

**Importante:** `leaseToken` é secreto e transitório. Nunca o grave em logs, telas Flutter ou repositórios. Se o evento for reivindicado por outro worker depois de vencer o prazo, o token anterior deixa de funcionar.

## Administração e diagnóstico

As próximas três rotas exigem JWT de usuário **OWNER**; o token de integração não serve para ativar o modo ou consultar diagnósticos administrativos.

- `POST /v1/stores/{storeId}/integrations/{integrationId}/enable-leased-delivery` — ativa o modo LEASED, sem revogar a chave da integração.
- `GET /v1/stores/{storeId}/integrations/{integrationId}/delivery?limit=20` — resumo dos estados `PENDING`, `IN_FLIGHT`, `ACKED`, `DEAD`, número de eventos ainda não materializados e erros recentes, sem informações pessoais.
- `POST /v1/stores/{storeId}/integrations/{integrationId}/events/{eventId}/retry` — permite reenfileirar **apenas** evento `DEAD`, após corrigir a causa. A ação é registrada em auditoria.

O número de eventos ainda não materializados não significa necessariamente erro: eventos novos são materializados sob demanda na próxima chamada `claim`. Reprocessamentos por erro de negócio exigem avaliação das operações no ERP antes de usar `retry`.

## Executor genérico de referência

Arquivos incluídos:

- `backend/connectors/reference/worker.mjs` — executor Node 22 que usa `claim`, chama um adaptador externo e só envia ACK se o adaptador devolver `{committed:true}`.
- `backend/connectors/reference/adapter.example.mjs` — **exemplo propositalmente desabilitado**. Copie para outro arquivo, implemente a API do ERP escolhido e apenas então altere `ready` para `true`.

O worker requer um processo/serviço **separado** do serviço principal da API (pode ser outra instância Railway ou um servidor próprio). Não execute múltiplas cópias sem configurar a idempotência do ERP.

Variáveis exclusivas do **worker**, não do backend da Railway:

| Variável do worker | Exemplo / descrição |
| --- | --- |
| `F40_API_URL` | `https://sua-api.up.railway.app/` |
| `F40_INTEGRATION_TOKEN` | segredo `f40i_...` de uma loja, somente no servidor |
| `F40_ADAPTER_FILE` | caminho absoluto para o módulo adaptador implementado |
| `F40_POLL_INTERVAL_MS` | opcional, 2000 a 60000; padrão 10000 |
| `F40_BATCH_LIMIT` | opcional, 1 a 30; padrão 10 |
| `F40_ONCE` | opcional; `true` processa somente um lote e encerra |

O `worker.mjs` valida que o adaptador declarou `ready=true` **antes de buscar eventos**, evitando ACK acidental pelo adaptador-exemplo. Exige HTTPS para o backend (HTTP apenas localhost para testes). Toda chamada `getStoreResource()` deve apontar para rota `/v1/external/`. O worker passa `abortSignal` com prazo de 240 segundos ao adaptador; o adaptador deve respeitar esse sinal em seus fetches e concluir a persistência antes de o lease de 300 segundos vencer.

## Checklist de homologação antes de uso comercial

1. Aplicar as migrations 019–022 em PostgreSQL de homologação, incluindo testes de FK, transação, índices e concorrência real entre dois workers.
2. Confirmar que uma integração antiga permanece em `POLL` após deploy sem mudanças funcionais.
3. Suspender o worker legado, ativar `LEASED`, processar eventos em sequência, confirmar ACK e replay de ACK, reiniciar o worker durante lease e conferir nova tentativa após 300 s.
4. Simular indisponibilidade, timeout e rate limit do ERP, observar NACK, backoff e estado `DEAD` no painel.
5. Simular duplicação de evento e de POST do ERP: não deve haver pedidos nem baixas duplicadas.
6. Testar duas lojas e duas integrações distintas para conferir isolamento, permissões e origem.
7. Exercitar inventário e pedidos com pagamentos reais apenas em ambiente controlado; testar cancelamentos, estornos, devoluções e estados fiscais nos conectores específicos.
8. Verificar políticas de backup, retenção de eventos, monitoramento e alertas. Esta fase ainda não inclui alertas automáticos nem política de expurgo.

### Limitações conhecidas

- Não há conector homologado para fornecedores ERP/PDV; o executor é uma **base** que exige implementação específica de cada fornecedor.
- Não há endpoint para criar vendas de balcão; elas permanecem no PDV/ERP, e o saldo deve ser enviado à API de estoque da Fase 1.
- Não há webhooks HTTP de saída do servidor para os fornecedores. Optamos por **pull + ACK** porque funciona com muitos sistemas sem exigir URL pública do ERP e evita problemas de SSRF com endpoints cadastrados por usuários.
- Não é garantida ordem estrita entre eventos de recursos relacionados quando há vários workers e leases. O conector deve buscar o estado atualizado e respeitar IDs/versões da origem.
- Um evento de produto fisicamente excluído pode gerar `404` na consulta posterior. O adaptador precisa decidir como refletir essa exclusão no ERP sem apagar históricos fiscais.
- Sem banco PostgreSQL real disponível nesta execução, a migration 022 não foi homologada em banco. Foram executados compilação e testes automatizados com mocks.

## Railway e proteção do ambiente

No **backend** não há variável nova: mantenha `ENABLE_EXTERNAL_INTEGRATIONS=false` no primeiro deploy, faça backup e verifique a execução de `022_external_event_delivery.sql` nos logs. A migration roda pelo processo atual do Dockerfile; não execute simultaneamente uma migration manual. Faça homologação real antes de ativar o modo LEASED.

Depois, mantenha `ENABLE_EXTERNAL_INTEGRATIONS=true` **apenas quando** o ambiente e as integrações existentes estiverem aprovados. Se existir uma credencial `f40i_` com acesso operacional, ela continua válida até revogação pelo OWNER; não cole tokens no chat.
