# Frequência40 — Store App / Fase 5.12
## Pré-homologação operacional de integrações ERP/PDV

### Objetivo
Reunir o diagnóstico técnico da Fase 5.10 e o perfil de implantação da Fase 5.11 em uma consulta única, **somente de leitura**, por loja/integração. O resultado não homologa fornecedores, não certifica emissão fiscal, não ativa conectores, não altera pedidos e não concede acesso à produção.

### Antes de aplicar
- Este é um patch **incremental**: exige as Fases 1 a 5.11 já aplicadas, incluindo a migration `024_external_deployment_profiles.sql`.
- Faça backup do PostgreSQL e um commit de segurança.
- Confira que você está na raiz do projeto `loja_roupas` (onde ficam `backend/`, `lib/` e `test/`).
- Extraia o conteúdo do ZIP preservando os caminhos. Substitua **somente** os arquivos com o mesmo nome presentes no ZIP.
- Não sobrescreva nem apague o `.env` do backend, os tokens dos conectores ou os arquivos privados de estado.

### Arquivos alterados/adicionados
Consulte o manifesto `MANIFESTO_FASE_5_PARTE_12.json` incluído no pacote. Esta fase **não** possui migration.

### Verificação no backend (PowerShell)
Na raiz `loja_roupas`:

```powershell
cd backend
npm ci
npm run build
npm test
```

Com o backend de homologação configurado, execute o teste de autorização do novo endpoint (somente a sessão proprietária da loja). **Não** faça testes de integração usando credenciais reais de clientes em logs/screenhots.

### Verificação Flutter (PowerShell)
```powershell
cd ..
flutter pub get
flutter analyze
flutter test test/phase512_go_live_preflight_screen_test.dart
flutter test
```

Se `flutter analyze` indicar avisos preexistentes, registre-os separadamente. Se qualquer teste falhar, **não** publique o novo build até corrigir ou identificar o problema.

### O que foi incluído
- `GET /v1/stores/:storeId/integrations/:integrationId/go-live-preflight`, restrito ao proprietário (OWNER).
- Resposta combinada com lista de verificações técnicas e verificações declaradas pelo operador.
- Bloqueio conservador quando falta perfil, há falhas na fila, não há worker recente, faltam permissões, faltam produtos vinculados ou existem pendências no checklist.
- Botão **Pré-homologação** na Central de Integrações do Flutter, mostrando resultado e pendências.

### Como interpretar
- `NEEDS_ACTION`: existem verificações pendentes; consulte `pendingCodes` e a lista `checks`.
- `READY_FOR_SUPERVISED_VALIDATION`: requisitos **internos e declaratórios** concluídos, podendo organizar os testes assistidos com um ERP real. **Não significa homologação ou liberação para produção**.
- `homologated`, `productionApproved` e `automationEnabledByThisCheck` são sempre `false` nesta fase.
- O perfil usado na pré-homologação deve estar com `environment=HOMOLOGATION`. O registro `PRODUCTION` não substitui teste no ambiente de homologação.

### Requisitos de segurança
- O endpoint só consulta as tabelas do Store App e filtra por `store_id` e `integration_id`.
- Não contém dados pessoais, senhas, tokens, payloads de pedidos nem detalhes fiscais.
- Requer `ENABLE_EXTERNAL_INTEGRATIONS=true` **somente no ambiente em que as APIs de integração já foram homologadas**. Não ligue esta variável em produção apenas para testar a nova tela.
- Não registra chaves ou dados do ERP. Nenhum worker é iniciado ou enviado.

### Railway
- **Nenhuma variável nova**.
- **Nenhuma migration nova**.
- **Deploy do backend** necessário para expor a nova rota; Flutter precisa de novo build para mostrar o botão.
- Mantenha `ENABLE_EXTERNAL_INTEGRATIONS=false` no ambiente de produção até terminar a homologação das integrações existentes. Teste as APIs primeiro em homologação.

### Limitações e checklist real antes de vender
Esta fase **não** realizou chamadas a Bling, Omie ou Olist/Tiny. As respostas das APIs desses fornecedores, a emissão fiscal, autorização do cliente, importação de estoque, criação de pedidos, tentativas incertas, duplicidade e reconciliação deverão ser validadas com uma conta de homologação e evidências controladas.

### Testes realizados nesta entrega
- Regras puras TypeScript compiladas em modo estrito.
- Cinco verificações isoladas da lógica executadas com sucesso no Node.js 22.
- Sintaxe dos arquivos TypeScript modificados verificada.
- A suíte completa do backend e os testes Flutter **não foram executados neste ambiente**: a instalação npm foi bloqueada pela ausência do pacote no cache e indisponibilidade da rede, e o SDK Flutter não está instalado.
- Os testes de rota (Fastify) e o teste de interface foram adicionados para execução no seu PC.
