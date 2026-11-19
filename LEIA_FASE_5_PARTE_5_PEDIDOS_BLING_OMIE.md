# Frequencia40 | Store App | Fase 5.5 — Pedidos para Bling e Omie

**Escopo desta entrega:** exportacao ASSISTIDA de pedidos aprovados do Store App para Bling e Omie, por IDs explicitamente selecionados. Esta fase adiciona apenas arquivos nos conectores; nao modifica Flutter, backend principal, endpoints, checkout nem migrations.

> **IMPORTANTE:** o codigo passou em testes com respostas simuladas. O formato de criacao/consulta de pedido, os campos obrigatorios e os efeitos sobre estoque, financeiro e faturamento DEVEM ser homologados com uma conta de testes em cada fornecedor. Nao e um conector certificado, pronto para uso indiscriminado em lojas reais. Nenhuma rotina de criacao automatica por fila foi ativada.

## 1. Instalacao e testes

- Faça backup/commit da versão atual antes de aplicar.
- Extraia este ZIP na RAIZ `loja_roupas`, mantendo a estrutura. Todos os arquivos sao NOVOS.
- No VS Code / PowerShell, a partir da raiz:

```powershell
cd backend
npm ci
npm run build
npm test
node --test connectors/shared/test/orders.test.mjs
cd connectors/bling
node --test
cd ..\omie
node --test
```

A ultima suite de testes do patch foi executada junto aos conectores anteriores: **81/81 testes aprovados**, todos simulados. A suite completa do backend nao foi reexecutada neste patch porque ela nao foi modificada.

## 2. Preparar uma loja de homologacao

