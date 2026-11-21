# Integrações Frequência40 — Fase 5.10

## Diagnóstico técnico por integração e por loja

Endpoint protegido: `GET /v1/stores/{storeId}/integrations/{integrationId}/readiness`

A nova rota, apenas de leitura, verifica:

- autenticação OWNER e isolamento por `store_id`;
- estado de revogação, modo de entrega e permissões de exportação de pedidos;
- cobertura dos IDs externos de variantes ativas;
- quantidade de eventos em falha definitiva no modo LEASED;
- atualidade e resultado do último relatório do worker (não verifica conectividade do ERP).

### Interpretando o retorno

- `NEEDS_ACTION`: pelo menos uma pendência técnica do checklist.
- `CHECKLIST_OK`: todos os checks locais passaram, **sem homologação automática**.
- `homologated: false`: fixo; a homologação real exige validação externa e não pode ser determinada por essa rota.

O campo `checks` possui identificadores estáveis `ACTIVE`, `ORDER_PERMISSIONS`, `LEASED_QUEUE`, `CATALOG_MAPPED`, `NO_DEAD_EVENTS`, `WORKER_REPORTING`. A avaliação não realiza escritas no banco nem aciona o processo de sincronização. Os totais se limitam à loja e ao conector selecionados, sem compartilhar PII ou credenciais.

Não usar o relatório como prova de autorização fiscal, estabilidade de pagamentos, validade de tokens OAuth, disponibilidade do ERP ou garantia de que cada pedido foi integrado. Para essas garantias, é necessário homologar um ciclo real com o fornecedor.
