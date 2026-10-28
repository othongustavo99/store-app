# Correção Fase 3 — Windows usando Railway sem Firebase

## Motivo

A API Railway estava sendo utilizada, mas `authProvider` criava `AuthService` durante sua própria construção. `AuthService` acessa `FirebaseAuth.instance`, que exige `Firebase.initializeApp()`. Em Windows, o Firebase não foi configurado corretamente; por isso o erro `[core/no-app]` ainda ocorria.

O projeto tinha também instâncias do Firestore criadas de imediato nos repositórios de produtos, categorias e avaliações. A correção torna os acessos ao Firebase tardios e exclusivamente usados no modo Firebase. Avaliações continuam não migradas: no Railway aparece um aviso em vez de um formulário que falharia.

## Aplicação

1. Salve uma cópia do projeto.
2. Extraia este ZIP para a pasta **acima** de `loja_roupas`, substituindo os arquivos de mesmo caminho. Não apague outros arquivos.
3. Encerre a execução anterior do Flutter no terminal (`q`).
4. No terminal PowerShell, a partir da pasta `loja_roupas`, execute:

```powershell
flutter pub get
flutter analyze
flutter run -d windows `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

**Substitua `SEU-SLUG` pelo slug cadastrado no PostgreSQL.** Sem `LOJA_BACKEND=railway`, o aplicativo ainda entra no modo legado Firebase por padrão. Executar somente `flutter run -d windows` ou iniciar pelo F5 sem os defines pode reproduzir o erro se o Firebase Windows não estiver configurado.

O backend Railway e o banco **não precisam de novo deploy** para esta correção Flutter. Se quiser salvar o ajuste no Git:

```powershell
git add lib/main.dart lib/providers/auth_providers.dart lib/data/repositories/product_repository.dart lib/data/repositories/category_repository.dart lib/data/repositories/review_repository.dart lib/features/client/product_detail/product_detail_screen.dart docs/CORRECAO_FASE_3_WINDOWS_SEM_FIREBASE.md
git commit -m "fix: inicializacao Railway sem Firebase no Windows"
git push origin master
```

## O que foi alterado

- `lib/main.dart`: inicializa Firebase somente em modo Firebase; não roda seeds nessa configuração Railway.
- `lib/providers/auth_providers.dart`: não resolve `AuthService`/FirebaseAuth ao montar autenticação Railway; preserva login legado.
- `lib/data/repositories/product_repository.dart`: Firestore lazy, apenas em chamadas do modo antigo.
- `lib/data/repositories/category_repository.dart`: idem.
- `lib/data/repositories/review_repository.dart`: não acessa Firestore em modo Railway e impede gravação não migrada.
- `lib/features/client/product_detail/product_detail_screen.dart`: oculta o formulário de avaliação em modo Railway e informa indisponibilidade.

**Arquivos a remover:** nenhum.

## Validação

- Verifique que a janela inicia sem tela vermelha `[core/no-app]`.
- Faça login com a conta cadastrada na **API Railway**, não com a conta do painel Railway nem exclusivamente Firebase.
- Abra catálogo e categorias no Windows; eles devem carregar da API.
- Ao abrir detalhes de produto, não deve haver acesso ao Firestore para as avaliações.
- Teste também no Android quando possível.

**Limitação:** os arquivos foram inspecionados e as substituições verificadas, mas a compilação Flutter não pôde ser executada neste ambiente; se `flutter analyze` trouxer erros, envie o log.
