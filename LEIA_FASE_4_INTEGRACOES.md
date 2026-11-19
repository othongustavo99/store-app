# Store App Frequência40 — Fase 4: patch de integração ERP/PDV

**O que esta fase faz:** acrescenta entrega confiável de eventos via leasing, tentativas com backoff, fila de falhas `DEAD`, diagnóstico por loja e executor de referência para adaptadores ERP/PDV. **Ainda não existe conexão homologada com fornecedor comercial específico.**

## Antes de aplicar

1. Confirme que as **Fases 1, 2 e 3** já estão instaladas (migrations `019`, `020` e `021`).
2. Faça **backup do PostgreSQL** da Railway e um **commit de segurança** do projeto.
3. Descompacte este ZIP **na raiz `loja_roupas`** e aplique somente os caminhos relacionados no `MANIFESTO_FASE_4_INTEGRACOES.json`. Não apague arquivos existentes e não substitua `backend` inteiro.
4. Este patch substitui `backend/src/integrations/core.ts` e `backend/src/routes/external_integrations.ts` das fases anteriores. Se você fez edições próprias, compare antes de substituir.

## VS Code / PowerShell

```powershell
cd backend
npm ci
npm run build
npm test
```

`npm ci` **fica dentro de `backend`**, onde existe `package-lock.json`. Os testes de integração desta fase usam simulações e precisam de `DATABASE_URL` e `JWT_SECRET` no ambiente/arquivo `.env` para carregar a configuração; não inserimos segredos no ZIP.

## Railway

**Novas variáveis no backend: nenhuma.** Continue utilizando `ENABLE_EXTERNAL_INTEGRATIONS`, definida nas fases anteriores.

1. Antes do deploy, em ambiente de homologação, mantenha `ENABLE_EXTERNAL_INTEGRATIONS=false`.
2. O Dockerfile existente aplica migrations; verifique nos logs o registro `Aplicada: 022_external_event_delivery.sql`.
3. Faça testes em PostgreSQL real e confira `/health/ready`.
4. Só ative as integrações existentes quando os testes passarem. O modo novo continua desativado (`POLL`) para todas elas até o proprietário ativar individualmente `LEASED`.
5. **Nunca habilite `LEASED` em uma integração em produção enquanto o consumidor antigo continuar rodando.** Planeje troca coordenada de workers para prevenir duplicações.

## Mudanças importantes

- `022_external_event_delivery.sql` é nova e incremental; não editar migrations antigas.
- `GET /v1/external/events` e `POST /v1/external/events/ack` antigos continuam funcionando em integrações `POLL`.
- Novas rotas de `claim`, `ack`, `nack`, diagnósticos e reprocessamento para integrações `LEASED`.
- Token do lease é mostrado somente na resposta de `claim` e não deve ser armazenado em logs.
- O executor genérico fica em `backend/connectors/reference`, **não é uma integração pronta**; o `adapter.example.mjs` inicia com `ready=false` para impedir processamento acidental.

## Validação realizada nesta entrega

- `npm run build`: TypeScript compilou.
- `npm test`: 186 testes passaram, incluindo 11 testes novos de leasing, ACK idempotente, NACK, falhas, autorização e reprocessamento.
- `node --check`: executor e adaptador de exemplo sem erro de sintaxe.
- **Ainda não aplicado em PostgreSQL real, nem testado com Bling/Omie/Olist/Tiny/TOTVS/PDV de terceiros.**

A documentação detalhada está em `docs/INTEGRACOES_FASE_4.md` e o contrato atualizado em `docs/openapi_external_v1.yaml`.
