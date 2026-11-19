# FREQUENCIA40 — FASE 5.4 | EXPORTACAO ASSISTIDA DE PEDIDOS PARA OLIST/TINY

## Resultado e limites

Esta fase adiciona **arquivos novos** em `backend/connectors/olist/` e um exportador de pedido assistido do Store App para Olist/Tiny ERP V3. O fluxo valida o pedido e **somente** no modo APPLY cria um registro de pedido no ERP, verifica o numero de referencia no ERP e grava o vinculo de retorno no Store App.

- Produto existente no ERP deve ter `externalVariantId` mapeado no Store App para a integracao Olist.
- Somente pedidos **pagos/aprovados**, `PICKUP`, nao-demo, com contato vinculado manualmente por ID podem seguir nesta fase.
- **Nao** emite NF-e/NFC-e, **nao** transfere pagamento, **nao** dispara lancamento financeiro, **nao** faz baixa de estoque no ERP e **nao** envia pedidos por delivery.
- Esta fase nao automatiza a fila da Fase 4: as vendas sao selecionadas por UUID explicitamente. Agendamento so depois de homologar o fluxo completo.
- Testes sao **com mocks**, nao houve chamada a conta Olist real e o corpo de criacao de pedidos deve ser confirmado frente ao schema vigente do fornecedor ao homologar. Nunca prometer homologacao comercial antes disso.

## Arquivos incluidos

- `backend/connectors/olist/order_export_rules.mjs`: validacao do pedido, conciliacao de valores e mapeamento de itens.
- `backend/connectors/olist/order_export_clients.mjs`: clientes de API com rotas restritas. POST no ERP com **uma tentativa**, sem retry cego.
- `backend/connectors/olist/order_export_state.mjs`: journal persistente separado do estado de catalogo.
- `backend/connectors/olist/order_export.mjs`: CLI PREVIEW/APPLY/RECONCILE.
- `backend/connectors/olist/orders.example.json`: configuracao de exemplo (sem credenciais).
- `backend/connectors/olist/test/orders.test.mjs`: testes novos.
- Documentos e manifesto da fase.

Nenhum arquivo do backend principal ou Flutter foi substituido, nenhuma migration nova, nenhuma variavel nova no servico backend Railway.

## Instalar / testar

1. Faça backup do banco, dos estados dos conectores e dos tokens. Salve um commit de seguranca.
2. Extraia o ZIP na **raiz** `loja_roupas`, preservando as pastas e adicionando os novos arquivos. Pressupoe que Fases 1-5.3 estao aplicadas.
3. No terminal PowerShell, **partindo da raiz** do projeto:

```powershell
cd backend\connectors\olist
node --test
```

Os 33 testes do conector (18 anteriores + 15 novos) passaram no ambiente local utilizado para preparar este pacote.

Se tambem desejar validar o backend geral, volte para a raiz e execute:

```powershell
cd ..\..
npm ci
npm run build
npm test
```

## Requisitos antes de ativar envio

- Store App migrations 019-022 aplicadas, `ENABLE_EXTERNAL_INTEGRATIONS=true` **em homologacao**.
- Conta Olist/Tiny API V3 com aplicativo privado, OAuth autorizado e permissoes de leitura de pedidos, criacao de pedidos e leitura de produtos; tokens mantidos em arquivo seguro e persistente.
- No Store App, credencial `f40i_...` individual do lojista, com escopos `orders.read`, `orders.write` e mapeamentos de variantes existentes. O OWNER precisa habilitar autoridade de pedidos quando nao concedida na criacao da integracao (`POST /v1/stores/{storeId}/integrations/{integrationId}/enable-orders`).
- Pedido pago no Store App com `paymentStatus=APPROVED`, retirada local (`PICKUP`), variantes mapeadas para IDs numericos da conta Olist e cliente ja cadastrado no Olist com `idContato` conferido.
- Conferir regras de baixa de estoque e contas a receber no ERP com o contador/lojista: o conector nao deve provocar duplicidade de estoque ou cobranca.

## Configuracao da loja (Windows / PowerShell)

