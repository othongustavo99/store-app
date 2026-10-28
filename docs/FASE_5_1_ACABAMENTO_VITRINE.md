# Fase 5.1 — Acabamento visual e navegação responsiva

Base: `loja_roupas(6).zip` enviado em 28/10/2026, após a Fase 4.8.

## Escopo desta entrega

- Tema Material 3 mais consistente (tipografia, campos, botões, cartões, foco e navegação).
- Início: busca em destaque, banner da própria loja, categorias, seções de produtos, indicadores de carregamento/erro/vazio, atualizar puxando a tela.
- Produtos: cards acessíveis, estado de falta de estoque, desconto apenas quando válido, imagens com fallback e preços sem transbordamento.
- Pesquisa: ordenação local por relevância, preço e data; filtro de disponibilidade; contagem de resultados; grades adaptáveis.
- Categorias: grade adaptável para tablets e desktops.
- Windows/tablets largos: navegação lateral, preservando a barra inferior em celulares.
- Administração: informações e ações em cartões responsivos; mesmas rotas e serviços Railway.

Esta fase **não** altera pagamento, estoque, login, API, banco de dados, regras de publicação nem arquivos Firebase. O logotipo, banner e nome continuam provenientes do perfil público de cada loja da Fase 4.8. Busca e ordenação desta etapa operam sobre os produtos já carregados pelo provider, não representam ainda uma busca paginada de catálogo grande.

## Arquivos para substituir

- `lib/core/theme/app_theme.dart`
- `lib/features/client/home/home_screen.dart`
- `lib/features/client/search/search_screen.dart`
- `lib/features/client/categories/categories_tab_screen.dart`
- `lib/features/client/widgets/product_card.dart`
- `lib/features/admin/remote_admin_home.dart`
- `lib/router/app_router.dart`

## Arquivo para adicionar

- `test/phase5_product_card_test.dart`

**Remoções:** nenhuma.

## Aplicação

1. Faça uma cópia ou commit do estado anterior e extraia o ZIP da fase na pasta PAI do `loja_roupas`, substituindo os sete arquivos.
2. No PowerShell, dentro de `loja_roupas`:

   ```powershell
   flutter pub get
   dart format lib/core/theme/app_theme.dart lib/features/client/home/home_screen.dart lib/features/client/search/search_screen.dart lib/features/client/categories/categories_tab_screen.dart lib/features/client/widgets/product_card.dart lib/features/admin/remote_admin_home.dart lib/router/app_router.dart test/phase5_product_card_test.dart
   flutter analyze
   flutter test
   ```

3. Execute em Windows (troque SEU-SLUG):

   ```powershell
   flutter run -d windows `
     --dart-define=LOJA_BACKEND=railway `
     --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
     --dart-define=LOJA_STORE_SLUG=SEU-SLUG
   ```

4. Se estiver tudo correto, envie os arquivos ao GitHub:

   ```powershell
   git add lib/core/theme/app_theme.dart lib/features/client/home/home_screen.dart lib/features/client/search/search_screen.dart lib/features/client/categories/categories_tab_screen.dart lib/features/client/widgets/product_card.dart lib/features/admin/remote_admin_home.dart lib/router/app_router.dart test/phase5_product_card_test.dart docs/FASE_5_1_ACABAMENTO_VITRINE.md
   git commit -m "feat: fase 5.1 vitrine e navegacao responsiva"
   git push origin master
   ```

**Railway:** não é necessário novo deploy da API, criar migrations ou alterar variáveis. Se o GitHub disparar um novo deploy automático, não haverá modificação em `/backend` pelo pacote.

## Homologação visual e funcional

1. Celular em retrato (360–430 px): sem `RenderFlex overflowed`; duas colunas com preço e nome legíveis.
2. Windows em 900–1400 px: navegação lateral, múltiplas colunas e painel administrativo responsivo.
3. Redimensionar janela para menos de 850 px: barra inferior reaparece, com estado da aba preservado.
4. Testar navegação entre Início / Categorias / Carrinho / Pedidos, inclusive badge do carrinho.
5. Testar busca por nome; filtros de disponibilidade e ordenação por preço.
6. Testar produto com e sem foto; esgotado; preço anterior inferior ao atual; desconto real.
7. Testar loja vazia, servidor temporariamente indisponível e botão de nova tentativa.
8. Testar nome e banner personalizados do perfil da loja.
9. Testar área administrativa, todos os atalhos e atualização dos indicadores.
10. Confirmar que pedidos, estoque, autenticação e meios de pagamento continuam com o comportamento da Fase 4.8.

## Limitações e próximos passos

- Esta é a **primeira entrega visual da Fase 5 (5.1)**. Detalhes de produto, carrinho e checkout receberão acabamento específico na Fase 5.2.
- Não foi possível compilar nem executar Flutter no ambiente de preparação do ZIP; rode os comandos acima antes do uso em dispositivos.
- A versão Windows testada aqui é uma forma de validar o frontend; a ferramenta Dev dedicada, com permissões especiais, permanece planejada para a Fase 7.
- Políticas comerciais e publicação na App Store/Play Store permanecem requisitos da Fase 6.
