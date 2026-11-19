# Frequência40 Store App — Fase 3: pedidos e conciliação ERP/PDV

**Base obrigatória:** Fases 1 e 2, migrations 019 e 020 aplicadas. Esta fase cria **021_external_order_sync.sql**, sem editar migrações anteriores.

> Esta é uma API genérica para conectores próprios, **não um conector homologado** para Bling, Omie, Olist/Tiny, TOTVS ou qualquer fornecedor. Não habilitar em produção de cliente sem teste de migração PostgreSQL, homologação de ponta a ponta, revisão fiscal e validação de privacidade.

## O que a API suporta

- Leitura paginada de pedidos existentes por `/v1/external/orders`, detalhamento em `/v1/external/orders/{orderId}` e notificações por `/v1/external/events` (polling + ACK).
- Consulta protegida de nome, telefone, e-mail, observações e endereço de entrega do comprador **apenas** com o escopo opcional `orders.customer.read` aprovado pelo OWNER.
- Vinculação durável e imutável de **UUID interno do pedido ↔ ID externo do ERP**, por integração e loja.
- Recebimento idempotente de `eventId` (UUID) e `sourceVersion` monotônica por pedido. A mesma operação reenviada não repete eventos, alterações nem movimentações.
- Registro de estado **informativo** do ERP (`externalStatus`), sem transformá-lo automaticamente em pagamento, estorno, cancelamento ou emissão fiscal.
- Transição do estado logístico local, **somente um passo válido por vez** (`PAID → PREPARING → SHIPPED → DELIVERED`). Exige pedido real e pago; bloqueia pós-venda em análise, saltos de status e procedimentos de transportadora que exigem rastreamento.
- Registro de **referências de NF-e/NFC-e**, com conferência da estrutura e dígito verificador da chave de acesso e histórico da situação mais recente por chave. **Não emite documentos fiscais e não consulta a SEFAZ**.
- Registro de eventos para outros conectores da mesma loja, sem eco de eventos ao responsável pela atualização, com trilha de auditoria.

## Permissões

| Ação | Escopo | Quem concede |
| --- | --- | --- |
| Ler lista e detalhes de pedidos, sem dados pessoais | `orders.read` | Ao criar integração |
| Consultar dados pessoais do comprador | `orders.customer.read` | OWNER, opção explícita |
| Conciliar pedidos, vincular ID ERP, referência fiscal e avançar logística | `orders.write` | OWNER, `orderAuthority` |
| Receber eventos e enviar ACK | `events.read` | Ao criar integração |

**Uma única integração ativa por loja** poderá ter `orderAuthority=true`. Os dados pessoais não são concedidos automaticamente a quem possua `orders.read` ou `orders.write`.

### Criar integração nova

Use o JWT da conta OWNER do Store App (não um token f40i_):

```http
POST /v1/stores/{storeId}/integrations
Authorization: Bearer <JWT_DO_OWNER>
Content-Type: application/json

{"name":"ERP principal","provider":"generic","orderAuthority":true,"customerDataAccess":true,"stockAuthority":false,"catalogAuthority":false}
```

O `token` f40i_ é mostrado **uma única vez**. Guarde-o somente no backend do conector, nunca no Flutter, navegador ou repositório.

### Habilitar a Fase 3 numa integração que já existe

**Não precisa revogar a credencial nem perder as associações da Fase 1/2.** O OWNER pode conceder novas permissões à integração ativa:

```http
POST /v1/stores/{storeId}/integrations/{integrationId}/enable-orders
Authorization: Bearer <JWT_DO_OWNER>
```

Isso habilita `orders.write` e a autoridade de pedidos. Se já houver outro conector ativo como responsável, recebe `409`.

Para acesso ao comprador, conceda **separadamente**:

```http
POST /v1/stores/{storeId}/integrations/{integrationId}/enable-customer-data
Authorization: Bearer <JWT_DO_OWNER>
```

O `integrationId` está em `GET /v1/stores/{storeId}/integrations`, acessível pelo OWNER.

## Fluxo recomendado pelo adaptador

