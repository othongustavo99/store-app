# Fase 4.8 — Perfis de lojas independentes e preparação comercial

## Escopo

Este pacote **não** modifica checkout, reembolsos, pagamento, cotação ou credenciais globais. Não habilita financeiro.

Implementa:
- tabela `store_profiles`, identificada por `store_id`, com marca e informações públicas;
- endpoint público `/v1/shops/:slug/profile` com os campos permitidos;
- endpoints autenticados por loja `/v1/stores/:storeId/profile` (GET/PUT), restritos por permissão;
- atualização concorrente com `expectedVersion`, rejeitando perda silenciosa de mudanças (HTTP 409);
- log de auditoria e notificação por loja para atualização da vitrine;
- checklist de preparação `/v1/stores/:storeId/readiness`, sem expor tokens ou segredos;
- tela Flutter `Administração → Identidade e preparação da loja`;
- nome público editável, logotipo e banner personalizados no login e na vitrine Railway (Firebase legado preservado).

## Aplicação

Extraia o ZIP e copie a árvore **loja_roupas/** sobre seu projeto. Todos os arquivos estão completos. Não remova outros arquivos.

```powershell
cd backend
npm ci
npm run build
npm test
cd ..
flutter pub get
flutter analyze
flutter test
```

Se passar, na raiz do projeto:

```powershell
git add backend/src/app.ts backend/src/routes/store_profiles.ts backend/src/services/store_profile.ts backend/src/tests/store_profile.test.ts backend/migrations/010_store_profiles.sql lib/data/repositories/railway_store_profile_repository.dart lib/features/admin/store_settings/railway_store_settings_screen.dart lib/features/admin/login/admin_login_screen.dart lib/features/admin/remote_admin_home.dart lib/features/client/widgets/railway_storefront_identity.dart lib/features/client/home/home_screen.dart lib/router/app_router.dart docs/FASE_4_8_PREPARACAO_MULTI_LOJA.md
git commit -m "feat: fase 4.8 identidade e preparacao multi-loja"
git push origin master
```

Confira no Railway: `store-app → Deployments → Deploy Logs`, `Aplicada: 010_store_profiles.sql`. Confira `.../health/ready`.

**Nenhuma variável nova é exigida.** Mantenha `ALLOW_STORE_SELF_SERVICE=false`, `ENABLE_REAL_PAYMENTS=false`, `ENABLE_REFUNDS=false`. A API continuará utilizando a conexão privada com PostgreSQL.

## Validação no Windows

```powershell
flutter run -d windows `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

1. Entre com o proprietário e abra `Administração → Identidade e preparação da loja`.
2. Preencha nome exibido, slogan, descrição, cor hexadecimal (#112233), email de contato, telefone (somente 10–15 dígitos), URLs HTTPS de logotipo e banner, políticas. Esses links precisam existir e pertencer à própria loja.
3. Salve e abra a vitrine em outro dispositivo com o mesmo slug: nome, logotipo e banner precisam refletir essa loja. Recarregue a tela se necessário.
4. Confira a consulta pública `GET /v1/shops/SEU-SLUG/profile`: deve retornar **somente** marca e contatos, sem email de login, tokens, segredos, membros ou UUIDs internos de clientes.
5. Em duas sessões administrativas, edite o perfil nos dois dispositivos. Ao salvar a versão antiga, o backend deve responder HTTP 409, sem sobrescrever a edição mais recente.
6. Entre com conta STAFF: a tela deve permitir ver os dados, mas não salvar.
7. Se houver segunda loja, tente acessar `/v1/stores/UUID-SEGUNDA-LOJA/profile` usando token sem permissão: acesso recusado. Verifique que o perfil público de A não alterou o de B.
8. Confira o checklist: pagamentos próprios por lojista **nunca** aparecem como prontos nesta etapa.

### Mídias

Nesta fase, logotipo e banner são campos de **URL HTTPS**, sem novo upload automatizado. Use arquivos hospedados na sua conta Cloudinary por processo confiável; se precisar, o próximo incremento pode fornecer um upload assinado específico para identidade visual. Não copie URL de outros comerciantes sem autorização.

## Segurança, integração e limites

- Dados públicos ficam em `store_profiles` por `store_id` e são autorizados no backend para edição. A atualização sempre exige token e papel OWNER/MANAGER.
- Cada API pública é resolvida por slug ativo, sem acesso a pedidos ou informações privadas.
- Eventos de perfil passam pelo canal existente de notificação por loja (Postgres NOTIFY). SSE pode perder eventos durante interrupções; a tela faz nova consulta quando reaberta.
- **A estrutura atual continua sendo um app Flutter direcionado a um slug por build**, definido por `LOJA_STORE_SLUG`. Esta fase não é um marketplace com alternância de múltiplas lojas dentro do mesmo aplicativo.
- Pagamentos e fretes ainda dependem de configurações globais de **uma loja-piloto**; não copie as credenciais da loja piloto para outros lojistas. Os recebimentos por loja, webhooks segregados, onboarding OAuth e compra/etiqueta automáticas exigem uma fase própria, testes de homologação e contrato com o lojista.
- Nenhum dado de pagamento é escrito em `store_profiles`; nenhum segredo entra no Flutter. O checklist informa estado e limitações, mas não certifica que a loja está pronta para publicar.
- A tela de login ainda requer conta para acessar a vitrine; permitir navegação pública e concluir a conformidade com as lojas de aplicativos faz parte das fases posteriores.
- Para produção real, testar migração, permissões, e isolamento cross-tenant com PostgreSQL real, backup e rollback. Não modificar migration já aplicada; preparar outra para qualquer alteração posterior.

## Como reverter

Para reverter a aplicação antes de publicação: `git revert <commit>` e novo deploy. A migration `010_store_profiles.sql` permanecerá aplicada no PostgreSQL. **Não execute DROP TABLE em produção**; a tabela não interfere nos pedidos existentes. Uma futura retirada de esquema exigirá backup e plano próprio.

## Resultado dos testes neste ambiente

Backend TypeScript compilado com as dependências fornecidas anteriormente. 35 testes unitários passaram usando credenciais de teste fictícias, sem acesso ao seu Railway. O compilador Flutter e PostgreSQL real não estavam disponíveis aqui. Portanto validações de UI, migration e fluxo entre lojas precisam ser feitas no seu ambiente.
