# Frequencia40 — Fase 5.16 | Pedidos Store App para CSV (saida assistida)

**O que faz:** consulta pedidos selecionados da API Store App (somente leitura), valida TODOS os dados, apresenta uma previa com SHA-256 e, apos confirmacao do operador, grava um arquivo CSV e um manifesto para **importacao manual em ERP/PDV**.

**O que NAO faz:** nao acessa o ERP do cliente, nao importa nem confirma pedido no destino, nao atualiza pedido/pagamento/estoque/nota fiscal no Store App, nao executa ACK de evento e nao garante compatibilidade com o formato do ERP. Nao existe sincronizacao automatica por CSV.

## Requisitos e escopo estrito

- Node.js 22+, Fases 1-5.15 aplicadas, API Store App autorizada, backend com `ENABLE_EXTERNAL_INTEGRATIONS=true` **somente em ambiente devidamente homologado**. Sem homologacao, utilize `--demo` (offline).
- Integracao da mesma loja com `orders.read`. Para pedidos importados por CSV na Fase 5.14, usar a **mesma integrationId/credencial** preserva os mapeamentos de `externalVariantId` das variantes. Se usar outra integracao, deve cadastrar e conferir mapeamentos para ela antes de exportar.
- Somente pedidos reais (`isDemo=false`), `PAID` ou `PREPARING`, `paymentStatus=APPROVED`, retirada (`PICKUP`), sem frete/desconto, com mapeamento externo de TODOS os itens e total aritmeticamente consistente.
- No maximo 30 UUIDs de pedido explicitos por lote, ate 100 itens por pedido. Uma linha CSV por item, com referencia `F40-<orderId>`. Dados pessoais do comprador nao sao consultados. Este arquivo nao comprova a situacao de estornos nem casos de pos-venda em aberto: conferir antes de importar.
- `dateTimeZone` e obrigatorio (ex.: `America/Sao_Paulo`) para converter a data UTC do pedido para a data da loja sem deslocamento de dia; conferir convencao exigida pelo fornecedor.
- Configure os nomes de colunas, separadores e convencao monetaria para o importador REAL do ERP. A existencia de exportacao CSV no ERP nao assegura que ele aceite este layout; testar e homologar em ambiente controlado. `orderTotal` repete em cada linha do pedido: nao somar essa coluna como se fosse total por item.

## Testes sem conta ou token de ERP

Na pasta `backend`:

```powershell
node connectors\csv\order_export_cli.mjs --demo
node --test connectors\csv\test\order_export.test.mjs
node --test connectors\assessment\test\assessment.test.mjs
```

`--demo` apenas valida um pedido ficticio: `networkUsed=false`, `filesCreated=false`. Nao e prova de compatibilidade com qualquer fornecedor.

## Operacao real — primeiro preview e depois arquivo

1. Copie `connectors/csv/orders.settings.example.json` para um diretorio privado e edite `storeId`, `integrationId`, `orderIds`, `columns` e `dateTimeZone`. Nunca salve token nesse JSON. Para vendas com produtos importados pelo CSV, as colunas `externalVariantId` sao as referencias externas registradas na **mesma integracao**.
2. No PowerShell, ainda em `backend`, configure as variaveis **no terminal/worker da loja**, nao nas variaveis globais compartilhadas da Railway:

```powershell
$env:F40_CSV_ORDERS_CONFIG = 'C:\f40\cliente-a\pedidos.config.json'
$env:F40_API_URL = 'https://SEU-BACKEND-REAL/'
$env:F40_INTEGRATION_TOKEN = '<CHAVE_F40_PRIVADA_DA_LOJA>'
node connectors\csv\order_export_cli.mjs --preview
```

3. Confira na previa `orders`, `lines`, `totalCents`, `dateTimeZone` e principalmente `sha256`. **A previa acessa somente a API do Store App (GET), nao o ERP.** Valide com o responsavel da loja o estado de pagamento e pos-venda, mapeamentos e datas. Nao use dados reais nem `--write` sem autorizacao.
4. Depois de aprovado, crie o diretorio de saida, escolha **o mesmo arquivo de estado persistente dessa loja e integracao** e um CSV com nome ainda nao utilizado:

```powershell
$env:F40_CSV_ORDERS_STATE = 'C:\f40\cliente-a\pedidos_estado.json'
$env:F40_CSV_ORDERS_OUTPUT = 'C:\f40\cliente-a\exportacoes\lote-001.csv'
$env:F40_CSV_ORDER_EXPORT_CONFIRM = 'CONFIRMO_GERACAO_MANUAL'
$env:F40_CSV_ORDERS_EXPECTED_SHA256 = '<SHA256_EXATO_DA_PREVIA>'
node connectors\csv\order_export_cli.mjs --write
```

Se o pedido ou o layout mudar entre previa e escrita, o SHA nao coincide e o CLI **recusa** criar arquivo. `--write` consulta os snapshots mais uma vez, valida todos os pedidos, grava um journal de reserva e so entao cria o CSV e o manifesto `.csv.manifest.json` sem sobrescrever arquivos existentes.

5. Entregue o arquivo ao operador do ERP, importe em **homologacao**, compare quantidade, SKU/codigo externo, valores, referencia e total de cada pedido, e registre o comprovante/resultado manualmente. A resposta `FILE_CREATED` significa **arquivo preparado**, NAO pedido recebido/aceito/registrado pelo ERP.

## Estado, repeticoes, falhas e privacidade

- O journal local `F40_CSV_ORDERS_STATE` registra pedidos reservados ou cujos arquivos foram criados. **Nao apagar, alterar, copiar para outra loja nem trocar o caminho para forcar reexportacao**. Guardar backups e restringir permissoes; apenas um executor para o mesmo cliente/integracao.
- O lock `.lock` impede concorrencia no mesmo journal. Dois computadores com journals diferentes NAO estao protegidos contra duplicidade; e obrigatoria uma fonte unica do estado.
- O arquivo ja existente e o pedido ja reservado/gerado sao bloqueados. Se ocorrer falha/queda apos reservar estado, o novo envio fica bloqueado ate conciliacao MANUAL dos arquivos gerados e das operacoes no ERP. Nao deletar arquivos/reservas para burlar o bloqueio.
- O CSV tem somente identificadores de pedido/produto, descricao de produto, quantidades e valores; nao consulta `/customer`. Valores como nomes de produtos sao escapados contra formula em planilhas; as colunas sao restritas.
- Arquivos produzidos e manifesto podem revelar dados comerciais confidenciais (SKU, preco e historico de pedidos). Armazenar fora do repositorio, com controle de acesso e retencao adequada.
- O hash protege a aprovacao previa contra mudanca de conteudo; nao e assinatura de integridade juridica nem substitui conciliacao.
- `--preview` pode ser reexecutado; `--write` nao produz sobrescrita nem reenvio. Nao usar exportacao CSV com entregas, fretes, descontos, pagamentos divididos, faturamento fiscal, estornos e cenarios especiais sem adaptacao especifica.

## Auditoria Fase 5.15

O avaliador F5.15 continua classificando o fluxo `order_export` por CSV como **nao atendido para envio automatico**. A Fase 5.16 oferece **somente geracao assistida de arquivo**; isto NAO configura um conector API de criacao de pedidos, nem permite liberar producao. O parecer foi atualizado para explicitar essa distincao.
