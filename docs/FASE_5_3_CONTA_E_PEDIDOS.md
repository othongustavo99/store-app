# Fase 5.3 — Conta do cliente, endereços e experiência de pedidos

**Base:** `loja_roupas(6).zip` + Fases 5.1 e 5.2 aplicadas. O patch mantém os modos Firebase (legado) e Railway, sem ativar cobranças.

## Mudanças

- **Minha conta** (`/account`, modo Railway): nome exibido, endereço primário, inclusão, edição e exclusão de endereços e mudança de senha com confirmação da senha atual.
- **Endereços privados PostgreSQL:** todos os endpoints exigem token, usam exclusivamente `userId` autenticado, 20 endereços por usuário e proteção transacional da preferência de endereço principal.
- **Logout / troca de conta:** o provider de endereços é recriado ao mudar a identidade. No Railway não utiliza os endereços armazenados anteriormente em SharedPreferences.
- **Checkout Railway:** preenche o endereço principal salvo se o formulário ainda estiver vazio. A API continua recalculando preço, frete e estoque.
- **Login:** regra de 12 caracteres na criação de conta Railway e informação explícita de que login Google / recuperação de senha por e-mail ainda precisam ser integrados; no modo Firebase a regra anterior foi mantida.
- **Pedidos:** tratamento de carregamento, erro com botão para repetir, tela vazia e estados mais legíveis. Histórico, pós-venda e link de pagamento existentes permanecem.
- **Roteamento:** mudanças de nome no perfil deixam de recriar o `GoRouter` e fazer a navegação voltar para o início.

## Arquivos adicionados (completos)

- `backend/migrations/011_customer_addresses.sql`
- `backend/src/routes/customer_account.ts`
- `backend/src/services/account_validation.ts`
- `backend/src/tests/account_validation.test.ts`
- `lib/features/client/account/railway_account_screen.dart`
- `test/phase5_account_address_test.dart`
- `docs/FASE_5_3_CONTA_E_PEDIDOS.md`

## Arquivos substituídos (completos)

- `backend/src/app.ts`
- `lib/providers/auth_providers.dart`
- `lib/providers/address_providers.dart`
- `lib/data/repositories/address_repository.dart`
- `lib/router/app_router.dart`
- `lib/features/client/home/home_screen.dart`
- `lib/features/admin/login/admin_login_screen.dart`
- `lib/features/client/checkout/railway_checkout_screen.dart`
- `lib/features/client/orders/railway_orders_screen.dart`

**Remoções:** nenhuma. Não remova os módulos Firebase ainda.

## Instalação

1. Faça backup/commit e confirme que você possui cópia restaurável do PostgreSQL.
2. Extraia o ZIP **na pasta que contém `loja_roupas/`**, preservando os caminhos e substituindo os 9 arquivos existentes.
3. Em `loja_roupas/backend`, execute:

```powershell
npm ci
npm run build
npm test
```

4. Na raiz Flutter:

```powershell
flutter pub get
dart format lib/features/client/account/railway_account_screen.dart lib/features/client/orders/railway_orders_screen.dart lib/features/client/checkout/railway_checkout_screen.dart lib/features/admin/login/admin_login_screen.dart lib/features/client/home/home_screen.dart lib/data/repositories/address_repository.dart lib/providers/address_providers.dart lib/providers/auth_providers.dart lib/router/app_router.dart test/phase5_account_address_test.dart
flutter analyze
flutter test
```

5. Publique **apenas os arquivos previstos**, sem adicionar `.env`, segredos, `node_modules` ou pastas de build:

```powershell
git add backend/migrations/011_customer_addresses.sql backend/src/app.ts backend/src/routes/customer_account.ts backend/src/services/account_validation.ts backend/src/tests/account_validation.test.ts
git add lib/providers/auth_providers.dart lib/providers/address_providers.dart lib/data/repositories/address_repository.dart lib/router/app_router.dart
git add lib/features/client/home/home_screen.dart lib/features/admin/login/admin_login_screen.dart lib/features/client/checkout/railway_checkout_screen.dart lib/features/client/orders/railway_orders_screen.dart
git add lib/features/client/account/railway_account_screen.dart test/phase5_account_address_test.dart docs/FASE_5_3_CONTA_E_PEDIDOS.md
git commit -m "feat: fase 5.3 conta e pedidos"
git push origin master
```

6. Verifique no Railway `store-app → Deploy Logs` a aplicação de `011_customer_addresses.sql` e depois consulte `/health/ready`. Seu deploy Docker executa as migrações antes de iniciar a API. **Nenhuma nova variável é necessária.**

## Rodar no Windows

```powershell
flutter run -d windows `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

## Roteiro de homologação

1. Entrar com uma conta cliente e abrir **Minha conta** pelo ícone do perfil na vitrine.
2. Editar o nome; fechar e reabrir o app, verificando persistência.
3. Salvar um endereço, outro com o sinalizador principal e conferir qual é o principal após reiniciar.
4. Abrir o mesmo usuário em outro dispositivo e verificar endereços após carregar a tela.
5. Iniciar o checkout Railway com entrega; conferir o preenchimento do endereço principal, sem gerar pagamento real.
6. Excluir o principal; quando houver outro endereço, ele deve se tornar principal.
7. Entrar com outro usuário e confirmar que não é possível consultar/editar endereços da conta anterior.
8. Alterar a senha informando a atual; verificar que a senha antiga é recusada no próximo login e que outras sessões são encerradas.
9. Abrir Pedidos sem registros, com conexão e depois sem rede; verificar opção de recarregar.
10. Regressão: catálogo, inventário e atendimentos continuam funcionando; `ENABLE_REAL_PAYMENTS` e `ENABLE_REFUNDS` permanecem nas configurações escolhidas anteriormente, sem alteração pelo pacote.

## Segurança e limitações

- **Não há redefinição de senha por e-mail** neste pacote; não exibir uma opção falsa de recuperação de conta. Essa função e a exclusão de conta completa ainda serão necessárias antes de publicar comercialmente.
- **Login Google no modo Railway permanece indisponível.** O botão é mostrado apenas no modo Firebase.
- **Endereços antigos do SharedPreferences não são copiados automaticamente** para o Railway, pois não conseguimos atribuí-los com segurança a um usuário específico. Cadastre-os novamente em Minha conta.
- Os endereços são armazenados no banco sob o usuário autenticado; o dispositivo não deve registrar esses dados em logs.
- O usuário pode fazer login com uma conta de gerente ou proprietário, mas as operações de perfil são **sempre da própria conta**, nunca de outra pessoa.
- O backend usa *limites e validação* de campos, controle transacional, tokens e hash de senha. Não foram realizados pentest, testes com banco remoto, nem testes Flutter neste ambiente.
- A interface `Minha conta` ainda não inclui um fluxo de exclusão de conta, privacidade/LGPD ou verificação de e-mail; esses itens permanecem bloqueadores para a publicação comercial.
- Não há migração de dados da tabela nova para apagar no rollback. Se precisar reverter a interface, restaure os arquivos Flutter anteriores; **não exclua a tabela `customer_addresses`**, pois pode conter dados do usuário.

## Resultado da verificação local

- Backend: `npm run build` passou.
- Backend: `npm test` passou com 37 testes e variáveis fictícias, sem consultar PostgreSQL real.
- Integridade do ZIP e sintaxe/balanceamento de delimitadores Dart conferidos estaticamente; compilação e teste Flutter serão feitos no Windows.
