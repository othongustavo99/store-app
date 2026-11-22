# Frequência40 Store App — Fase 5.17: Conciliação assistida de pedidos CSV

## Aplicação

Este ZIP é **incremental sobre a Fase 5.16**, incluindo o hotfix da auditoria da Fase 5.15. Faça um commit de segurança e extraia o ZIP na raiz `loja_roupas/`, mantendo a árvore de pastas. **Todos os arquivos são novos**; nenhum arquivo do backend principal, aplicativo Flutter, checkout, banco de dados ou conector de ERP existente foi substituído.

## Testes (PowerShell, na raiz do projeto)

```powershell
cd backend
node connectors\csv\order_reconcile_cli.mjs --demo
node --test connectors\csv\test\order_reconcile.test.mjs
node --test connectors\csv\test\order_export.test.mjs
node --test connectors\assessment\test\assessment.test.mjs
```

Para toda a suíte de conectores, execute `node --test` na pasta `backend` **apenas se** seu ambiente incluir os arquivos `.test.mjs` relevantes. Pode executar cada diretório separadamente (`connectors\shared`, `connectors\bling`, `connectors\omie`, `connectors\olist`, `connectors\csv`, `connectors\assessment`) para evitar problemas de expansão de glob no PowerShell.

**F5.17 não precisa de SDK Flutter, npm ci nem conta de ERP para testar o modo demo**. Não altera o backend TypeScript, portanto não requer nova compilação ou deploy Railway. Os testes completos do backend principal continuam recomendados antes de publicar mudanças acumuladas de outras fases.

## Procedimento para cliente real

Leia obrigatoriamente `backend/connectors/csv/ORDER_RECONCILE_README.md`. O processo exige importação **manual** no ERP, conferência dos pedidos reais com evidência preservada, preenchimento do comprovante JSON da loja, `--preview`, verificação das contagens e hash e, por último, `--record` mediante confirmação.

Use exatamente o journal persistente utilizado na F5.16, o CSV original e o manifesto criado junto dele. Não altere o journal para desbloquear pedidos. Qualquer tentativa de reexportar pedido já reservado/revisado continua bloqueada, inclusive se a importação for relatada como rejeitada ou incerta.

## Railway e segurança

- Nenhuma migration, variável global, alteração de API, Flutter ou deploy do backend Railway.
- As variáveis `F40_CSV_RECONCILE_*` pertencem ao **processo local de operação por cliente**, jamais ao backend compartilhado.
- Sem atualização automática de pagamentos, estoque, emissão fiscal, status de pedido ou reprocessamento da fila.
- A expressão `IMPORTED` é uma **declaração do operador**, não uma confirmação autenticada pelo ERP. A conciliação real e a homologação continuam necessárias para liberar uso comercial desse fluxo.

A verificação de arquivo é fail-closed: IDs de loja, integração, lote e pedidos precisam coincidir; o arquivo CSV é conferido por SHA-256; todos os pedidos exigem resultado; e o arquivo de relatório não pode preexistir. O resultado `MANUALLY_REVIEWED` deixa a origem do dado explícita e não autoriza produção.
