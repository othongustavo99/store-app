# Fase 5.2 — Detalhes do produto, carrinho e checkout

Base: `loja_roupas(6).zip` + arquivos completos da Fase 5.1 já aplicados.

## Objetivo

Melhorar a experiência de compra no Android, iOS e Windows mantendo todas as rotas, API Railway, estoque, frete e política de pagamento existentes.

**Não altera banco de dados, servidor, migrações nem variáveis do Railway.**
**Não ativa cobranças reais.** A API permanece a autoridade para confirmar estoque, preços, frete e cobrança.

## Arquivos completos a substituir

- `lib/features/client/product_detail/product_detail_screen.dart`
- `lib/features/client/cart/cart_screen.dart`
- `lib/features/client/checkout/railway_checkout_screen.dart`
- `lib/data/repositories/cart_repository.dart`

## Arquivos a adicionar

- `test/cart_stock_limits_test.dart`
- `docs/FASE_5_2_EXPERIENCIA_DE_COMPRA.md` (este documento)

## Remoções

Nenhuma. O checkout Firebase legado não foi substituído. As telas e rotas da Fase 5.1 continuam no projeto.

## Alterações principais

- **Produto:** galeria com imagem inteira, conteúdo centralizado no desktop, combinação cor/tamanho disponível selecionada inicialmente, quantidade reiniciada ao trocar variante, preço subtotal visível. Parcelamento fictício foi removido. No modo Railway, a tabela de frete local foi substituída por uma indicação de cotação real no checkout.
- **Carrinho:** layout adaptado a janelas estreitas ou amplas, resumo visível, confirmação para limpar itens, limite de estoque mostrado, desabilita avanço se houver itens já conhecidos como indisponíveis. A API ainda confirma disponibilidade antes de cobrar.
- **Checkout Railway:** três etapas claras (recebimento, dados e frete), resumo responsivo, validação básica de telefone/CEP/UF, cotação com validade de 15 minutos e mensagens distintas para ambiente de testes e pagamentos desativados. Nunca informa um valor de frete não cotado como total final.
- **Repositório local:** impede adicionar variantes inexistentes/esgotadas e limita a quantidade ao estoque do catálogo, inclusive quando se toca repetidamente.

## Aplicação no Windows

1. Faça commit ou cópia da versão que está funcionando.
2. Extraia o ZIP **na pasta acima de `loja_roupas/`**. Substitua apenas os arquivos correspondentes.
3. No PowerShell, na pasta principal do projeto:

```powershell
flutter pub get
dart format lib/data/repositories/cart_repository.dart lib/features/client/cart/cart_screen.dart lib/features/client/checkout/railway_checkout_screen.dart lib/features/client/product_detail/product_detail_screen.dart test/cart_stock_limits_test.dart
flutter analyze
flutter test test/cart_stock_limits_test.dart
flutter test
```

4. Se compilar e os testes passarem, teste no Windows substituindo o slug:

```powershell
flutter run -d windows `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

5. Opcionalmente teste em Android com `flutter devices` e o identificador do dispositivo; mantenha os mesmos `--dart-define`.

## Testes manuais obrigatórios

1. Abrir um produto com várias fotos, cores e tamanhos; selecionar uma variante em estoque.
2. Trocar de variante depois de aumentar a quantidade: a quantidade deve voltar para 1.
3. Tentar adicionar mais unidades do que disponíveis; o carrinho não deve crescer acima do limite informado.
4. Alterar quantidades, remover um item, cancelar e confirmar a ação de limpar o carrinho.
5. Ajustar o tamanho da janela Windows e conferir a disposição lado a lado do resumo no desktop.
6. Com `ENABLE_REAL_PAYMENTS=false`, abrir o checkout: a cobrança deve permanecer indisponível.
7. Escolher retirada e verificar que não é exibida cobrança de frete.
8. Se existir o frete sandbox configurado, cotar CEP, escolher transportadora e conferir o bloqueio da cobrança de testes.
9. Conferir histórico de pedidos, suporte e administração: essas áreas não foram modificadas.

## Limites e ressalvas

- O carrinho ainda é **local/em memória**. Nesta fase não se implementou persistência entre dispositivos nem reserva antecipada de estoque.
- Estoque e preços mostrados no carrinho são instantâneos do catálogo carregado; **o backend deve continuar revalidando** antes de criar pedido e cobrança.
- Não é possível concluir pedidos no modo Railway com pagamentos desativados, por decisão de segurança das fases anteriores.
- O código Firebase legado permanece disponível; o parcelamento fictício foi removido da tela comum de produto, mas este pacote não altera o checkout Firebase antigo.
- Não foi possível compilar o Flutter neste ambiente. Execute as verificações locais antes de publicar.

## Git e Railway

```powershell
git add lib/data/repositories/cart_repository.dart lib/features/client/cart/cart_screen.dart lib/features/client/checkout/railway_checkout_screen.dart lib/features/client/product_detail/product_detail_screen.dart test/cart_stock_limits_test.dart docs/FASE_5_2_EXPERIENCIA_DE_COMPRA.md
git commit -m "feat: fase 5.2 experiencia de compra"
git push origin master
```

O commit pode acionar o pipeline Railway se seu monorepositório estiver em auto deploy, mas **nenhum componente do backend precisa mudar**, nenhuma migration deve ser aplicada e nenhuma variável nova deve ser criada.

## Se algo falhar

Restaure os quatro arquivos originais da Fase 5.1/base `loja_roupas(6).zip`, remova o novo teste e execute `flutter pub get`. Não altere os dados do PostgreSQL por causa de um erro visual.
