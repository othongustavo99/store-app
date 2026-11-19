# Frequência40 — Store App: Integrações ERP/PDV — Fase 1

**Data da entrega:** 19/11/2026  
**Base:** ZIP `loja_roupas(20261119-115312).zip`  
**Escopo implementado:** fundação segura da API externa, leitura de catálogo/pedidos, IDs de terceiros, ingestão controlada de saldos e fila de eventos com confirmação.

## O que esta fase realmente entrega

- Integrações separadas por estabelecimento; credenciais aleatórias **mostradas uma única vez** e armazenadas somente como hash SHA-256 de chave de alta entropia.
- Somente `OWNER` cria, lista e revoga credenciais. Rotas externas exigem a chave, nunca o JWT do cliente.
- Escopos: `catalog.read`, `orders.read`, `events.read`, `mapping.write` e opcionalmente `stock.write`.
- Uma única integração ativa com `stockAuthority=true` por loja.
- Catálogo de variantes completo, inclusive itens inativos/arquivados; consulta de produto/variante por ID; SKU e mapeamento de ID externo.
- Pedidos e seus itens para leitura, com paginação estável por data + UUID (microssegundos preservados); consulta por ID; **sem dados pessoais de clientes nesta fase**.
- Atualização de estoque físico absoluto (`onHand`) por versão externa monotônica e `eventId` UUID idempotente; preserva `reserved` e rejeita `onHand < reserved`.
- Outbox transacional de alterações de produtos, variantes, pedidos e itens. Eventos ficam pendentes **até confirmação explícita (ACK)** por integração, evitando pular transações que foram confirmadas depois de outras.
- Auditoria das criações/revogações e de saldos recebidos.
- Flag `ENABLE_EXTERNAL_INTEGRATIONS=false` por padrão; funcionalidades atuais do app não passam a depender da integração.

> **NÃO** significa integração certificada ou funcionando automaticamente com todos os ERPs: a camada é genérica. Adaptadores por fornecedor são fases posteriores. Sem testes reais em banco PostgreSQL e homologação por ERP/PDV, não ativar dados de produção.

## Instalação e implantação segura

1. Faça backup do banco Railway e anote a versão/commit anterior. Trabalhe em uma branch (`git checkout -b feature/erp-integrations-phase1`).
2. Copie **somente** os arquivos do ZIP de atualização sobre a raiz `loja_roupas/` (sem apagar outras pastas). **Não copie `node_modules`, `.env` nem artefatos gerados**: o patch não contém nenhum desses arquivos.
3. Confira `backend/.env.example`: a nova flag inicia `false`. No Railway mantenha `ENABLE_EXTERNAL_INTEGRATIONS=false` no primeiro deploy.
4. `cd backend`, execute `npm ci`, `npm run build`, `npm test` (os testes usam variáveis de teste válidas; veja `backend/.env.example`).
5. Revise a migration **nova** `backend/migrations/019_external_integrations.sql`; **não altere** as migrations `001` a `018`.
6. O `backend/Dockerfile` já roda `node dist/db/migrate.js` antes de iniciar a API no Railway. Publique primeiro a versão com a flag desativada e confirme nos logs `Aplicada: 019_external_integrations.sql` e `/health/ready` OK.
7. Faça testes de integração em banco de homologação; com sucesso, habilite `ENABLE_EXTERNAL_INTEGRATIONS=true` na API e implante novamente. Não gere chave de produção antes dos testes.
8. Guarde o primeiro token de integração em cofre de segredos **do servidor adaptador**, nunca no Flutter, no GitHub ou em prints/contratos. Trabalhe exclusivamente sobre HTTPS.

### Teste local rápido (PowerShell)

```powershell
cd backend
$env:DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/BANCO"
$env:JWT_SECRET="UM_SEGREDO_ALEATORIO_VALIDO_COM_NO_MINIMO_43_CARACTERES"
$env:ENABLE_EXTERNAL_INTEGRATIONS="false"
npm ci
npm run build
npm test
```

O exemplo acima exige **banco PostgreSQL acessível** apenas para rotas que realmente o consultem; a compilação e os testes unitários existentes simulam o acesso ao banco. Para testar migrations, configure **ambiente de homologação** e rode `npm run db:migrate`. Nunca rode contra produção sem backup e janela planejada.

