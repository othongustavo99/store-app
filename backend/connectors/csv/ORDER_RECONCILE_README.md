# Frequência40 | Fase 5.17 — Conciliação humana de lotes CSV de pedidos

## Limite e objetivo

Este utilitário é **local e offline**. Ele confere os arquivos de saída da Fase 5.16 e **registra o resultado observado manualmente no ERP/PDV** pelo responsável. Ele não lê registros do ERP, não faz chamadas de rede, não atualiza a API do Store App, não cria pedido externo e não altera estoque, pagamento, nota fiscal ou status financeiro. Não declara a integração homologada ou pronta para produção. A classificação `IMPORTED` é **relatada por um humano**, nunca verificada pelo programa no fornecedor.

Antes de registrar, o operador precisa importar manualmente o CSV em ambiente de homologação, consultar as vendas no sistema real e guardar evidência externa verificável (protocolo, relatório de importação, consulta no ERP). **Não basta clicar em importar: a existência e a igualdade do pedido no ERP devem ser conferidas.**

A ferramenta aceita somente lotes em `FILE_CREATED` cujo manifesto `.csv.manifest.json`, bytes do CSV e journal original estejam coerentes. Um estado em `RESERVED`, saída incompleta, lote repetido, arquivo adulterado ou vinculado a outro cliente bloqueia a operação. O arquivo de auditoria é gravado com criação exclusiva e o **mesmo lock do journal F5.16** protege contra concorrência dentro da instalação. O relatório registrado possui SHA-256 próprio. O journal mantém cada pedido bloqueado para novas exportações independentemente do resultado informado (até mesmo `REJECTED`).

## Requisitos

- Node.js 22 ou superior.
- Fase 5.16 instalada e CSV original efetivamente criado com seu manifesto.
- **Mesmo arquivo de estado `F40_CSV_ORDERS_STATE` da exportação anterior**, sem cópia, exclusão, reset ou troca de caminho. Uma única pasta de estado persistente para cada loja/integração.
- Arquivo de conferência JSON editado fora do repositório, com as IDs reais copiadas do manifesto. Não usar `orders.reconciliation.example.json` diretamente: os dados nele são inventados.
- Uma decisão por **todos** os `orderIds` do manifesto, sem omitir, trocar ou duplicar.

## Exemplo offline sem credenciais

Na pasta `backend`:

```powershell
node connectors\csv\order_reconcile_cli.mjs --demo
node --test connectors\csv\test\order_reconcile.test.mjs
```

O comando `--demo` não cria relatório nem altera arquivos e não faz rede.

## Configurar comprovante de conferência (JSON)

Copie `backend/connectors/csv/orders.reconciliation.example.json` para uma pasta privada fora do repositório. Ajuste:

- `storeId`, `integrationId`, `batchId`, `exportSha256` e **todos** os `orderId`, exatamente como estão no manifesto gerado pela F5.16.
- `operatorAlias`: identificador interno curto, sem e-mail nem CPF.
- `verifiedAt`: horário real da conferência em formato ISO 8601 com fuso (`Z` ou `-03:00`), posterior à geração do CSV, nunca inventado.
- `evidenceRef`: identificador do protocolo/registro da prova conservada em local seguro; **não** inserir conteúdo de comprovantes, nomes, documentos pessoais ou senha no JSON.
- `acknowledgement`: deve permanecer `CONFIRMO_CONFERENCIA_NO_ERP` somente depois de inspecionar o ERP real.
- `decisions`: um objeto por pedido, resultado `IMPORTED`, `REJECTED` ou `UNCERTAIN`.

Para um pedido efetivamente **conferido manualmente como importado**, use:

```json
{"orderId":"22222222-2222-4222-8222-222222222222","result":"IMPORTED","externalOrderId":"ERP-1234","checks":{"reference":true,"items":true,"total":true}}
```

