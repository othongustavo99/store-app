# Frequência40 — F5.18: leitura auxiliar do retorno de importação CSV do ERP/PDV

## Responsabilidade

Esta fase lê **apenas retornos tabulares CSV** exportados pelo ERP/PDV (ou gerados por um operador a partir de um relatório legítimo) com uma linha por pedido e referência exata `F40-<orderId>`. PDF, XLSX, imagens, impressões de tela e retorno de API NÃO são suportados. Não faz OCR, não faz chamadas de rede e não autentica a origem do arquivo. Homologar o layout real de cada fornecedor antes do uso.

A F5.18 não confirma recebimento no ERP. Mesmo quando o CSV de retorno indicar `IMPORTADO`, os pedidos no rascunho permanecem `UNCERTAIN`, **sem `acknowledgement` e com campos do operador vazios**. O arquivo de rascunho não é válido para registro pela F5.17 até que uma pessoa confira o pedido no ERP e complete o comprovante. Nenhum registro de estoque, pagamento, fiscal, pedido ou journal é alterado pela F5.18.

## Arquivos

- `ack.settings.example.json`: exemplo de mapeamento do retorno, com cabeçalhos e situações do fornecedor. Copiar e ajustar FORA do repositório, por loja. `storeId` e `integrationId` devem ser os mesmos do arquivo original.
- `ack.example.csv`: formato ilustrativo correspondente ao pedido de exemplo da F5.16. Nunca usar como comprovante real.
- `order_ack_import.mjs`: parser CSV estrito e cruzamento com o manifesto, CSV original, configurações da exportação e journal.
- `order_ack_import_cli.mjs`: demonstração, prévia e criação exclusiva de rascunho.
- `test/order_ack_import.test.mjs`: 42 testes automatizados.

## Requisitos de entrada

- Node.js 22+.
- Instalar **antes** F5.16 e F5.17. Usar o MESMO journal persistente de pedidos exportados: nunca recriá-lo, renomeá-lo ou reaproveitá-lo entre clientes.
- CSV original exportado pela F5.16 e seu manifesto adjacente `.csv.manifest.json`, não alterados desde a geração.
- Arquivo JSON exato de configuração da **exportação original** F5.16. Ele precisa mapear `orderId`, `orderReference`, `orderTotal`, `quantity` e usar as mesmas datas/separadores do lote original.
- CSV de retorno do ERP/PDV com `orderReference` igual a `F40-<UUID>` para cada pedido. Permitida ausência de pedidos (aparecerá como `NO_RECEIPT_ROW`); são rejeitados pedidos desconhecidos, duplicados e status não mapeados.
- Suporte a BOM UTF-8, `CRLF` e `LF`, separador `;` ou `,`, aspas padrão CSV; máximo 2 MB, até 3000 linhas e 32 colunas. Campos multilinha são intencionalmente rejeitados. Arquivos XLSX precisam ser exportados para CSV **sem perder as referências**. Não adicionar CPF, e-mail, nomes, endereços ou credenciais às configurações ou comprovantes.
- Para conferir valores, mapear `orderTotal` e `decimalSeparator` (aceita, por exemplo, `119,90`, `R$ 119,90` e agrupamento válido como `1.234,56`). Para conferir a quantidade **de linhas de itens**, mapear `itemCount`. Sem essas colunas, o relatório mostra evidência insuficiente, e nunca aprovação automática.

## Demonstração sem rede

Abra o PowerShell na pasta `loja_roupas\backend`:

```powershell
node connectors\csv\order_ack_import_cli.mjs --demo
node --test connectors\csv\test\order_ack_import.test.mjs
```

`--demo` não acessa API nem cria arquivos.

## Caminhos do cliente e prévia

Todos os caminhos abaixo devem ser absolutos, de arquivos diferentes e em pasta privada (fora do Git). Ajuste os exemplos para os locais da loja:

