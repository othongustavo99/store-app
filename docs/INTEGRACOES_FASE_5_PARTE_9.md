# F5.9 — Contrato de monitoramento

## `POST /v1/external/health/report`

Autenticacao: `Authorization: Bearer f40i_...`; escopo `events.read`. Integracao identificada exclusivamente pelo token, nunca por identificador enviado no corpo. Rate limit de 30 requisicoes por minuto (configuracao atual do backend).

Exemplo de corpo:

```json
{
  "component": "ORDERS",
  "result": "WARNING",
  "summary": {"claimed": 3, "acknowledged": 2, "review": 1, "retry": 0, "ackErrors": 0}
}
```

Resultados: `OK`, `WARNING`, `ERROR`. `ERROR` exige `errorCode` padronizado `[A-Z][A-Z0-9_]{2,47}`. Nao aceita campos arbitrarios, identificadores de cliente, links ou mensagens livres. Timestamp e calculado pelo PostgreSQL. Resposta `{recorded:true,reportedAt}`.

## `GET /v1/stores/:storeId/integrations/:integrationId/health`

Autenticacao: token do usuario OWNER. Retorna `component`, `status`, `staleAfterSeconds`, `lastResult`, `lastReportAt`, `lastOkAt`, `lastErrorCode`, `lastSummary`. Estados possiveis: `NO_REPORT`, `REPORTING`, `ATTENTION`, `STALE`, `REVOKED`.

A classificacao de `STALE` comeca quando o ultimo heartbeat tem mais de 180 segundos. Um worker ativo pode estar com conectividade indisponivel; `REPORTING` nao implica ERP disponivel.

## Seguranca e operacionalizacao

- `external_connector_health` tem chave por integracao e componente e FK composta para a loja.
- O POST rejeita integracoes revogadas, inclusive se houver revogacao entre a autenticacao e a escrita.
- O worker reporta sempre apos o processamento do ciclo. Um erro do monitoramento nao dispara uma segunda venda.
- Somente o processo de pedidos (`ORDERS`) informa saude nessa fase. A sincronizacao de catalogo e estoque podera ganhar componentes distintos no futuro.
- Nenhum token fica no banco de monitoramento e nenhuma mensagem de erro livre e recebida.
