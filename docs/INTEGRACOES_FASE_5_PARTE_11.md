# Fase 5.11 — Perfis de implantação por cliente

A Central de Integrações agora permite registrar, para cada **(store_id, integration_id)**, um perfil administrativo opcional de implantação. Ele é separado dos tokens e configurações privadas do conector.

## Endpoints (OWNER)

| Método | Caminho | Resultado |
|---|---|---|
| GET | `/v1/stores/:storeId/integrations/:integrationId/deployment` | Padrões (`revision:0`) ou perfil salvo |
| PUT | `/v1/stores/:storeId/integrations/:integrationId/deployment` | Atualiza perfil com compare-and-swap `expectedRevision` |

O contrato PUT recebe estritamente `expectedRevision`, `environment`, `workerAlias` e `checks`. Valores extras são rejeitados. `environment` é `HOMOLOGATION` ou `PRODUCTION` **apenas como etiqueta**. `workerAlias` é um identificador administrativo opcional, sem endereço, credencial ou URL. `checks` tem exatamente cinco booleanos: `credentialsSecured`, `providerAccessChecked`, `catalogChecked`, `ordersChecked` e `reconciliationChecked`.

Revisão otimista: a primeira gravação utiliza `expectedRevision:0`, a segunda usa a revisão devolvida pela API, e assim por diante. Concorrência resulta em HTTP 409 e obriga recarregar o formulário. Revogação e acesso a outra loja são bloqueados. Toda alteração válida registra evento de auditoria, sem valores de credenciais.

## Restrições e segurança

- Cada perfil pertence a uma combinação de loja e integração garantida por FK composta.
- Nenhum campo para senha, tokens OAuth, dados do cliente ou observações livres.
- A flag `ENABLE_EXTERNAL_INTEGRATIONS` continua protegendo as rotas.
- O checklist é declaratório e não muda nenhum status de pedido, pagamento ou estoque.
- Completar o checklist **não ativa workers nem representa homologação oficial ou fiscal**.
- A implantação real de Bling, Omie ou Olist/Tiny continua exigindo conta, API, credenciais por cliente, mapeamento e testes com fornecedor real.

## Implantação

A migration 024 deve ser aplicada após as migrations 019–023. Não modificar arquivos SQL já aplicados. O endpoint administrativo novo só estará disponível após atualização do backend e aplicação da migration.

Na Railway, não há novas variáveis obrigatórias. Em sistemas com múltiplos clientes, não compartilhar o mesmo armazenamento de estado nem credenciais entre os conectores. O gerenciamento de processos de worker fora do backend continua manual nesta fase.