```powershell
$env:F40_CSV_ACK_ERP_FILE = 'C:\f40\cliente-a\retornos\retorno-lote-001.csv'
$env:F40_CSV_ACK_SETTINGS = 'C:\f40\cliente-a\config\retorno-mapeamento.json'
$env:F40_CSV_ACK_EXPORT_CSV = 'C:\f40\cliente-a\exportacoes\lote-001.csv'
$env:F40_CSV_ACK_EXPORT_SETTINGS = 'C:\f40\cliente-a\config\pedidos-exportacao.json'
$env:F40_CSV_ACK_EXPORT_MANIFEST = 'C:\f40\cliente-a\exportacoes\lote-001.csv.manifest.json'
$env:F40_CSV_ACK_STATE = 'C:\f40\cliente-a\pedidos_estado.json'
$env:F40_CSV_ACK_DRAFT = 'C:\f40\cliente-a\conferencias\lote-001.rascunho.json'
node connectors\csv\order_ack_import_cli.mjs --preview
```

A prévia analisa somente os arquivos locais, não grava estado nem produz conciliação. Confira `reportedImported`, `reportedRejected`, `reportedPending`, `missingFromReturn`, `withFindings`, e todas as ocorrências de `findings`. Copie o `summary.previewSha256`.

## Criar rascunho (não registrar conciliação)

Depois de conferir a prévia:

```powershell
$env:F40_CSV_ACK_EXPECTED_SHA256 = '<SHA256_EXATO_DA_PREVIA>'
$env:F40_CSV_ACK_CONFIRM = 'CONFIRMO_APENAS_RASCUNHO'
node connectors\csv\order_ack_import_cli.mjs --draft
```

O comando reabre e valida os arquivos e grava o rascunho somente se a prévia ainda é idêntica. Cria exclusivamente (`wx`, **sem sobrescrever**) um JSON de decisões **todos `UNCERTAIN`**. O hash ajuda a detectar mudança nos arquivos, mas não autentica o ERP. Não modifica o journal, não libera reenvio, não modifica qualquer pedido e não indica que a importação ocorreu.

## Completar manualmente pela F5.17

1. Abra o comprovante/relatório real dentro do ERP, confira a referência, as variantes/quantidades e o total de cada pedido. Guarde evidência externa independente em local protegido.
2. Faça uma **cópia** do rascunho gerado para o campo `F40_CSV_RECONCILE_RECEIPT` da F5.17, em arquivo próprio. Complete `operatorAlias`, `verifiedAt` (horário ISO real com fuso), `evidenceRef` (identificador não sensível da prova) e só então `acknowledgement: "CONFIRMO_CONFERENCIA_NO_ERP"`.
3. Revise cada `decision` em conjunto com a evidência. Mantenha `UNCERTAIN` para casos não verificados. `REJECTED` exige motivo; `IMPORTED` **somente com** `externalOrderId` confirmado e `checks:{"reference":true,"items":true,"total":true}` conferidos pelo operador.
4. Use a prévia `order_reconcile_cli.mjs --preview` da F5.17, copie o hash dela e só depois execute o registro com confirmação dupla da F5.17. Nunca cole o `previewSha256` da F5.18 no campo da F5.17; os hashes são diferentes e têm propósitos distintos.
5. Após o registro F5.17, o journal continua bloqueando reexportação automática. Se houver estado/relatório incerto, suspenda o fluxo e investigue sem apagar o journal ou os arquivos.

## Segurança e limites

O leitor rejeita respostas com IDs desconhecidos/duplicados, códigos externos inválidos, valores malformados, status desconhecidos, lote/loja divergentes, hash do original alterado ou estado não preparado. Não propaga texto bruto de colunas não mapeadas para relatório. Os caminhos de arquivos locais devem ter ACLs do Windows adequadas; `0600` não substitui as ACLs. Guarde comprovantes originais e não cole dados pessoais/tokens nos logs, issues ou repositório.

Este pacote **não** adiciona nova migration, variável ao backend Railway, rotas da API ou telas Flutter. É um utilitário local opcional para implantação assistida. Não oferece suporte genérico a todos os fornecedores, não constitui certificação ou prova de importação pelo ERP e não autoriza produção sem homologação real.