1. Aplicar e validar migrations 019 a 022 em PostgreSQL de homologacao e habilitar `ENABLE_EXTERNAL_INTEGRATIONS=true` apenas ali.
2. No Store App, o OWNER deve autorizar uma integracao do fornecedor correspondente com `orders.read=true` e `orders.write=true`. A permissao de leitura de dados pessoais NAO e necessaria nesta fase, pois o cliente ja deve estar cadastrado e ter ID mapeado manualmente no ERP.
3. O Store App precisa ter `externalVariantId` vinculado ao **ID interno numerico do mesmo ERP**, para CADA variante vendida. Mapear SKU por aproximação nao e aceito.
4. Crie uma pasta protegida FORA do Git por estabelecimento e fornecedor, por exemplo `C:\F40-Integracoes\Loja001\bling\` e outra para Omie. Nao compartilhar tokens ou journal entre lojas nem entre fornecedores.
5. Copie `orders.example.json` do conector para `orders-config.json` nessa pasta protegida. Preencha UUIDs de pedidos REALMENTE PAGOS e IDs do cliente ja cadastrados no ERP.
6. Use **PREVIEW** para conferir itens, quantidade, valores e identificadores sem criar pedidos no ERP.

Atencao: Somente pedidos REAIS e PAGOS, `paymentStatus=APPROVED`, retirada no local, **sem desconto e sem frete**, sao aceitos neste primeiro corte. Qualquer demo, entrega, desconto, precos invalidos ou produto sem mapeamento e recusado. Os pedidos exportados continuam sendo registrados como pagos no Store App; isto NAO configura recebimento financeiro no ERP.

## 3. Bling — PowerShell

A autenticacao OAuth e o refresh seguem os arquivos `auth.mjs` / `oauth.mjs` entregues na fase 5.2. Autorize na conta da loja com escopo de **pedidos de venda**, alem dos escopos de leitura que ja existiam. Reautorize ao alterar escopos.

```powershell
cd backend\connectors\bling
$env:F40_API_URL="https://SUA-API-DE-HOMOLOGACAO.up.railway.app/"
$env:F40_INTEGRATION_TOKEN="SEU_TOKEN_PRIVADO_DA_INTEGRACAO"
$env:F40_BLING_ORDERS_CONFIG="C:\F40-Integracoes\Loja001\bling\orders-config.json"
node order_export.mjs
```

Para a primeira aplicacao de homologacao, somente apos validar o contrato de pedidos com a conta de testes e o procedimento de recuperacao:

```powershell
$env:BLING_CLIENT_ID="SEU_CLIENT_ID"
$env:BLING_CLIENT_SECRET="SEU_CLIENT_SECRET"
$env:F40_BLING_TOKENS_FILE="C:\F40-Integracoes\Loja001\bling\tokens.json"
$env:F40_ORDER_STATE_FILE="C:\F40-Integracoes\Loja001\bling\orders-journal.json"
$env:F40_APPLY="CONFIRMO_ENVIO_PEDIDOS"
$env:F40_ORDER_PROVIDER_CONTRACT_CONFIRMED="SIM_HOMOLOGACAO"
node order_export.mjs --apply
```

`orderDate` em `orders-config.json` deve ser data real `AAAA-MM-DD` escolhida para o pedido, e `contactIds` precisa apontar para os contatos ja existentes no Bling. `storeChannelId` e opcional, somente se confirmado na conta da loja. O Bling usa `numeroLoja=F40-{uuid}` como referencia de origem. **Os detalhes exigidos para parcelas, natureza de operacao e configuracao de emissao fiscal dependem da loja e precisam ser homologados**. Este prototipo nao lanca financeiro, nao altera estoque nem emite nota por conta propria; a configuracao do ERP pode ter automacoes e deve ser verificada.

## 4. Omie — PowerShell

```powershell
cd backend\connectors\omie
$env:F40_API_URL="https://SUA-API-DE-HOMOLOGACAO.up.railway.app/"
$env:F40_INTEGRATION_TOKEN="SEU_TOKEN_PRIVADO_DA_INTEGRACAO"
$env:F40_OMIE_ORDERS_CONFIG="C:\F40-Integracoes\Loja001\omie\orders-config.json"
node order_export.mjs
```

Para aplicacao SOMENTE na conta de testes:

```powershell
$env:OMIE_APP_TOKEN="TOKEN_DE_APLICATIVO_OMIE"
$env:F40_ORDER_STATE_FILE="C:\F40-Integracoes\Loja001\omie\orders-journal.json"
$env:F40_APPLY="CONFIRMO_ENVIO_PEDIDOS"
$env:F40_ORDER_PROVIDER_CONTRACT_CONFIRMED="SIM_HOMOLOGACAO"
node order_export.mjs --apply
```

O Omie usa `codigo_pedido_integracao=F40-{uuid}` e exige configuracoes de cliente, etapa de faturamento, categoria financeira, conta corrente e classificacoes tributarias de cada item. **CFOP, NCM, unidade e conta corrente NAO podem ser inferidos pelo aplicativo.** O exemplo e ilustrativo e nao serve como parametrizacao para vendas reais. Conferir todos esses valores com o contador e validar a API do Omie.

## 5. Recuperar uma criacao de resultado incerto

Na primeira tentativa de criar um pedido, um journal e gravado com estado `CREATE_IN_FLIGHT` ANTES da chamada ao ERP. Se ocorrer timeout, HTTP 4xx/5xx, resposta sem ID ou interrupcao, o journal passa a `NEEDS_RECONCILIATION` (ou permanece `CREATE_IN_FLIGHT` apos queda brusca). **NUNCA apague o journal nem repita o POST cegamente**.

1. Localize o pedido no ERP usando a referencia `F40-{UUID}`. Confirme com o operador que existe um e apenas um pedido, e valide itens e totais.
2. Se ele existir, anote o ID numerico atribuido pelo ERP e execute:

```powershell
node order_export.mjs --reconcile UUID_DO_PEDIDO ID_NUMERICO_DO_ERP
```

3. O conector consulta esse ID e **compara a referencia de origem**. Se coincidir, vincula o pedido ao Store App via `/v1/external/orders/{orderId}/sync` usando o mesmo `eventId` e `sourceVersion`. Se faltar referencia ou houver divergencia, bloqueia.
4. Se nao existir no ERP, **nao remova ou reinicie o journal automaticamente**. A resolucao de ausencia comprovada exige protocolo de operacao e revisao humana.

Se a resposta do ERP tiver ID mas o vinculo falhar, o journal fica `CREATED`; a proxima execucao tenta apenas CONSULTAR + VINCULAR, sem novo POST de criacao. O arquivo `.lock` bloqueia execucoes simultaneas.

## 6. O que esta FORA desta fase

- Processamento continuo da fila LEASED e ACK automatico de eventos.
- Emissao NF-e/NFC-e, recebimento de pagamento, conciliacao de adquirente, fiscal, cancelamento, devolucao e troca.
- Pedidos delivery, com desconto, frete, parcelas complexas, kits, grades nao mapeadas ou pagamento ainda nao aprovado.
- Sincronizacao posterior de alteracoes de status/faturamento de dentro do Bling/Omie.
- Multiempresa em um unico processo: cada loja deve ter credencial, arquivo de configuracao e journal independentes.

## 7. Railway

- **Backend existente:** nenhuma migration e nenhuma variavel nova nesta fase.
- **Conector separado:** utiliza variaveis do exemplo acima. Nao colocar tokens de diversos clientes no mesmo conjunto global de variaveis do backend.
- Para usar em Railway no futuro, o journal e os tokens precisam de armazenamento DURAVEL, exclusivo por cliente, com protecao e backup. Disco efemero significa risco de perda de idempotencia. No momento o executor e manual no Windows.

## 8. Referencias oficiais consultadas (novembro/2026)

- Bling: https://developer.bling.com.br/referencia
- Bling OAuth: https://developer.bling.com.br/bling-api
- Omie Pedido de Vendas: https://api.omie.com.br/docs/apis/produtos/pedido

**Status:** IMPLEMENTADO + TESTADO com mocks. **Nao homologado comercialmente** com fornecedores ou com cliente pagante.