1. O adaptador consulta `GET /v1/external/events` com `Authorization: Bearer <TOKEN_F40I>`.
2. Para `order.changed`, consulta `GET /v1/external/orders/{orderId}`. Caso o conector precise de contato e endereço, consulta `GET /v1/external/orders/{orderId}/customer` com a permissão explícita.
3. Ignora pedidos de demonstração (`isDemo=true`) e segue a política acordada para pendentes de pagamento. **Não fatura nem baixa estoque somente porque um pedido foi criado**.
4. Cria ou consulta o pedido no ERP com chave de referência idempotente **Store orderId**. Persistir esse vínculo no ERP impede a criação de duas vendas após timeout.
5. Atualiza o Store App com `POST /v1/external/orders/{orderId}/sync` usando `eventId` fixo por operação e `sourceVersion` crescente por pedido.
6. **Somente depois de confirmar persistência no ERP e/ou retorno de conciliação**, envia `POST /v1/external/events/ack` com os `eventIds` recebidos. Em caso de erro 409, interrompe o item para revisão; não gera outro pedido automaticamente.
7. Para novos eventos do Store App, repete o ciclo. Eventos do próprio conector não são devolvidos a ele. **Eventos são entregues ao menos uma vez**; adaptadores precisam guardar o último resultado e tratar reentrega.

**Consulta inicial:** `GET /v1/external/orders?limit=50` e o `nextCursor` permitem varrer pedidos existentes. Não use esse cursor para descobrir mudanças em pedidos antigos; para mudanças, use a fila de eventos com ACK.

## POST — conciliar pedido

```http
POST /v1/external/orders/{orderId}/sync
Authorization: Bearer <TOKEN_F40I>
Content-Type: application/json

{
  "eventId":"df0a9e94-51d0-4ecb-8a65-109b3f102a90",
  "sourceVersion":1,
  "externalOrderId":"ERP-000123",
  "externalStatus":"ACCEPTED"
}
```

Resposta típica:

```json
{"orderId":"UUID_DO_PEDIDO","externalOrderId":"ERP-000123","sourceVersion":1,"externalStatus":"ACCEPTED","fulfillmentChanged":false,"idempotent":false}
```

Um novo estado pode incluir, além dos campos obrigatórios:

```json
{
  "eventId":"ad6d0cf6-c245-44be-8ffc-08a006f7613b",
  "sourceVersion":2,
  "externalOrderId":"ERP-000123",
  "externalStatus":"PROCESSING",
  "fulfillmentStatus":"PREPARING",
  "notes":"Separacao confirmada pelo ERP"
}
```

`fulfillmentStatus` é **opcional** e não pode pular etapas. `externalStatus` pertence ao ERP e é apenas informativo: `RECEIVED`, `ACCEPTED`, `PROCESSING`, `INVOICED`, `DISPATCHED`, `DELIVERED`, `CANCELED` ou `ERROR`. Um estado externo `CANCELED` **não cancela** automaticamente a compra nem reembolsa ninguém. Os fluxos existentes de pós-venda, pagamento e transportadora permanecem responsáveis pelas operações correspondentes.

### Referência fiscal opcional

No mesmo POST, é possível informar `invoice` com a seguinte estrutura:

```json
{
  "model":"55",
  "accessKey":"CHAVE_DE_ACESSO_REAL_COM_44_DIGITOS",
  "series":"1",
  "number":"123",
  "issuedAt":"2026-11-19T12:00:00-03:00",
  "status":"AUTHORIZED"
}
```

**Atenção:** o valor acima em `accessKey` é um marcador explicativo, não é uma chave fiscal válida. Use a chave efetivamente obtida de um emissor/SEFAZ. São suportados `model: "55"` (NF-e) e `"65"` (NFC-e), com conferência de dígito verificador, modelo, série e número na chave. O sistema registra a referência do ERP, mas **não homologa emissão, autorização, cancelamento ou autenticidade fiscal**. Uma nota com `status:"AUTHORIZED"` é rejeitada se o pedido não está pago. O status pode passar para `CANCELED` numa revisão mais recente; o inverso é recusado para a mesma chave. Se a nota foi substituída, envie a chave nova em versão maior; as anteriores continuam na tabela de referências fiscais.

