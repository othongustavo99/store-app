# Fase 5.8 — Central visual das integrações

## Contrato de backend utilizado (sem alterações)

| Operação | Método/rota | Autorização |
| --- | --- | --- |
| Listar conexões | `GET /v1/stores/:storeId/integrations` | OWNER |
| Criar credencial | `POST /v1/stores/:storeId/integrations` | OWNER |
| Revogar | `POST /v1/stores/:storeId/integrations/:integrationId/revoke` | OWNER |
| Ver fila | `GET /v1/stores/:storeId/integrations/:integrationId/delivery?limit=20` | OWNER |
| Recolocar evento DEAD na fila | `POST /v1/stores/:storeId/integrations/:integrationId/events/:eventId/retry` | OWNER |

A API autentica o proprietário da loja a cada requisição. A UI obtém a loja por slug usando `LojaApi.fetchStoreId()` e sessão já existente. Os tokens de integração externa **não** são colocados em `Authorization` no Flutter; apenas a sessão do usuário administra o cadastro.

## Cuidados de interpretação

A fila `LEASED` lista eventos materializados e os ainda não materializados separadamente. Os contadores se aplicam à integração selecionada, não a todos os pedidos. No modo `POLL`, não inferir situação de sincronização dos ERPs pelos contadores da fila. A situação do ERP externo é apurada nos relatórios da Fase 5.7 e não é consultada pela UI.

## Ações permitidas

Criação inicial com `catalogAuthority`, `stockAuthority`, `orderAuthority` e `customerDataAccess` desligados. A API dá escopos básicos de leitura (`catalog.read`, `orders.read`, `events.read`, `mapping.write`) e a chave é retornada somente na criação. A interface não armazena a chave depois do fechamento da janela.

Revogação impede novas chamadas com a credencial. Reprocessamento visual deve ser limitado a eventos não relacionados a pedidos e que estejam `DEAD`. Confirme a situação do sistema de destino antes de tentar novamente; o backend não sabe automaticamente se o ERP recebeu a operação.

## Próximas melhorias (não incluídas)

- Healthchecks e ingestão de telemetria dos processos dos conectores com autenticação mútua;
- Gestão completa do ciclo de OAuth via backend, sem expor segredos ao aplicativo;
- Modo seguro de manutenção, rotação de chaves e transferência de autoridade;
- Visão de conciliação no próprio aplicativo a partir de registros confiáveis centralizados;
- Testes de homologação com cada ERP/PDV e manutenção de contratos de API.