> Especificação legível por ferramentas: `docs/openapi_external_v1.yaml` (OpenAPI 3.0.3).

## Autenticação, endpoints e contratos

Base: `https://SUA_API_RAILWAY` (substitua apenas pelo endereço real). Todas as requisições externas usam `Authorization: Bearer f40i_...` e JSON. Não passe token em URL/querystring.

### Gestão por proprietário (JWT normal do Store App)

| Método | Caminho | Efeito |
|---|---|---|
| POST | `/v1/stores/{storeId}/integrations` | Cria conexão e retorna **token uma vez** |
| GET | `/v1/stores/{storeId}/integrations` | Lista integrações sem segredo |
| POST | `/v1/stores/{storeId}/integrations/{integrationId}/revoke` | Revoga imediatamente o token |

Corpo de criação:

```json
{"name":"ERP da loja","provider":"generic","stockAuthority":true}
```

- `provider` identifica o tipo do conector; não ativa integração com um fornecedor automaticamente.
- `stockAuthority:true` habilita o escopo `stock.write` para a **única** integração escritora de estoque da loja.
- A revogação é o procedimento para rotação de credenciais (criar outra conexão depois de revogar a anterior, se for de estoque).

### API para ERP/PDV (token `f40i_`)

| Método | Endpoint | Uso |
|---|---|---|
| GET | `/v1/external/catalog/variants?limit=50&after={UUID}` | Snapshot paginado de variantes, SKU, preço em centavos e saldo |
| GET | `/v1/external/catalog/variants/{variantId}` | Consulta específica, inclusive após evento |
| GET | `/v1/external/catalog/products/{productId}` | Produto, metadados e variantes |
| PUT | `/v1/external/mappings/variants/{variantId}` | Liga `externalId` do ERP a uma variante |
| GET | `/v1/external/orders?limit=50&cursor={cursor}` | Snapshot paginado de pedidos existentes |
| GET | `/v1/external/orders/{orderId}` | Pedido atualizado, status e itens |
| GET | `/v1/external/events?limit=100` | Obtém eventos pendentes desta integração |
| POST | `/v1/external/events/ack` | Confirma eventos **após** salvar no ERP |
| PUT | `/v1/external/inventory/{variantId}` | Saldo absoluto do ERP; apenas conexão com `stockAuthority` |

Paginação: no catálogo, encaminhar `nextAfter` enquanto `hasMore=true`; nos pedidos, encaminhar `nextCursor`. Guardar o último cursor retornado. Nas leituras de eventos **não existe cursor**: o evento reaparece até o ACK.

Valores monetários são **strings representando centavos inteiros** (`"priceCents":"7990"`), para não introduzir erros de arredondamento. `onHand` é o saldo físico total; `reserved` é a parcela reservada pelo app; `available = onHand - reserved`. Não confundir `onHand` com a quantidade vendável retornada pelo ERP.

### Mapeamento

```http
PUT /v1/external/mappings/variants/{variantId}
Authorization: Bearer f40i_...
Content-Type: application/json

{"externalId":"ERP-PROD-12345"}
```

O identificador externo é único **por integração**; diferentes ERPs podem apontar para a mesma variante interna sem alterar SKU. A consulta por variante devolve o `externalId` dessa integração ou `null`.

### Estoque: chamada idempotente

```http
PUT /v1/external/inventory/{variantId}
Authorization: Bearer f40i_...
Content-Type: application/json

{
  "eventId":"c7ca91f4-34ed-40e7-a58f-3dd4f741d8c8",
  "sourceVersion":15,
  "onHand":12
}
```

- `eventId` é um UUID estável para a mesma operação lógica. Reenviar a mesma operação é seguro; reutilizar `eventId` com dados diferentes responde **409**.
- `sourceVersion` é um número inteiro crescente **por variante e por conexão**. Versões antigas/iguais com evento diferente respondem **409**.
- `onHand` entre 0 e 1.000.000; saldos menores que unidades reservadas são rejeitados com **409**.
- O Store App conserva seus mecanismos de reserva/venda. O adaptador deve evitar eco de eventos e deduplicar pedidos por `orderId` no ERP para não descontar a mesma venda duas vezes.
- Mudanças feitas localmente no app podem ocorrer entre snapshots do ERP; a sincronização deve reconciliar ambos os canais de venda.