### Consultar o vínculo

```http
GET /v1/external/orders/{orderId}/sync
Authorization: Bearer <TOKEN_F40I>
```

Retorna `orderStatus`, `sync` (último snapshot do ERP) e `documents` (referências fiscais associadas). O retorno serve para reconciliação após interrupção da integração.

## Respostas e consistência

- `200` — operação aplicada, ou `idempotent:true` se o evento já foi recebido com exatamente o mesmo conteúdo.
- `400` — JSON ou dados inválidos, incluindo identificadores, versão, status e chave fiscal malformados.
- `401/403` — credencial inválida, revogada ou sem permissão explícita.
- `404` — UUID de pedido não encontrado **na loja da credencial**.
- `409` — versão antiga, mesmo `eventId` com payload diferente, ID externo associado a outro pedido, pedido demonstrativo, pagamento não confirmado, transição inválida, contestação de pós-venda ou conflito fiscal.

Nunca gere um novo `eventId` para tentar de novo a mesma operação que perdeu resposta por timeout. Se uma operação recebeu `409`, recupere o estado atual e resolva a divergência; não force uma versão maior sem reconciliar.

## Proteção financeira e estoque

A conciliação **não altera** as tabelas de pagamentos nem `on_hand`/`reserved`; só a lógica normal do checkout e do gateway de pagamento confirma o pagamento e baixa o estoque. O ERP deve enviar o saldo físico pela API específica de inventário da Fase 1, se for a fonte oficial de estoque. Evite deduzir saldo a partir de vendas que já foram processadas no checkout para não lançar saída em dobro.

Nos pedidos de transporte por transportadora, as transições SHIPPED/DELIVERED devem seguir o mecanismo de expedição e rastreamento existente. **Esta fase não oferece uma API externa para criar etiquetas, remessas ou registrar rastreios da transportadora.**

## Limitações e homologação obrigatória

- Ainda não existe adaptador que faça login e consuma APIs de Bling, Omie, Tiny/Olist, TOTVS etc. As etapas seguintes criarão conectores específicos e monitoramento.
- Esta fase não permite criar vendas de balcão diretamente no Store App: um ERP/PDV externo continua responsável por registrar seu próprio movimento e publicar o **estoque físico** atualizado.
- A consulta de pedidos disponibiliza dados operacionais, mas o cadastro atual do Store App não coleta todas as informações necessárias à emissão de todos os tipos de documento fiscal (ex.: CPF/CNPJ do destinatário). O emissor fiscal/ERP deve completar e validar esses dados quando exigidos pela operação.
- Não há emissão, autorização ou cancelamento fiscal; registramos somente referências devolvidas pelo ERP. Revisão fiscal e LGPD específicas de cada negócio são indispensáveis.
- Não há disparo HTTP de webhooks; a entrega de eventos da Fase 1 é por **polling + ACK**. Integração em tempo real dependerá da frequência e confiabilidade do conector.
- A alteração de estoque no ERP **não** substitui automaticamente reservas do aplicativo; precisa conciliar vendas externas com o saldo autorizado.
- **A migration 021 ainda não foi executada contra PostgreSQL real neste ambiente.** Código e testes de rota usam simulações de consultas.

## Aplicação e testes

Na pasta `loja_roupas/backend`:

```powershell
npm ci
npm run build
npm test
```

O backend exige as variáveis preexistentes `DATABASE_URL` e `JWT_SECRET` válidas. **Nenhuma variável nova na Railway** foi introduzida nesta fase. Em staging, primeiro mantenha `ENABLE_EXTERNAL_INTEGRATIONS=false`, faça deploy e confirme nos logs a aplicação de `021_external_order_sync.sql`; teste comportamento real em PostgreSQL antes de habilitar integrações.

Após homologação, altere a chave de integração existente usando os endpoints de concessão acima, sem precisar emitir outra. Faça backup antes de migrar. Se ocorrer erro de migration, suspenda integrações, preserve os logs e avalie rollback de deploy/recuperação de banco; nunca apague tabelas ou edite migrations antigas.
