# Loja de Roupas — P2, pacote 1 (catálogo, busca, avaliações e medidas)

> Base: `loja_roupas(8).zip` + **P0 e P1 já aplicados**. Este ZIP é **incremental** e contém arquivos completos na mesma árvore da aplicação. Não é um projeto independente. Mantenha `ENABLE_REAL_PAYMENTS=false` e `ENABLE_REFUNDS=false` nesta fase.

## Conteúdo deste pacote

- Cadastro de produto em tela cheia, com geração de SKUs por matriz de cores/tamanhos, até 120 combinações; estoque inicial por combinação. Edição posterior de quantidades continua obrigatoriamente pelo Inventário.
- Botões **Duplicar** (rascunho, estoque zero, SKUs novos) e **Publicar/Ocultar** na lista administrativa.
- Campo **Guia de medidas da peça** cadastrado pelo lojista e mostrado no detalhe; quando vazio, recomenda consultar a loja (não inventa medidas).
- Busca Railway com paginação por cursor (20 por página), filtros de categoria, cor, tamanho, faixa de preços e disponibilidade. O filtro é validado e aplicado **na API**. Detalhe individual carregado pelo ID para também abrir produtos além da página 500.
- Avaliações Railway: leitura pública; escrita autenticada, rate-limited, com uma avaliação editável por comprador/produto, exigindo pedido real em etapa confirmada (ou pedido fictício confirmado na loja de demonstração). O nome é derivado do usuário no servidor; textos são limitados, sem upload de mídia na implementação Railway.
- Galeria em tela cheia com pinça/zoom. Firebase legado permanece com sua implementação anterior.

## 1 — Antes de atualizar

1. Certifique-se de que seu projeto local **já contém P0 e P1**. Não aplique este ZIP diretamente sobre a base original.
2. Faça commit do código: `git add .; git commit -m "backup antes do P2"`.
3. Faça backup do banco PostgreSQL no Railway (backup/volume/snapshot conforme seu plano) antes da migration.
4. **Não extraia** `backend/node_modules`, `.env`, `build`, `.dart_tool` ou arquivos de segredo; este ZIP não contém nenhum desses itens.
5. Mantenha o Railway e o app configurados para a **mesma** loja/slug.

## 2 — Aplicar os arquivos

Extraia o ZIP **na raiz do projeto** que contém `pubspec.yaml` e a pasta `backend/`. Aceite substituir os arquivos; mantenha todos os demais arquivos da base. O ZIP contém todos os arquivos modificados por inteiro, nos caminhos corretos.

**Nenhum arquivo existente deve ser removido.**

## 3 — Backend / Railway

Execute localmente no PowerShell (na raiz do projeto):

```powershell
cd backend
npm ci
npm run build
```

Publique os arquivos do backend no mesmo serviço Railway usado no P1. Antes de iniciar a nova API, aplique a migration **015_p2_reviews.sql** no banco daquele serviço com o mecanismo de migrações que você já utiliza:

```powershell
# Dentro do container/ambiente Railway, com DATABASE_URL configurada:
npm run db:migrate:prod
```

A migration cria `product_reviews`, adiciona `products.size_guide` e índice para a busca. **Não altere migrations anteriores (001–014)**. Se seu serviço já executa `db:migrate:prod` no comando de inicialização, confirme isso na configuração do Railway e não execute manualmente em ambiente diferente. O migrador registra checksum e aplica apenas migrations novas.

O `DATABASE_URL` deve ser o PostgreSQL real da loja (não o banco de testes). O aplicativo deve ser publicado **somente após** a migration, porque agora faz consultas a `size_guide` e `product_reviews`.

As variáveis já usadas nos passos anteriores devem continuar, sem mudança obrigatória:

```env
ENABLE_REAL_PAYMENTS=false
ENABLE_REFUNDS=false
# ENABLE_PUBLIC_DEMO_LOGIN=true apenas na sua loja demo e em ambiente isolado
```

Para fotos, o fluxo atual exige Cloudinary configurado no Railway se o lojista quiser realizar upload. Alternativamente, o editor aceita uma URL HTTPS de foto já hospedada. Não é necessário Mercado Pago para os novos recursos.

## 4 — Flutter / Android

Na raiz do projeto:

```powershell
flutter pub get
flutter analyze
flutter test
```

Corrija qualquer erro do analisador antes de gerar release; o Flutter SDK não estava disponível no ambiente onde este pacote foi produzido, então **não há garantia de compilação Android** até essas verificações locais.

Para criar a versão de demonstração (substitua a URL):

```powershell
flutter build apk --release `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://SUA-API.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=vitrine-demo-f40
```

O APK final costuma ficar em `build/app/outputs/flutter-apk/app-release.apk`.

## 5 — Testar dentro do app

1. Entre como lojista; em **Produtos e categorias**, crie um produto com título, fotos, preço e guia de medidas.
2. Informe `CAMISA01` como prefixo SKU, cores `Preto, Branco`, tamanhos `P, M, G, GG`; clique em **Gerar grade**; defina estoques individuais e salve. Devem surgir 8 SKUs únicos.
3. **Não** altere estoques no editor após a criação: vá ao Inventário. Duplique o produto: a cópia deve ser rascunho, com estoque zero e SKUs novos.
4. Publique/oculte e confira a vitrine. Abra a busca e filtre por categoria, cor, tamanho, valores e disponibilidade; role para carregar páginas seguintes.
5. Abra o detalhe do produto, toque na foto para ampliar e veja o guia de medidas cadastrado.
6. Como cliente com pedido *confirmado* contendo o produto, escreva uma avaliação com 5 a 1 estrelas e no mínimo 5 caracteres; a lista deve atualizar. Sem compra confirmada, a API deve recusar a avaliação; visitante pode apenas ler.
7. Teste um checkout **fictício** com Pix/cartão simulado (P0) e confira que não ocorre cobrança real.
8. Valide dados sempre isolados por loja: produtos e avaliações de A não aparecem em B.

## 6 — Limites conhecidos / continuação do P2

**Ainda não incluídos neste primeiro pacote:** cupons que abatam valores efetivamente no checkout e no futuro gateway, push FCM, filtros avançados na *home* e paginação de todas as seções de vitrine/admin. A API nova pagina a **busca**; a rota antiga `/catalog/products` mantém limite de 500. Esses pontos exigem alterações adicionais e testes de integração para não criar discrepâncias nos valores cobrados ou no gerenciamento de notificações.

A avaliação Railway aqui aceita **texto**, não upload de foto/vídeo. O Firebase legado mantém seu funcionamento anterior, mas a versão comercial deve usar Railway.

## 7 — Reversão segura

- **Código:** volte ao commit anterior (P1) e redeploy; restaure arquivos Flutter do commit.
- **Banco:** a migration 015 é aditiva. Não reverta manualmente tabelas/colunas usadas por dados reais; é mais seguro manter a estrutura ou restaurar um backup consistente se for absolutamente necessário.
- **Não** remova registros de `schema_migrations` nem edite um SQL já aplicado.
- Se tiver aplicado a migration mas ainda não publicado o backend novo, o backend P1 continua funcionando com a coluna/tabela adicional.

## Validação deste pacote

- `npm run build`: sucesso (TypeScript).
- `npm test`: **46/46 testes** passaram com variáveis **de teste**, incluindo 3 novos testes para grade e tamanho do guia.
- Testes de migrations e integração PostgreSQL **não executados** neste ambiente.
- `flutter analyze`, `flutter test` e `flutter build apk` **não executados**, por ausência do SDK Flutter neste ambiente.
