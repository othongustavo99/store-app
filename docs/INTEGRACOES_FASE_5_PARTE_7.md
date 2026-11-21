# Frequência40 Store App — Fase 5.7: conciliação e diagnóstico dos pedidos

## Conteúdo da entrega

Patch **aditivo**: novos arquivos em `backend/connectors/...`. Não substitui arquivos de fases anteriores, não altera o Flutter, checkout, banco de dados ou APIs do backend e **não cria migration**.

Esta fase adiciona leitura segura dos pedidos criados nos ERPs Omie, Bling e Olist/Tiny, verificando o vínculo entre o pedido de origem e seu ID externo. Gera relatório com divergências. **Não** envia novos pedidos e **não** processa cancelamentos, devoluções ou reembolsos.

## Instalação

1. Faça backup e commit da Fase 5.6.
2. Extraia o ZIP na raiz `loja_roupas`, preservando a estrutura de pastas.
3. Na raiz, execute:

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

A Fase 5.7 acrescenta os comandos abaixo, executáveis **somente quando houver um ERP e credenciais de homologação**:

```powershell
# A partir da pasta backend:
node connectors\bling\order_status.mjs
node connectors\omie\order_status.mjs
node connectors\olist\order_status.mjs
```

Por padrão, consultam pedidos e exibem uma prévia: **nenhuma gravação na API Store App nem no ERP**.

## Variáveis de ambiente

**Railway (serviço do backend): nenhuma nova**. Não altera `ENABLE_EXTERNAL_INTEGRATIONS`.

Quando houver uma integração real, configure o executor do conector em ambiente isolado, com:

- `F40_API_URL`: URL do backend do Store App, terminada em `/`.
- `F40_INTEGRATION_TOKEN`: credencial daquela loja, com permissão `orders.read`. O modo de atualização precisa adicionalmente de `orders.write` e `order_authority` atribuídas pelo proprietário.
- `F40_ORDER_STATE_FILE`: caminho **absoluto e persistente** para o MESMO arquivo de estado da exportação de pedidos. Não crie um segundo arquivo: o relatório depende dele para detectar operações incertas. Não compartilhe entre lojas.
- `F40_STATUS_REPORT_FILE`: caminho absoluto opcional para salvar um JSON de diagnóstico, sem dados pessoais ou tokens.
- `F40_BLING_ORDERS_CONFIG`, `F40_OMIE_ORDERS_CONFIG` ou `F40_OLIST_ORDERS_CONFIG`: mesmo arquivo JSON de configuração privada da respectiva Fase 5.4/5.5.
- Credenciais específicas do ERP: Bling (`BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`, `F40_BLING_TOKENS_FILE`); Omie (`OMIE_APP_TOKEN`); Olist (`OLIST_CLIENT_ID`, `OLIST_CLIENT_SECRET`, `F40_OLIST_TOKENS_FILE`).

Não inclua credenciais ou arquivos de estado no Git.

## Mapeamento obrigatório das situações do fornecedor

No JSON privado de pedidos da loja, adicione um objeto `statusMap`, mantendo `storeId`, `orderIds`, `contactIds` e os campos já existentes. Exemplo **apenas estrutural, não deve ser utilizado sem confirmar o significado dos códigos**:

```json
{
  "storeId": "SEU-STORE-UUID",
  "orderIds": ["SEU-ORDER-UUID"],
  "contactIds": {"SEU-ORDER-UUID": 123456},
  "statusMap": {
    "CODIGO-VALIDADO-DO-ERP": "PROCESSING"
  }
}
```

Valores permitidos: `RECEIVED`, `ACCEPTED`, `PROCESSING`, `INVOICED`, `DISPATCHED`, `DELIVERED`, `CANCELED`, `ERROR`.

**Bling**: a chave é o valor de `data.situacao.id` de `GET /Api/v3/pedidos/vendas/{id}`. Identificadores variam conforme o sistema e podem depender da conta.

**Omie**: a chave vem de `pedido_venda_produto.cabecalho.etapa` em `ConsultarPedido`. As etapas representam colunas configuráveis; confirme os nomes com `ListarEtapasFaturamento` e com o lojista.

**Olist/Tiny**: a chave vem de `situacao` em `GET /public-api/v3/pedidos/{idPedido}`. A interpretação precisa ser confirmada segundo a conta e versão da API.

Os exemplos acima são para orientar a estrutura. Não copie os códigos de outros clientes ou atribua significados sem validar com o ERP. Situações desconhecidas viram `REVIEW_STATUS_UNMAPPED`, sem qualquer escrita.