Crie uma pasta exclusiva do estabelecimento **fora do Git** (exemplo `C:\F40-Integracoes\minha-loja\olist\`) e guarde nela arquivos de estado/tokens com permissoes restritas. Copie `orders.example.json` para `order-settings.json` nesta pasta e preencha:

- `storeId`: UUID da loja no Store App (serve de trava contra reutilizacao de estado entre clientes).
- `orderIds`: UUIDs dos pedidos explicitamente aprovados para teste (maximo 30).
- `contactIds`: mapa `{ UUID do pedido: idContato numerico no ERP }`. Confirmar correspondencia de cada comprador; nao usar contato generico sem autorizacao e criterio fiscal.

```powershell
# Execute na pasta backend\connectors\olist
$env:F40_OLIST_ORDERS_CONFIG='C:\F40-Integracoes\minha-loja\olist\order-settings.json'
$env:F40_ORDER_STATE_FILE='C:\F40-Integracoes\minha-loja\olist\orders-state.json'
$env:F40_API_URL='https://SUA-API-HOMOLOGACAO.up.railway.app/'
$env:F40_INTEGRATION_TOKEN='TOKEN_F40I_DA_LOJA'
$env:F40_OLIST_TOKENS_FILE='C:\F40-Integracoes\minha-loja\olist\tokens.json'
$env:OLIST_CLIENT_ID='CLIENT_ID_OLIST_DA_LOJA'
$env:OLIST_CLIENT_SECRET='CLIENT_SECRET_OLIST_DA_LOJA'
node order_export.mjs
```

PREVIEW consulta os dados do Store App e exibe apenas contagem de itens, valor em centavos e estado do vinculo. Nao cria ou altera pedidos.

## Envio assistido (APPLY)

Depois de conferir no painel da loja os dados, o mapeamento de variantes e contato, os totais e as regras do ERP:

```powershell
$env:F40_APPLY='CONFIRMO_ENVIO_PEDIDOS'
node order_export.mjs --apply
```

Ao iniciar a tentativa de criacao, o estado local passa para `CREATE_IN_FLIGHT` **antes** do HTTP POST. Um timeout, erro HTTP, processo interrompido ou resposta invalida marca/incorre em uma situacao que exige conciliacao manual. A ferramenta **nao** cria novamente o mesmo pedido automaticamente.

Se o ERP retornar sucesso valido, registra o `erpId`, consulta `GET /pedidos/{erpId}`, compara `numeroOrdemCompra=F40-{UUID}` e, so depois, chama `POST /v1/external/orders/{UUID}/sync` com ID externo e evento idempotente. Se o Store App falhar nessa ultima etapa, nova execucao tentara somente o vinculo, **nao** criara outra venda.

Em caso de incerteza, **abra o Olist manualmente e busque a referencia `F40-{UUID}`** antes de usar reconciliacao. Se achou o pedido com mesmo ID e referencia:

```powershell
node order_export.mjs --reconcile 'UUID_DO_PEDIDO_STORE' 123456
```

A reconciliacao consulta a ordem indicada na API Olist, verifica o ID e `numeroOrdemCompra`, e vincula o retorno ao Store App. **Se nao encontrou a ordem**, nao execute novamente `--apply` a cegas; revise os logs do ERP e abra uma ocorrencia de suporte. Nunca apague `orders-state.json` para forcar uma segunda inclusao.

## Cuidados

- Rode no maximo **um** processo por loja usando o mesmo journal. O conector cria arquivo `.lock` ao aplicar. A sincronizacao de catalogo e a de pedidos compartilham tokens OAuth: **nao as execute simultaneamente**, para nao haver refresh concorrente.
- Nao inclua tokens, senha, JSON de pedido real ou dados pessoais em commits, prints ou logs compartilhados.
- O Store App continuara fonte do pagamento; o pedido entra no ERP como **Aberto**, sem pagamento/fiscal automatizados. Confirmar configuracao de financeiro e estoque no ERP antes de uso.
- O mapeamento de `ItemPedidoRequestModel` do Olist e o comportamento dos gatilhos internos devem ser confirmados em homologacao real. Nao utilizar em producao sem essa validacao.
- Nenhuma nova variavel no servico principal da Railway. As variaveis do exemplo sao **somente do processo do conector**, por loja.

## Proxima etapa

Completar o modo automatico de recebimento de eventos da Fase 4, tratar cadastros de clientes, entrega e reconciliacao de status, e criar adaptadores equivalentes para Bling e Omie antes de prometer envio universal de pedidos.
