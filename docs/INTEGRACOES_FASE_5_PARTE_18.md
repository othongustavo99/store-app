# Fase 5.18 — Retorno CSV assistido de pedidos de ERP

Complementa F5.16 (arquivo de saída e manifesto) e F5.17 (conciliação humana com registro sob lock). Não altera seus contratos ou segurança. Novos arquivos concentrados em `backend/connectors/csv`.

**Prévia**: compara arquivo de retorno (CSV) com o lote original imutável, `storeId`, `integrationId`, `orderId` e referência `F40-{UUID}`, status mapeado pelo cliente, valor por pedido e quantidade de linhas de produto. Recusa origens ambiguamente misturadas, códigos desconhecidos, duplicidades, arquivos adulterados e estados diferentes de `FILE_CREATED`.

**Rascunho**: exige hash de prévia e confirmação especial; somente gera arquivo JSON novo, sem confirmação humana nem decisão `IMPORTED`. Ao copiar para F5.17, o responsável deve conferir cada pedido dentro do ERP e preencher manualmente os campos obrigatórios.

**Sem automação de aceite**: não marca `erpReceived`, não altera status do Store App, pagamento, estoque, faturamento, fiscal ou permissão de retry. Não testa comunicação externa e não é homologação de fornecedor.

Para comandos e exemplos PowerShell: `LEIA_FASE_5_PARTE_18_RETORNO_CSV.md` e `backend/connectors/csv/ACK_IMPORT_README.md`.