### Eventos confiáveis: polling + ACK

```json
{
  "events":[
    {"id":"120","type":"catalog.variant.changed","resourceId":"33333333-3333-4333-8333-333333333333","createdAt":"2026-11-19T12:00:00Z"},
    {"id":"121","type":"order.changed","resourceId":"66666666-6666-4666-8666-666666666666","createdAt":"2026-11-19T12:00:02Z"}
  ],
  "hasMore":false,
  "requiresAck":true
}
```

Após buscar os registros correspondentes e gravar a alteração **com sucesso no ERP**:

```http
POST /v1/external/events/ack
Authorization: Bearer f40i_...
Content-Type: application/json

{"eventIds":["120","121"]}
```

Protocolo de bootstrap recomendado:

1. Criar integração com chave e configurar o adaptador no lado do servidor.
2. Fazer importação inicial completa de variantes e pedidos. **Não confirmar eventos durante essa importação.**
3. Ler os eventos pendentes, consultar cada recurso atualizado, aplicar as alterações no ERP e confirmar (`ACK`) somente depois de concluir com êxito.
4. Em qualquer erro de rede ou falha do ERP, **não confirmar**. O evento retornará na próxima leitura.
5. Fazer reconciliação periódica dos totais e saldos; não considerar evento sozinho como garantia do inventário físico.

Eventos possíveis: `catalog.product.changed`, `catalog.variant.changed`, `order.changed`. Eventos podem repetir e podem chegar em ordem diferente da confirmação de transações concorrentes; cada consumidor deve tratar idempotência e ler o estado atual pelo ID. Os eventos não contêm CPF, endereço, valores financeiros ou outros dados pessoais.

## O que ainda falta (fases seguintes)

- **Fase 2:** ingestão segura de catálogo, preço e SKU/GTIN do ERP, criação/atualização por chave externa, lotes com validação e resolução de conflito; interface administrativa de integração.
- **Fase 3:** envio efetivo de pedidos para cada ERP (conector outbound com retry), status fiscal e financeiro, devoluções, cancelamentos e tratamento de informações pessoais necessárias sob LGPD.
- **Fase 4:** webhooks assinados para sistemas terceiros, filas de entrega, monitoramento e rate limits por conexão, consolidação e retenção dos eventos/ACKs.
- **Fase 5:** conectores homologados individualmente para Bling, Olist/Tiny, Omie, Conta Azul, sistemas TOTVS/Sankhya etc., conforme permissões, versão de API, contrato e acessibilidade do ERP do cliente.
- **Fase 6:** testes ponta a ponta com banco e provedor real, falhas de rede, reservas simultâneas, volumes, auditoria de acesso, política de suporte e homologação comercial antes de vender como integração pronta.

**Limitações expressas:** sem adaptador de fornecedores ou homologação; sem API para criar produtos via ERP; sem exportação de dados pessoais para integração logística/fiscal; sem controle avançado de filiais/depósitos/GTIN; sem webhook externo ativo; sem política de limpeza/arquivamento do outbox em alta escala. O aplicativo existente continua gerenciando o próprio checkout e seus pagamentos.

## Matriz de prioridades (não homologadas)

- **Bling API:** API REST, OAuth 2, documentação oficial https://developer.bling.com.br/bling-api
- **Omie:** APIs JSON/SOAP, recursos de produto/pedido/estoque; documentação https://developer.omie.com.br/
- **Olist/Tiny:** API V3 disponível; documentação https://tiny.com.br/api-docs/
- **Conta Azul:** APIs e requisitos de acesso no portal https://developers.contaazul.com/introduction
- **Sankhya:** APIs e autorizações no developer https://developer.sankhya.com.br/
- **TOTVS/Protheus:** APIs e configurações variam por produto/módulo; https://tdn.totvs.com/

Cada ERP exige análise do fluxo, credenciais e dos módulos efetivamente habilitados no cliente. A mera existência de API pública não garante integração utilizável em toda instalação.