## Entendendo o relatório

- `NOT_EXPORTED`: não há vínculo de venda identificado.
- `UNCHANGED`: situação externa coincide com o que já está gravado no Store App.
- `STATUS_CHANGED`: situação do ERP difere; atualização de **metadados** disponível apenas em modo autorizado.
- `STATUS_UPDATED`: campo `externalStatus` atualizado na rota de conciliação.
- `STATUS_RECOVERED`: uma escrita anterior foi confirmada após falha da resposta.
- `REVIEW_UNCERTAIN_CREATION`: exportação de pedido incerta; **não** reenviar POST de criação.
- `REVIEW_EXTERNAL_ID_CONFLICT`: ID associado não coincide com o registrado localmente.
- `REVIEW_STORE_LINK_MISSING`: vínculo da venda desapareceu do Store App.
- `REVIEW_IDENTITY_MISMATCH`: pedido remoto não corresponde à referência `F40-<uuid>`.
- `REVIEW_STATUS_UNMAPPED`: código de situação não configurado.
- `REVIEW_STATUS_UNSAFE`: ERP sinalizou `CANCELED` ou `ERROR` — **revisão manual obrigatória**.
- `REVIEW_ORDER_CLOSED`: pedido Store App não está pago/aprovado ou está fechado.
- `REVIEW_STATUS_CHANGE_CONFLICT`: atualização concorrente/inconsistente.
- `REVIEW_REMOTE_UNAVAILABLE`: falha ao consultar pedido ou ERP.
- `REVIEW_STATUS_UPDATE_FAILED`: atualização de metadados não confirmada. Não gere uma nova chave: o sistema mantém uma operação persistente para o próximo ciclo.

Os resultados incluem identificadores, estados normalizados e códigos de diagnóstico; **nunca os dados pessoais do comprador**.

## Atualização opcional de metadados (somente na homologação)

Quando **e somente quando** tiver confirmado o contrato e as situações do ERP para aquela loja, autorize explicitamente no ambiente do executor:

```powershell
$env:F40_STATUS_WRITE_ENABLED="CONFIRMO_STATUS_ERP"
$env:F40_ORDER_PROVIDER_CONTRACT_CONFIRMED="SIM_HOMOLOGACAO"
$env:F40_ORDER_STATUS_MAP_CONFIRMED="SIM"
node connectors\bling\order_status.mjs --apply-status
```

Ajuste o comando para `omie` ou `olist` conforme o fornecedor. Além disso, o token precisa de `orders.write` e da autoridade de pedidos (`order_authority`) configurada no backend da loja.

Esse modo altera **exclusivamente `externalStatus` e a versão da conciliação do pedido**. Não atualiza `fulfillmentStatus`, pagamentos, reservas de estoque, NF-e/NFC-e, cancelamentos ou devoluções. Não chama endpoints de gravação do ERP.

Cada envio é registrado no arquivo de estado **antes** do POST. Um timeout ou queda após a escrita poderá ser retomado com os mesmos `eventId` e `sourceVersion`, ou será detectado como já confirmado no Store App. Em caso de versão concorrente, exige revisão humana.

Para garantir consistência, o relatório usa o mesmo lock de arquivo dos exportadores existentes; não execute múltiplas réplicas usando o mesmo estado, a menos que compartilhem corretamente um volume persistente com lock confiável.

## Limitações e próximos passos

1. Sem homologação com contas reais dos três ERPs, os formatos e situações precisam de validação.
2. Não há automação de cancelamento, devolução, estorno ou emissão fiscal.
3. Não há sincronização automática do pedido do ERP para o fluxo de expedição do Store App. Exige mapeamento de estados confirmado e testes de regras de negócio.
4. Não há painel visual Flutter nesta fase: o diagnóstico é JSON/CLI.
5. O modo normal é execução pontual. Execução periódica só deve ser configurada depois de homologada e com monitoramento e armazenamento durável.

## Testes realizados nesta entrega

- `npm run build`: compilação TypeScript aprovada.
- `npm test`: 187 testes do backend passaram **com valores de ambiente de teste**.
- `node --test`: 51 testes dos componentes compartilhados (18 novos), 18 do Bling, 12 do Omie e 33 do Olist — 114 no total.
- Total: **301 testes aprovados**.

Não foi realizada comunicação com APIs reais, nem atualização de banco de dados de produção. Em Railway, nada precisa ser configurado até uma integração real.
