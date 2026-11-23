# Frequência40 Store App — Fase 5.22: Planejamento multi-loja de pagamentos, estornos e frete

**Base exata:** `loja_roupas(20261122-235502).zip` + Fase 5.21 aplicada.
**Natureza:** patch incremental, não projeto completo. Todos os arquivos de código são completos.

## Objetivo e limites

Nesta fase, implementamos o **cadastro declaratório, individual por loja** do provedor de pagamentos e transportadora, estágio de preparação, ambiente pretendido e planejamento de estornos. A nova API exige autorização por loja, restringe gravação ao proprietário, impede perda de atualização por revisão e audita alterações. A interface Flutter acessa a configuração no painel administrativo.

**Não foi implementado nesta fase:** armazenamento de credenciais do Mercado Pago/Melhor Envio por estabelecimento, seleção dinâmica de tokens no checkout, validação de webhooks para múltiplas lojas, execução de estorno multiempresa, ativação comercial, homologação com provedores. A lógica de pagamentos e frete em produção permanece LIMITADA a `PAYMENT_PILOT_STORE_ID` e `SHIPPING_PILOT_STORE_ID`. Este patch **não remove** esses bloqueios. Os dados gravados no novo cadastro **NÃO ativam** pagamentos, estornos ou cotações de transportadora.

## Como aplicar

1. Faça **backup da base PostgreSQL** e commit do projeto na Fase 5.21.
2. Descompacte este ZIP **na raiz de `loja_roupas`** (não dentro de `backend`). Mantenha as pastas.
3. Substitua apenas os arquivos descritos em `MANIFESTO_FASE_5_PARTE_22.json`, e adicione os novos.
4. Antes de subir o backend para Railway, valide localmente:

```powershell
cd backend
npm ci
npm run build
$env:DATABASE_URL = 'postgresql://fake:fake@localhost:5432/test'
$env:JWT_SECRET = 'test_secret_secure_long_0123456789_0123456789'
npm test
Remove-Item Env:DATABASE_URL, Env:JWT_SECRET -ErrorAction SilentlyContinue
cd ..
flutter pub get
flutter analyze
flutter test test/phase522_commercial_rollout_screen_test.dart
flutter test --concurrency=1 --dart-define=LOJA_BACKEND=railway
```

5. Execute o fluxo normal de deploy do backend na Railway, somente depois de verificar a migration nova **`025_store_commercial_rollout.sql`**. O projeto aplica migrations na inicialização do backend. O deploy no banco de produção não foi executado nesta fase; confirme nos logs `Aplicada: 025_store_commercial_rollout.sql` e `Migrations concluídas.`
6. Abra o aplicativo (backend `railway`) com usuário OWNER e acesse **Administração > Preparação de pagamentos e frete**. Teste a leitura e o salvamento de um plano para uma loja fictícia. Revise permissões (MANAGER pode ler; STAFF não pode ler; só OWNER pode alterar).
7. Faça commit após testes e verificação do deploy.

## Railway e credenciais

- **Variáveis de ambiente novas:** nenhuma.
- **Migration nova:** 025, somente aditiva, com chave por loja.
- **Nenhum token de loja é cadastrado** na tabela ou trafegado pela nova UI. Não use este formulário para senhas/CPF/credenciais.
- Mantenha **`ENABLE_REAL_PAYMENTS=false` e `ENABLE_REFUNDS=false`** enquanto não houver homologação.
- Se ainda não precisa de transportadoras reais, mantenha o frete por provedor no modo legado, sem configurá-lo para lojas adicionais.
- Variáveis globais de pagamento/frete ainda são destinadas a **uma loja piloto**, nunca devem ser compartilhadas entre lojas.
- Não reutilize o `JWT_SECRET` de teste acima em nenhum serviço real.

## Arquivos, endpoints e segurança

- `GET /v1/stores/:storeId/commercial/rollout`: OWNER e MANAGER da loja ativa, devolve apenas enums e diagnóstico de piloto legado.
- `PUT /v1/stores/:storeId/commercial/rollout`: somente OWNER da loja ativa. Corpo estrito com `expectedRevision` e campos enum. Tokens, e-mails e texto livre são rejeitados, como qualquer campo extra.
- `store_commercial_rollouts`: uma linha por estabelecimento; constraints SQL para impedir estágios incoerentes; `revision` e auditoria.
- O backend valida que o cliente pertence à loja solicitada. A atualização faz lock da loja e checa revisão na mesma transação.
- O diagnóstico informa `activation.*EnabledByPlan = false`, `certified = false`, `automaticGoLive = false` mesmo que o plano esteja completo.
- Nenhuma alteração foi feita nas rotas de checkout, webhooks, frete, estorno ou nos conectores ERP/PDV.

## Validação realizada aqui

- Backend compilado com TypeScript.
- **235/235 testes do backend aprovados** (inclui 18 testes desta fase).
- **396/396 testes Node.js dos conectores aprovados**.
- Testes de widgets Flutter escritos, mas **não executados** neste ambiente por ausência de Flutter/Dart.
- Migration SQL inspecionada, mas **não executada em PostgreSQL real** neste ambiente.

## Próxima fase recomendada

**5.23 — Cofre de credenciais por loja e roteamento seguro** (ainda sem cliente real): implementar criptografia em repouso, rotação, vinculação segura de token à loja, seleção do token no checkout/frete/estorno e verificação de webhook por loja. Exigir testes de isolamento entre tenants e manter a ativação desabilitada por padrão. Esse é o passo necessário antes de retirar os `*_PILOT_STORE_ID` da operação real.

O ERP/PDV próprio da Frequência40 permanece **fora do escopo** desta sequência.
