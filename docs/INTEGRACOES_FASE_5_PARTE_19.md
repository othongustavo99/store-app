# Frequência40 — Integrações ERP/PDV — Fase 5.19

## Dossiê comercial offline

**Motivação:** antes de aceitar uma implantação para um novo cliente, consolidar
as informações de descoberta e os comprovantes produzidos nas fases anteriores,
sem transformar evidência manual em um sinal de produção homologada.

**Módulo:** `backend/connectors/deployment/`.

### Fonte de dados

- Avaliação de compatibilidade F5.15 (`assessProfile`): bloqueios, escopo,
  parecer conservador.
- Checklist operacional F5.19 (seis declarações humanas: escopo, LGPD,
  procedimento, reversão, piloto e revisão comercial).
- Evidências opcionais de um lote de pedidos exportado na F5.16:
  `*.csv` e `*.csv.manifest.json`, conferidos contra SHA-256, UUIDs e linhas.
- Relatório de reconciliação F5.17: formato, UUIDs, IDs de pedidos, hash do
  preview e exigência de tripla conferência para pedidos alegados como importados.
- Retorno F5.18: apenas inventariado por SHA-256; a interpretação de colunas
  permanece na ferramenta F5.18.

### Estados do parecer

- `SCOPE_BLOCKED`: algo solicitado está fora do escopo implementado.
- `DISCOVERY_PENDING`: faltam confirmações técnicas da F5.15.
- `PREPARATION_PENDING`: falta checklist operacional.
- `ASSISTED_PILOT_ELIGIBLE`: critérios declaratórios mínimos para piloto;
  não aprova operação real.
- `HUMAN_RELEASE_REVIEW_REQUIRED`: material pronto para análise humana;
  não autoriza produção.

**Nunca existe `PRODUCTION_APPROVED`.** Todas as respostas mantêm
`productionAuthorized=false`, `activationPerformed=false` e
`csvEvidence.externalApiVerified=false`.

### Proteções

Validação estrita de campos, leitura com limite de bytes, arquivos locais
confinados à pasta do cliente, sem leitura de symlink, sem sobrescrever
relatório existente. O resumo não expõe CSV bruto, token, credenciais, CPF
ou dados de compradores. Testes de troca de loja/integração, manipulação de
CSV, manifesto, preview e confirmação manual.

### Limitações

A existência de um CSV de retorno não equivale a confirmação autenticada; a
conferência da F5.17 continua obrigatória. Não inclui homologação fiscal,
estoque fracionário, depósitos múltiplos, emissão de NF-e, callbacks externos,
ativação de worker nem mudanças de banco. Novos fornecedores exigem adaptador
ou procedimento autorizado específico.
