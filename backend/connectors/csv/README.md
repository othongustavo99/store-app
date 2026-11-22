# Frequencia40 CSV / Importacao universal por arquivo (Fase 5.14)

Este conector **nao e um ERP ou PDV** e nao faz chamadas ao sistema de caixa. Ele recebe um arquivo CSV exportado **manualmente** de um sistema que permita exportacao e transforma produtos, grades, precos e, opcionalmente, estoque fisico para a API ja existente do Store App.

## Requisitos

- Node.js 22+; Fases 1 a 5.13 ja instaladas no Store App.
- Uma integracao propria por loja criada na Central de Integracoes, com `provider` = `csv` (ou identificador especifico aprovado pelo lojista), `catalogAuthority=true` e, **somente se for sincronizar saldo fisico**, `stockAuthority=true`. A chave `f40i_...` e exibida uma unica vez.
- Categoria ativa criada no Store App; obter o UUID da categoria via API de categorias/autorizacao existente. `categoryId` no JSON de exemplo e apenas ilustrativo.
- Arquivo CSV UTF-8, limite de 2 MB, 500 linhas de dados, ate 200 produtos e 40 variantes por produto. Colunas e separadores configuraveis por cliente.
- Um caminho de journal exclusivo por **integracao** e um diretorio com acesso restrito, backup e persistencia.

## Mapeamento CSV

`settings.example.json` demonstra `columns`: `externalProductId`, `externalVariantId`, `sku`, `name`, `price` (obrigatorios); `stock`, `gtin`, `color`, `size`, `status` (opcionais). Use a grafia EXATA dos cabecalhos exportados pelo ERP. O arquivo deve incluir um ID estavel por produto e por variante e SKUs estaveis e unicos. Grades cor/tamanho ficam no mesmo produto.

- Precos: `decimalSeparator=","` aceita `129,90`, mas **nao** `1.299,90` nem `R$ 129,90`. Sem arredondamento.
- GTIN/EAN opcional, conferido pelo digito verificador; nunca gerar ou inferir IDs.
- `status` so e interpretado conforme `statusValues`, sem adivinhar a situacao.
- Produtos novos sao criados como **DRAFT**, nunca publicados so pela importacao.
- Itens ausentes do CSV **nao** sao excluidos, arquivados nem inativados no Store App.
- `stockMode=DISABLED` (padrao) **nao** altera estoque. Para usar `PHYSICAL` e necessario definir `physicalStockConfirmed:true`, `snapshotAt` em UTC como `2026-11-21T12:00:00Z`, e configurar autoridade de estoque no Store App. A data deve refletir o momento REAL da exportacao, nao a data da importacao. Arquivos antigos ou alterados com o mesmo `snapshotAt` sao rejeitados.
- O modo de importacao de catalogo da Fase 5.14 nao sincroniza clientes, pedidos, pagamentos, notas, cancelamentos nem vendas de PDV. A exportacao assistida de pedidos por CSV e um processo separado da Fase 5.16, descrito em `ORDER_EXPORT_README.md` e sem aceite automatico pelo ERP. Estoque por deposito, fracionario ou em multiplas lojas necessita projeto especifico.

## Modo PREVIEW (sem escrita nem chamada a API)

No PowerShell, na pasta `backend`:

```powershell
$env:F40_CSV_CONFIG=(Resolve-Path .\connectors\csv\settings.example.json).Path
$env:F40_CSV_INPUT=(Resolve-Path .\connectors\csv\catalog.example.csv).Path
node connectors\csv\sync.mjs
```

O exemplo retorna 2 produtos, 3 variantes, 0 importacoes e `productionApproved:false`. Antes de usar um CSV real, crie um JSON PRIVADO com os UUIDs reais de `storeId`, `integrationId`, `categoryId` e com os nomes das colunas exportadas pelo sistema. Nao commitar arquivo real, tokens ou estado.

## Modo APPLY (somente depois de homologar)

No PowerShell, configure variaveis locais para o **worker desta loja**, nao como variaveis globais compartilhadas no backend Railway:

```powershell
$env:F40_CSV_CONFIG='C:\f40\cliente-a\config.private.json'
$env:F40_CSV_INPUT='C:\f40\cliente-a\exportacao.csv'
$env:F40_STATE_FILE='C:\f40\cliente-a\estado-csv.json'
$env:F40_API_URL='https://seu-backend.exemplo.com/'
$env:F40_INTEGRATION_TOKEN='<CHAVE_PRIVADA_F40>'
$env:F40_APPLY='CONFIRMO_SINCRONIZACAO'
node connectors\csv\sync.mjs --apply
```

Crie o diretorio `C:\f40\cliente-a\` antes da operacao e mantenha uma copia de seguranca do estado. Nao rode dois workers com o mesmo estado; o arquivo `.lock` impede concorrencia. Execute `--apply` apenas em homologacao primeiro e com autorizacao da loja. **Nunca reutilize o mesmo estado entre lojas ou duas integracoes diferentes.**

## Falhas e recuperacao

- A validacao integral de todo o arquivo ocorre **antes** da primeira chamada de escrita; erros estruturais nao geram importacoes parciais.
- Erros individuais de HTTP ou vinculo podem deixar importacao parcial entre produtos. O JSON final indica quantos foram importados e quais IDs falharam. Nao e operacao global atomica.
- A chave `eventId` e a `sourceVersion` sao gravadas **antes** do request. Se a API respondeu com timeout depois de aplicar, repetir o MESMO arquivo com o MESMO journal usa a mesma chave. Nao exclua o journal para 'resolver' erros.
- Se o arquivo mudou e a operacao anterior nao foi confirmada, aparece `CSV_PREVIOUS_OPERATION_PENDING`. E necessaria conciliacao com o Store App; nao forcar um novo envio por fora.
- Se o ERP ja possui produtos no Store App que nao foram mapeados, um SKU/GTIN coincidente sera rejeitado por conflito: nao criamos associacoes por aproximacao.
- A atualizacao de estoque usa `/v1/external/inventory/:variantId`, protegida pelas reservas do checkout. A data do snapshot deve ser mais recente que a ultima importada, mas isso nao torna um CSV atualizado em tempo real: a loja ainda deve decidir a fonte oficial do estoque para evitar sobrevenda.
- Erros sao codigos e IDs tecnicos; logs nao incluem token ou dados de compradores.

## Testes

```powershell
cd backend\connectors\csv
node --test
```

Os testes usam API simulada. **Homologacao real:** exporte um arquivo pequeno do ERP, confira SKUs/variantes e fotos, teste o preview, importe em homologacao e compare produto/preco/estoque. Teste venda entre exportacao e importacao e valide divergencias; depois execute plano de rollback e aceite formal com o cliente.

## Complemento Fase 5.16 — Saida de pedidos CSV

A partir da Fase 5.16 existe o runner separado `order_export_cli.mjs`, que **gera um arquivo local** de pedidos pagos de retirada para importacao manual no ERP. Leia `ORDER_EXPORT_README.md` para configuracao, restricoes e comandos; nao confunda geracao de arquivo com exportacao bem-sucedida ao fornecedor. O modo de importacao de catalogo acima permanece inalterado.
