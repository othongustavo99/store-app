# Fase 5.12 — Pré-homologação operacional ERP/PDV

## Contrato HTTP
`GET /v1/stores/{storeId}/integrations/{integrationId}/go-live-preflight`

- `Authorization: Bearer <access token de um usuário OWNER>`.
- `401` se não houver sessão; `403` sem permissão; `404` se a integração não pertence à loja; `503` com integrações desabilitadas.
- Não aceita payload, não altera banco, não inicia worker ou envia eventos.
- Resposta inclui `provider`, `status`, `checkedAt`, `checks` (`code`, `ok`, `detail`), `summary`, `pendingCodes`, `counts`, `deploymentRevision` e campos de segurança definidos explicitamente como `false`.

## Exemplo ilustrativo, não uma aprovação real
```json
{
  "provider": "bling",
  "status": "NEEDS_ACTION",
  "summary": {"passed": 12, "total": 14, "pending": 2},
  "pendingCodes": ["TECH_WORKER_REPORTING", "HOMOLOGATION_ENVIRONMENT"],
  "homologated": false,
  "productionApproved": false,
  "automationEnabledByThisCheck": false,
  "manualValidationRequired": true
}
```
O exemplo acima mostra apenas parte da resposta; os valores são ilustrativos.

## Fonte das verificações
- **Fase 5.10:** credencial não revogada, escopos e autoridade para pedidos, fila em LEASED, todas as variantes ativas mapeadas, ausência de eventos DEAD, relatório recente do worker de pedidos com resultado OK.
- **Fase 5.11:** perfil presente, ambiente HOMOLOGATION, alias do worker, confirmação das cinco conferências declaradas pelo responsável.
- A presença de um relatório do worker **não testa** a API do ERP.
- O checklist da implantação é **declaratório**, não apresenta evidência independente de homologação.

## Para aprovação comercial futura
Executar com o estabelecimento e o fornecedor os testes reais: autenticação/renovação OAuth, importação e vínculo das variantes, transações de estoque simultâneas, criação idempotente de pedidos, recuperação após timeout, conciliação de status/cancelamentos/estornos, privacidade e direitos do cliente, tratamento fiscal e suporte em incidentes. Registrar resultados fora de campos de segredos e sob procedimentos LGPD.

Não crie um endpoint que ative produção diretamente com base em `status === 'READY_FOR_SUPERVISED_VALIDATION'`. Esta etapa é somente uma preparação para testes assistidos.
