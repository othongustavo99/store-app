# Fase 5.17 — Conciliação assistida das exportações CSV

**Novo fluxo de operação**

1. F5.16 gera CSV + manifesto + reserva no journal compartilhado com a integração da loja.
2. Um operador autorizado importa o CSV no ERP/PDV **manualmente**, verifica os pedidos individualmente e guarda evidência externa.
3. F5.17 lê CSV/manifesto/journal e o comprovante escrito pelo operador. Valida integridade, isolamento por loja, unicidade, status e checagens declaradas de referência, itens e total.
4. `--preview` emite resumo e SHA de aprovação; `--record` precisa desse mesmo SHA e confirmação explícita.
5. Cria um novo relatório JSON com hash próprio e marca pedidos como `MANUALLY_REVIEWED` no **journal local**, sem permitir outra exportação.

**Estados do comprovante:** `IMPORTED` apenas se operador conferiu no sistema de destino a referência, itens, total e ID externo; `REJECTED` se o operador identificou recusa; `UNCERTAIN` quando há informação incompleta, divergência ou risco de duplicidade. Esses estados são relatos, não respostas autenticadas da API do fornecedor.

**Não atendido:** confirmar ERP via API; conciliar fiscalmente; aprovar produção; reenvio controlado de pedidos; sincronização de estoque, notas e pagamentos; múltiplos operadores usando journals independentes. Todos exigem projetos de integração/homologação próprios.

**Arquivos principais:** `backend/connectors/csv/order_reconcile.mjs`, `order_reconcile_state.mjs`, `order_reconcile_cli.mjs`, `orders.reconciliation.example.json`, `ORDER_RECONCILE_README.md` e os testes do diretório `test/`. Leia o manual antes de registrar um caso real.
