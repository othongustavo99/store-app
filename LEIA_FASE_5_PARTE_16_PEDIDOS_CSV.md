# Frequencia40 Store App | Fase 5.16 — Pedidos por CSV

## Aplicacao incremental

1. Faça commit de seguranca. Confirme aplicadas as Fases 1–5.15 e o hotfix do Windows da auditoria.
2. Extraia este ZIP na **raiz `loja_roupas`**, nao dentro de `backend`. Preserve a arvore; substitua apenas os arquivos marcados como SUBSTITUIR no `MANIFESTO_FASE_5_PARTE_16.json`.
3. Nenhum arquivo da interface Flutter, migration, backend/src ou checkout e alterado. As modificacoes sao no conector CSV e no avaliador offline.

## Testes (PowerShell na raiz `loja_roupas`)

```powershell
cd backend
node connectors\csv\order_export_cli.mjs --demo
node --test connectors\csv\test\order_export.test.mjs
node --test connectors\assessment\test\assessment.test.mjs
node --test connectors\shared\test\*.test.mjs connectors\omie\test\*.test.mjs connectors\bling\test\*.test.mjs connectors\olist\test\*.test.mjs connectors\csv\test\*.test.mjs connectors\assessment\test\*.test.mjs
npm run build
npm test
```

**Nota PowerShell:** a expansao de `*.test.mjs` depende do shell/Node. Se a linha de teste conjunto nao aceitar varios globs no seu PowerShell, execute um `node --test` por diretorio (ou use `node --test` dentro de `connectors\csv` e depois `connectors\assessment`). Os testes do backend podem exigir `npm ci` se ainda nao estiverem instaladas as dependencias.

## Configuracao real por loja

Leia primeiro `backend/connectors/csv/ORDER_EXPORT_README.md`.

Arquivo `backend/connectors/csv/orders.settings.example.json` tem valores FICTICIOS. Copie para uma pasta fora do repositorio e coloque UUIDs reais `storeId`, `integrationId` e `orderIds`, codigo externo cadastrado em cada variante e nomes de colunas aceitos pelo fornecedor. Preencher `dateTimeZone`, em geral `America/Sao_Paulo`. Nao inclua token no JSON.

Com integracoes homologadas/ativadas em ambiente apropriado, configure `F40_CSV_ORDERS_CONFIG`, `F40_API_URL`, `F40_INTEGRATION_TOKEN` e execute `node connectors\csv\order_export_cli.mjs --preview`. Esta etapa chama apenas GETs do Store App. Confira resumo e copie o SHA-256 da previa.

Para gravacao em um diretorio privado, configure **todos**: `F40_CSV_ORDERS_STATE` (caminho absoluto persistente da loja/integracao), `F40_CSV_ORDERS_OUTPUT` (novo caminho absoluto terminado em `.csv`), `F40_CSV_ORDER_EXPORT_CONFIRM=CONFIRMO_GERACAO_MANUAL`, `F40_CSV_ORDERS_EXPECTED_SHA256` igual ao hash da previa; rode `node connectors\csv\order_export_cli.mjs --write`.

Nunca apagar ou renomear o estado para forcar replay, nem trocar o arquivo de estado entre clientes. Em caso de erro/arquivo incompleto, conciliar manualmente antes de qualquer nova tentativa.

## Railway / producao

- **Nenhuma nova variavel no backend Railway** (as variaveis `F40_CSV_ORDERS_*` pertencem ao processo de exportacao externo, isolado por loja).
- Nenhuma migration nova. Nenhuma alteracao de servidor, API ou Flutter. Deploy do backend principal nao necessario por esta fase.
- Sem necessidade de criar conta em um ERP agora: o modo `--demo` e os testes sao totalmente locais.
- **Gerar arquivo CSV nao significa pedido importado, aceito, reconciliado ou fiscalmente regular no ERP.** Validar layout e processo manual com a ferramenta real do cliente antes de vender esse fluxo como integrado.
