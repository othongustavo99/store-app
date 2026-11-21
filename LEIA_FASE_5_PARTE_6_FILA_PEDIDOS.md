# Frequencia40 Store App — Fase 5.6 (fila de pedidos)

## Objetivo

Integrar os exportadores assistidos de pedidos de Omie, Bling e Olist/Tiny com a fila LEASED da Fase 4. O worker **nao liga automaticamente** ao fazer deploy: exige confirmacao explicita, integracao autorizada, pedidos e clientes mapeados.

## Aplicacao

1. Fazer backup do banco da Railway e commit antes da instalacao.
2. Descompactar este patch na raiz `loja_roupas`, preservando a estrutura.
3. Substituir **somente** `backend/src/routes/external_delivery.ts` e `backend/src/tests/external_delivery.test.ts`.
4. Os demais arquivos sao **novos**.
5. No terminal da raiz:

```powershell
cd backend
npm ci
npm run build
npm test
cd connectors\shared
node --test
cd ..\bling
node --test
cd ..\omie
node --test
cd ..\olist
node --test
```

6. Commit e deploy somente apos os testes. **Nenhuma migration nova**. **Nenhuma variavel nova no servico principal da Railway**.
7. Deixar `ENABLE_EXTERNAL_INTEGRATIONS=false` em producao se ainda nao homologou a API externa. Para homologacao controlada, habilitar somente depois de validar as migrations 019..022 e os acessos.

## Seguranca de ativacao

O worker usa a API `POST /v1/external/events/claim` com `types: ["order.changed"]`, para que nao consuma eventos de catalogo. A alteracao e retrocompativel: se `types` nao for enviado, a API preserva o comportamento da Fase 4.

No sistema de loja, o proprietario deve:

- Criar ou selecionar uma integracao isolada para cada estabelecimento e provedor, com `orders.read`, `events.read`, `orders.write` e, quando necessario, `orders.customer.read`.
- Autorizar o uso de LEASED via `POST /v1/stores/:storeId/integrations/:integrationId/enable-leased-delivery`.
- Validar o mapeamento de produtos, contatos, campos fiscais e meios de pagamento do ERP antes de criar pedidos reais.
- Aprovar individualmente os IDs dos pedidos no arquivo `orders.example.json` do fornecedor, copiado para um caminho **privado e absoluto**.

No processo **separado do conector**, e apenas depois da homologacao real, configurar:

```env
F40_API_URL=https://SEU-BACKEND-PUBLICO/
F40_INTEGRATION_TOKEN=credencial_unica_da_loja
F40_ORDER_STATE_FILE=C:\\caminho-privado\\estado-pedidos.json
F40_QUEUE_ENABLED=SIM_HOMOLOGADO
F40_APPLY=CONFIRMO_ENVIO_PEDIDOS
F40_ORDER_PROVIDER_CONTRACT_CONFIRMED=SIM_HOMOLOGACAO
F40_QUEUE_BATCH_LIMIT=5
F40_QUEUE_INTERVAL_MS=10000
```

Tambem requer as configuracoes **ja existentes** do fornecedor e o arquivo `F40_BLING_ORDERS_CONFIG`, `F40_OMIE_ORDERS_CONFIG` ou `F40_OLIST_ORDERS_CONFIG`, conforme o caso. Nao guardar tokens em arquivos do Git.

### Comandos do conector (Windows, dentro de backend)

```powershell
node connectors\bling\order_queue.mjs --once
node connectors\omie\order_queue.mjs --once
node connectors\olist\order_queue.mjs --once
```

Remova `--once` somente apos homologacao, com o worker gerenciado como processo separado. Execute **apenas um worker por integracao**. Os exemplos acima sao alternativas, nao comandos para executar os tres com a mesma credencial.

## Comportamento

- Pedido nao autorizado/mapeado: evento `DEAD` com codigo `ORDER_APPROVAL_REQUIRED`, para revisao pelo lojista. Nao cria venda.
- Pedido ainda sem pagamento: registra ACK sem criar venda. Uma nova alteracao de status do pedido gera outro evento para exportacao.
- Pedido cancelado, reembolsado, bloqueado, com informacoes incompletas ou regras fiscais nao homologadas: exige revisao, **nao exporta**.
- Pedido pago, aprovado e mapeado: utiliza **exatamente os mesmos exportadores seguros** da Fase 5.4/5.5; so envia ACK apos registrar e confirmar o vinculo no Store App.
- Falha na criacao com resultado incerto: **nao reenvia o POST automaticamente**. O arquivo de estado protege contra duplicidade; corrigir/conciliar manualmente pelo fluxo da Fase 5.4/5.5 e reabrir o evento pelo endpoint da Fase 4.
- Falha no ACK depois da criacao: nao faz NACK. O lease expira e o worker retoma a exportacao consultando o estado persistido, sem nova criacao.
- O filtro da fila nao consome catalogo. O catalogo deve ter consumidor independente, se necessario.
- Atualizacoes de status posteriores e integracao fiscal completa **ainda nao sao espelhadas**; um ACK aqui significa somente que o envio inicial foi tratado, nao que toda a vida do pedido esta sincronizada.

## Uso em Railway

Este processo **nao** deve ser executado no mesmo container HTTP sem planejamento. Ele precisa de armazenamento persistente privado (volume ou servico equivalente) para estado e tokens. Um filesystem temporario do Railway pode perder o journal durante redeploy: **nesse caso, nao habilitar escrita**. Fazer backup dos arquivos de estado e manter isolamento por loja. Nunca instalar varios workers do mesmo cliente em instancias replicadas sem bloqueio distribuido.

## Limitacoes para comercializacao

Testes de mock nao substituem homologacao da API real do Omie, Bling ou Olist/Tiny. A automacao esta pronta em codigo para uma **lista aprovada de pedidos**, e nao para criacao irrestrita de todos os pedidos novos. Ainda faltam mapeamento automatico de novos clientes, reembolsos, conciliacao fiscal/financeira, regras tributarias por estabelecimento, validacao de estoque no ERP e operacao monitorada em uma loja piloto.

Veja tambem `docs/INTEGRACOES_FASE_5_PARTE_6.md`.