Os três campos `checks` atestam que o operador conferiu a referência do pedido, as variantes/quantidades e o total. Quando qualquer um divergir ou não puder ser conferido, **NÃO use `IMPORTED`**.

Para rejeitado ou incerto, não inclua `externalOrderId` nem `checks`:

```json
{"orderId":"22222222-2222-4222-8222-222222222222","result":"UNCERTAIN","reasonCode":"VALUE_DIVERGENCE"}
```

Códigos aceitos de `reasonCode`: `ERP_REJECTED`, `NOT_FOUND`, `QUANTITY_DIVERGENCE`, `VALUE_DIVERGENCE`, `REFERENCE_DIVERGENCE`, `DUPLICATE_SUSPECTED`, `NO_EVIDENCE`, `OTHER`, `UNKNOWN`. A prévia conta divergências de itens, valores, referência e duplicidade. **Resultado `REJECTED` ou `NOT_FOUND` NÃO autoriza reexportar automaticamente**; pode ter ocorrido importação parcial ou duplicada.

## Operação real: primeiro prévia, depois registro explícito

No PowerShell, estando em `loja_roupas/backend`:

```powershell
$env:F40_CSV_RECONCILE_CSV = 'C:\f40\cliente-a\exportacoes\lote-001.csv'
$env:F40_CSV_RECONCILE_MANIFEST = 'C:\f40\cliente-a\exportacoes\lote-001.csv.manifest.json'
$env:F40_CSV_RECONCILE_STATE = 'C:\f40\cliente-a\pedidos_estado.json'
$env:F40_CSV_RECONCILE_RECEIPT = 'C:\f40\cliente-a\conferencias\lote-001.conferido.json'
$env:F40_CSV_RECONCILE_REPORT = 'C:\f40\cliente-a\conferencias\lote-001.relatorio.json'
node connectors\csv\order_reconcile_cli.mjs --preview
```

Confira contagens `reportedImported`, `reportedRejected`, `uncertain`, `divergent`, vínculo da loja e `previewSha256`. O preview **não grava** nada. Copie o hash exato para o terminal:

```powershell
$env:F40_CSV_RECONCILE_EXPECTED_SHA256 = '<HASH_SHA256_DA_PREVIA>'
$env:F40_CSV_RECONCILE_CONFIRM = 'CONFIRMO_REGISTRO_MANUAL'
node connectors\csv\order_reconcile_cli.mjs --record
```

`--record` reabre todos os arquivos sob lock e só registra se o hash de prévia coincidir. Cria **um novo** relatório JSON (`F40_CSV_RECONCILE_REPORT`) sem sobrescrever arquivos e atualiza no journal apenas os registros de conferência manual. Marcação `MANUALLY_REVIEWED` não significa status pago, entrega feita ou pedido reconhecido pela API externa. `externalApiVerified`, `erpReceivedConfirmedByApi`, `productionApproved` e `reexportAuthorized` permanecem falsos.

Se houver saída `CSV_RECONCILE_STATE_UNCERTAIN_MANUAL_REVIEW`, divergência entre relatório e journal, arquivo `.lock` antigo ou falha na gravação: **pare a operação, preserve TODOS os arquivos e faça revisão humana**. Não apague lock/journal/relatório para repetir. Não mova um journal para outra máquina enquanto houver processo ativo. O modo CSV não substitui uma integração ERP via API autenticada.

## Privacidade, auditoria e limites

Armazene CSV, manifesto, comprovante e relatório fora do repositório e proteja por permissões/ACLs do Windows; o modo `0600` não substitui ACLs do Windows. Não inclua credenciais em arquivos JSON. Hashes SHA-256 detectam alterações acidentais e dão rastreabilidade, mas **não** são assinatura eletrônica de origem, prova jurídica ou evidência independente de aceite pelo ERP.

Se um pedido estava `RESERVED` por erro da F5.16 ou a importação real gerou divergências, use tratamento manual com o cliente/fornecedor; esta fase intencionalmente **não oferece** desbloqueio de pedido ou reenvio.
