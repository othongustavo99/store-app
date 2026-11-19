# Fase 5.5 — Exportacao assistida Bling e Omie

## Novo codigo

- `backend/connectors/shared/safe_order_export.mjs`: regras financeiras, cliente Store App com allowlist de rotas, journal transacional local, exclusao mutua, criacao e conciliacao segura.
- `backend/connectors/shared/order_export_cli.mjs`: CLI em modo preview/aplicacao controlada/conciliacao.
- `backend/connectors/bling/order_export_adapter.mjs`: mapeia pedido pago para Bling API V3 com referencia `numeroLoja`.
- `backend/connectors/bling/order_export_api.mjs`: `POST /pedidos/vendas` (sem retry), `GET /pedidos/vendas/{id}`.
- `backend/connectors/omie/order_export_adapter.mjs`: mapeia pedido para API Omie `IncluirPedido`; exige campos tributarios informados por loja, usa `codigo_pedido_integracao`.
- `backend/connectors/omie/order_export_api.mjs`: `IncluirPedido` e `ConsultarPedido` (sem retry de escrita).
- Exemplos JSON e testes de regressao.

## Fluxo de seguranca

- Entrada: pedidos reais, pagos e de retirada; um cliente ja mapeado e uma variante ja vinculada ao ID do ERP.
- `PREVIEW`: valida e mostra resumo sem POST remoto.
- `APPLY`: journal `CREATE_IN_FLIGHT` persistido antes do POST; a primeira resposta confirmada grava `CREATED`; consulta remota valida ID e referencia de origem; vinculo Store App grava `LINKED`.
- Resultado incerto: `NEEDS_RECONCILIATION`; reenvio da criacao BLOQUEADO ate verificacao humana.
- Estado `CREATED`: repeticao so faz GET remoto e POST de vinculacao ao Store App, nunca cria novo pedido no ERP.
- Credenciais isoladas por loja, token somente em memoria do processo; journal em pasta privada, nunca no Git.
- Nenhuma confirmacao automatica de eventos da fila da Fase 4.

## Restricoes conscientemente impostas

Nao tenta tratar descontos, fretes, delivery ou documento fiscal. Nao modifica backend ou Flutter. O ERP pode ter efeitos colaterais de lancamento de estoque/recebiveis configurados pelo fornecedor. Testar ambiente real antes de uso comercial.

Os campos exigidos na criacao, a formatacao de respostas e todos os efeitos comerciais precisam de homologacao com Omie e Bling. Testes unitarios simulam os contratos usados.
