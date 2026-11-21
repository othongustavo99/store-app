# Frequencia40 Store App — Fase 5.9
## Monitoramento dos conectores (Omie, Bling, Olist/Tiny)

Este pacote e INCREMENTAL sobre a Fase 5.8. Aplique na RAIZ da pasta `loja_roupas`, preservando caminhos e substituindo os arquivos identificados no manifesto.

### O que mudou

- Migration `backend/migrations/023_external_connector_health.sql`: ultimo ciclo do worker por integracao, isolado por estabelecimento.
- `POST /v1/external/health/report`: o worker se autentica com a propria credencial `f40i_...` (escopo `events.read`) e reporta somente tipo, resultado, codigo tecnico e contadores.
- `GET /v1/stores/:storeId/integrations/:integrationId/health`: apenas OWNER da loja, sem tokens, sem dados pessoais.
- Worker de pedidos Omie/Bling/Olist: envia relatorio de ciclo concluido, com erro ou sucesso. Se o envio de telemetria falhar, nao altera o ACK nem refaz pedido no ERP.
- Flutter: mostra ultimo ciclo, codigo de erro e contadores no card de cada integracao; exibe quando o relatorio ficou antigo (>3 min) ou ainda nao existe.

**Limite conceitual:** ultimo ciclo recebido NAO e prova de que o ERP esta online ou de que a integracao foi homologada. Apenas reflete o relatorio do processo de pedidos. Sincronizacao de catalogo/estoque nao gera heartbeat nesta fase. Sem o worker rodando, a tela mostrara "Sem relatorio de execucao".

### Arquivos

Consulte `MANIFESTO_FASE_5_PARTE_9.json` para lista exata (novos/substituidos). Nenhum arquivo deve ser excluido.

### Instalar / validar no Windows

1. Salve commit e backup do banco.
2. Extraia o ZIP na pasta `loja_roupas`, mantendo `backend/`, `lib/` e `test/`.
3. Abra o terminal na RAIZ do projeto:

```powershell
cd backend
npm ci
npm run build
npm test
node --test connectors/shared/test/*.test.mjs
node --test connectors/bling/test/*.test.mjs
node --test connectors/omie/test/*.test.mjs
node --test connectors/olist/test/*.test.mjs
cd ..
flutter pub get
flutter analyze
flutter test test/phase58_integrations_screen_test.dart
flutter test test/phase59_connector_health_screen_test.dart
flutter test
```

### Railway

- No backend principal: **nenhuma variavel nova**. Mantenha as existentes; `ENABLE_EXTERNAL_INTEGRATIONS` controla todas as APIs de integracao.
- Nova migration: `023_external_connector_health.sql`. O Dockerfile atual roda as migrations antes de iniciar o servidor. Confira no log `Aplicada: 023_external_connector_health.sql` antes de liberar a interface.
- Se migrar em ambiente de homologacao, mantenha inicialmente `ENABLE_EXTERNAL_INTEGRATIONS=false`; mude para `true` somente apos testes e com fluxo de ERP explicitamente autorizado.
- Os processos de conectores Omie/Bling/Olist continuam usando `F40_API_URL` e `F40_INTEGRATION_TOKEN` ja utilizados na Fase 5.6. Nenhum token de ERP deve ser colocado no app Flutter.
- Os workers so reportam ciclos quando estao rodando em modo homologado. Nao inicie a fila de exportacao apenas para ver "conectado" na tela.

### Criterios de aceitacao

1. Nova tela mostra "Sem relatorio de execucao" se nao ha worker.
2. Token de outro sistema/usuario nao consegue postar heartbeat; somente a credencial de integracao autorizada.
3. OWNER consulta apenas integracoes da sua loja.
4. Um worker que reportou ha mais de tres minutos aparece "Sem relatorio recente".
5. Falha no relatorio nao provoca ACK duplicado, NACK indevido nem recriacao de pedidos.
6. Nenhuma resposta completa do ERP, credencial, CPF ou contato vai para a tabela de saude.

### Testes executados neste ambiente

- `npm run build`: aprovado.
- Backend: 192/192 testes aprovados com `DATABASE_URL`/`JWT_SECRET` de teste (nao conectaram a um PostgreSQL real).
- Shared connectors: 55/55.
- Bling: 18/18; Omie: 12/12; Olist: 33/33. Total: **310/310 testes Node/TypeScript**.
- Nao executei Flutter neste ambiente por ausencia do SDK. A migration 023 nao foi executada contra PostgreSQL real, e nenhum ERP foi homologado nesta etapa.

### Reversao

Se a interface falhar, pare os workers e desabilite as integracoes antes de restaurar a versao anterior. Nao apague a tabela da migration 023 sem avaliar os dados ja registrados; migrations anteriores nao devem ser editadas. O monitoramento e informativo e nao afeta movimentacoes de estoque ou a emissao fiscal.
