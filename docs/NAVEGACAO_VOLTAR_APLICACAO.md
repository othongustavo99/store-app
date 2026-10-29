# Hotfix de navegação — Loja de Roupas

Base: `loja_roupas(10).zip` de 29/10/2026. Inclui apenas arquivos **completos** novos ou modificados.

## Implementado

1. **Voltar visível** em telas administrativas, login, produtos, busca, categorias, checkout, pedidos, suporte, conta e abas secundárias. A Home não tem seta de voltar — nela, voltar é reservado ao encerramento com confirmação.
2. **Histórico real de rotas de detalhe e do painel:** os atalhos do administrador usam `push` em vez de `go` (exceto `Visualizar vitrine`, que muda explicitamente para a Home). O atalho para inventário, dentro do catálogo, também preserva a tela anterior.
3. **Rotas sem histórico:** ao abrir uma tela diretamente, `AppRouteBackGuard` conduz ao painel, perfil, carrinho ou Home, conforme a tela; não tenta executar um `pop` sem página anterior.
4. **Abas do cliente:** Início, Categorias, Favoritos, Carrinho, Perfil. A ordem das rotas foi alinhada com os botões da navegação inferior e lateral. As visitas às abas são guardadas na ordem de uso e podem ser percorridas de trás para frente. Tocar diretamente em Início limpa esse histórico.
5. **Android:** na Home, após esgotar o histórico de navegação, o primeiro toque em Voltar exibe a mensagem `Pressione voltar novamente para sair`. O segundo toque em até 2 segundos fecha a atividade via `SystemNavigator.pop()`. No iOS/desktop não se força o encerramento da aplicação.
6. **Testes de lógica:** `test/router/client_tab_history_test.dart` para histórico e dupla confirmação.

## Aplicação no computador

1. Faça uma cópia do projeto (ou crie um commit Git antes de substituir arquivos).
2. Extraia **o conteúdo** do ZIP na raiz do projeto (`loja_roupas`, pasta que contém `pubspec.yaml`). Autorize a substituição e preserve os diretórios `lib/...`, `test/...` e `docs/...`.
3. Na raiz, rode:

```powershell
flutter pub get
flutter analyze
flutter test
```

Para gerar o APK com Railway, use os mesmos `--dart-define` da sua loja que já funcionam. Não altere nem inclua credenciais no build.

## Roteiro de teste no Android

- Abra a vitrine e visite, nesta ordem: Categorias → Favoritos → Carrinho → Perfil. Voltar (botão físico ou gesto) deve seguir Perfil → Carrinho → Favoritos → Categorias → Início. Na Home, um toque mostra o aviso; dois em até 2 s fecham o app.
- Acesse uma aba e toque diretamente em **Início**: o próximo Voltar na Home deve mostrar o aviso de saída, sem recuperar abas antigas.
- Abra um produto pela Home, abra busca, detalhes e outras rotas; cada Voltar deve retirar uma tela da pilha até retornar à vitrine, preservando o fluxo onde os links utilizam `push`.
- Faça login como lojista; entre em **Painel → Produtos → Inventário**. Voltar deve retornar **Inventário → Produtos → Painel → Perfil/Home** conforme a origem do painel.
- Verifique também Pedidos, Frete, Cupons, Equipe, Identidade, Suporte, conta e checkout.
- Abra diretamente uma rota administrativa com sessão válida: Voltar deve retornar ao painel, e do painel à Home.
- Confira navegação por toque na seta superior e pelo gesto/botão do dispositivo.

## Fora do aplicativo

**Nenhuma migration ou configuração de Railway, PostgreSQL, Firebase ou Mercado Pago é necessária.** É uma atualização exclusivamente Flutter.

## Verificação e limites

Os arquivos foram revisados e empacotados, mas o ambiente que produziu o ZIP **não possui o SDK Flutter**, portanto `flutter analyze`, `flutter test` e testes de gesto no Android devem ser executados no seu computador. Em telas de conclusão de compra, a navegação intencional com `go('/orders')` continua substituindo o checkout para não voltar a uma compra já confirmada. Login/logout também continuam sendo transições intencionais de sessão.
