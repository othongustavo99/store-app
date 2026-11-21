# Frequência40 — Store App — Fase 5.11

## Objetivo
Padronizar a implantação de um conector por estabelecimento sem misturar dados ou armazenar segredos no app. Esta etapa NÃO ativa o worker e NÃO homologa fornecedores.

## Arquivos
- Nova migration `backend/migrations/024_external_deployment_profiles.sql`.
- Novo serviço `backend/src/services/external_deployment_profile.ts`.
- Nova rota `backend/src/routes/external_deployment_profile.ts`.
- Novo teste `backend/src/tests/external_deployment_profile.test.ts`.
- Alterado `backend/src/routes/external_integrations.ts` para registrar a rota.
- Alterado `lib/data/repositories/railway_integrations_repository.dart`.
- Alterado `lib/features/admin/integrations/railway_integrations_screen.dart`.
- Novo teste `test/phase511_deployment_screen_test.dart`.

## Instalação
1. Faça backup do banco PostgreSQL e commit antes de instalar.
2. Extraia este ZIP na **raiz `loja_roupas`**, mantendo a estrutura. Não apague nada.
3. Na pasta `backend`: `npm ci`, `npm run build`, `npm test`.
4. Volte à raiz: `flutter pub get`, `flutter analyze`, `flutter test test/phase511_deployment_screen_test.dart`, `flutter test`.
5. Em Railway, publique o backend com `ENABLE_EXTERNAL_INTEGRATIONS=false` inicialmente. Confirme a migration `024_external_deployment_profiles.sql` em banco de homologação e revise os logs.
6. Somente depois dos testes, use os recursos de integração com a flag habilitada em ambiente adequado.

## API
Exige token de proprietário OWNER e o recurso de integrações ativo:

- `GET /v1/stores/:storeId/integrations/:integrationId/deployment`: retorna perfil ou valores padrão, sem segredos.
- `PUT /v1/stores/:storeId/integrations/:integrationId/deployment`: grava checklist declaratório, exige `expectedRevision`, rejeita concorrência (`409`).

Exemplo **sem dados reais**:
```json
{
  "expectedRevision": 0,
  "environment": "HOMOLOGATION",
  "workerAlias": "worker-loja-01",
  "checks": {
    "credentialsSecured": false,
    "providerAccessChecked": false,
    "catalogChecked": false,
    "ordersChecked": false,
    "reconciliationChecked": false
  }
}
```
O campo `workerAlias` é apenas uma identificação administrativa, não é endereço URL, token ou referência ao serviço ativo. Deve conter 3–48 caracteres minúsculos, números e hífens. O backend aceita somente campos especificados; não tem campos livres para credenciais ou dados pessoais.

## Pela interface Flutter
`Administração → Central de Integrações → Implantação` em uma integração ativa. Escolha ambiente (etiqueta administrativa), identificador opcional e marque apenas as conferências efetivamente realizadas. **Marcar tudo não significa que o ERP foi homologado ou que os pedidos serão sincronizados.**

## Procedimento comercial com um cliente
1. Descobrir fornecedor/versão do ERP e se ele disponibiliza a API necessária.
2. Configurar **credenciais reais somente no ambiente privado do conector daquele cliente**, nunca no código, app, log, arquivo versionado ou perfil da implantação.
3. Estabelecer em cada integração a fonte de verdade do catálogo, preço, estoque e pedidos.
4. Validar mapeamentos SKU/GTIN, reservas, pedidos, devoluções e efeitos fiscais/financeiros em homologação com o ERP real.
5. Guardar informações de suporte e o histórico de autorizações em sistema apropriado com controle de acesso. O perfil da fase 5.11 contém somente etiquetas e verificações booleanas.
6. Registrar checklist após validação manual. Ativar trabalhadores de exportação só quando houver homologação, aprovação e supervisão operacional.
7. Em caso de erro incerto de criação de pedido, primeiro reconciliar no ERP; nunca reexportar automaticamente.

## Railway / infraestrutura
- **Uma migration nova: `024_external_deployment_profiles.sql`.**
- **Nenhuma nova variável de ambiente no backend principal.**
- **Nenhuma nova credencial exigida nesta fase.**
- Para várias lojas, mantenha segregação de processos/segredos e armazenamento persistente por cliente. Não reutilize o mesmo arquivo de estado para clientes distintos.

## Limitações honestas
Este patch cobre registro administrativo e isolamento do perfil no banco. Não testa conexão de rede ao fornecedor, não provisiona automaticamente os workers, não configura aplicações OAuth e não certifica integração com um ERP/PDV. A migration e o Flutter devem ser validados no ambiente real antes de ativação.
