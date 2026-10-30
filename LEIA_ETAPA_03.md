# Etapa 03 — vitrine, busca e produto

Base: https://github.com/othongustavo99/store-app, commit 4fa14a4d2a0c876530d9136f5a0d3232b788e2d7.
Pré-requisito: Etapas 01 e 02 aplicadas. Os arquivos da etapa anterior foram conferidos contra esta base.
As melhorias de catálogo e produto desta etapa atendem ao backend Railway.

## 1. O que muda para o cliente

- Home com marca, slogan, descrição, banner e acesso destacado à coleção. O perfil da loja é compartilhado entre as telas, evitando consultas/assinaturas duplicadas do cabeçalho.
- Categorias com imagem cadastrada, foto de uma peça ou ícone como alternativa. Destaques, ofertas, novidades e demais peças sem repetir o mesmo produto nas seções da Home.
- Busca com filtros de categoria, cor, tamanho, preço, disponibilidade, ofertas, novidades e destaques. Cores e tamanhos vêm das variantes publicadas da própria loja.
- Ordenação por mais recentes, menor ou maior preço feita no servidor e mantida durante a paginação. Ao abrir uma categoria ou ofertas, o filtro correspondente já está aplicado e pode ser removido.
- Alterações no painel de filtros só consultam produtos ao tocar em “Ver produtos”. Faixas de preço inválidas mostram orientação. Respostas atrasadas não substituem pesquisas mais recentes.
- Detalhe do produto carregado pelo próprio ID, independentemente do carregamento da Home. Em falhas, o cliente pode tentar novamente.
- Galeria com contador, ampliação e foto correspondente à cor/tamanho selecionados, quando cadastrada. A foto específica aparece antes das imagens gerais da peça.
- Cores e tamanhos mais legíveis, combinações esgotadas desabilitadas e indicação de estoque baixo somente quando há até três unidades disponíveis.
- Barra inferior com seleção, total da quantidade escolhida, “Adicionar” e “Comprar agora”. O aviso de adição aparece acima dos botões. “Comprar agora” adiciona a seleção ao carrinho existente e segue ao checkout.
- Quantidade limitada ao estoque e a 20 unidades por combinação, alinhada ao limite já aceito pela API. O aviso informa a quantidade realmente adicionada.
- Compartilhamento com o nome real da loja, preço, cor e tamanho. Link público é opcional, explicado abaixo.
- Ajustes de contraste e adaptação a telas estreitas, desktop e texto ampliado.

Não foram alteradas as regras de pagamento, cupom, frete ou confirmação do pedido nesta etapa.

## 2. Aplicar os arquivos

1. Faça uma cópia do projeto atual ou registre suas alterações no Git.
2. Extraia o ZIP em uma pasta temporária.
3. Copie seu CONTEÚDO para `C:\Users\othon\Documents\store\loja_roupas`, onde está `pubspec.yaml`.
4. Mescle `backend`, `lib`, `test` e `docs`, substituindo os arquivos dos mesmos caminhos.
5. Confira `MANIFESTO_ETAPA_03.json`: ele relaciona as operações ADICIONAR/SUBSTITUIR e o SHA-256 de cada arquivo.
6. Nenhum arquivo precisa ser removido. Preserve os demais arquivos do seu projeto.

O ZIP é incremental: não substitua a pasta inteira do projeto pelo conteúdo reduzido do pacote.
Não inclui `.env`, credenciais, dependências instaladas, builds, arquivos SQL ou imagens para trocar o catálogo da sua loja. Não há dependência nem migration nova.

**Publique o backend antes de distribuir o aplicativo atualizado.** A busca passa a enviar a ordenação e a consultar uma nova rota de filtros.

## 3. Backend — validação e publicação

Na sua pasta local:

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas\backend'
npm ci
npm run build
npm test
npm run db:check
~~~

Esperado: compilação concluída, 78 testes aprovados e diagnóstico do banco sem pendências inesperadas. Os testes usam banco/gateway simulados. `db:check` é somente leitura e depende da conexão que você já configurou.

Preserve `DATABASE_URL`, segredos e flags existentes. Esta etapa não requer `db:migrate:prod`, novos tokens ou mudanças nos pagamentos.

Envie os arquivos ao repositório/ramo que alimenta seu serviço Railway e faça o deploy pelo fluxo habitual. Confira os logs e `/health/ready` antes de atualizar o APK. Aplicar o ZIP localmente não publica o servidor.

Com a URL e o slug reais, confira as novas respostas:

~~~powershell
$apiDaLoja = 'https://SUA-API.up.railway.app'
$slugDaLoja = 'SEU-SLUG'
Invoke-RestMethod -Uri "$apiDaLoja/health/ready"
Invoke-RestMethod -Uri "$apiDaLoja/v1/shops/$slugDaLoja/catalog/filters"
Invoke-RestMethod -Uri "$apiDaLoja/v1/shops/$slugDaLoja/catalog/search?sort=price_asc&limit=20"
~~~

Preencha os exemplos antes de executar. `/filters` retorna `colors` e `sizes`. Listas vazias são válidas se a loja não tem variantes publicadas. A busca retorna `products` e `nextCursor` quando há outra página. Empates de preço têm desempate estável por data e ID. Cursores antigos da ordenação padrão continuam aceitos.

As opções de cor/tamanho são gerais da loja; não representam uma promessa de estoque. Use “Somente disponíveis” para combinar cor, tamanho e estoque na mesma variante. A ordenação usa o preço exibido no cartão do produto, definido pela primeira variante ativa, como no contrato atual da API.

Se a busca responder 400 ao parâmetro `sort` ou `/filters` não existir, confira se o backend desta etapa foi realmente publicado. Confira também o slug em caso de 404.

## 4. Flutter — validar e gerar APK

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas'
flutter pub get
flutter analyze
flutter test --dart-define=LOJA_BACKEND=railway
~~~

Esperado: analyze sem apontamentos e 59 testes aprovados. O parâmetro Railway ativa também a verificação do detalhe remoto quando a Home falha. Sem esse parâmetro, esse teste específico é ignorado.

Para gerar o APK, preserve seus parâmetros atuais de loja e acrescente outros que você já utiliza. Exemplo a preencher:

~~~powershell
flutter build apk --release --dart-define=LOJA_BACKEND=railway --dart-define=LOJA_API_BASE_URL=https://SUA-API.up.railway.app --dart-define=LOJA_STORE_SLUG=SEU-SLUG
~~~

Não troque a URL pública da API por `postgres.railway.internal` nem pela conexão do PostgreSQL. Banco e credenciais permanecem no backend.

## 5. Configurar a apresentação no administrador

Use a tela existente de configurações da loja:

- **Nome exibido da loja:** marca comercial. Também entra no compartilhamento. Na ausência, é usado `LOJA_APP_NAME`, com alternativa “Loja de Roupas”.
- **Slogan:** uma frase curta que comunique a coleção ou proposta da loja; aparece em destaque no banner.
- **Descrição da loja:** apresentação breve. O banner mostra até duas linhas; mantenha o início objetivo.
- **URL HTTPS do logotipo:** imagem pública com margem suficiente e fundo adequado. Confira legibilidade em tamanho pequeno.
- **URL HTTPS do banner:** foto de coleção, ambiente ou campanha. Prefira imagem sem texto embutido; o app sobrepõe slogan e descrição e aplica escurecimento para leitura. Confira o recorte no celular e no desktop.
- **Cor primária/secundária:** use `#RRGGBB`. Cores muito claras recebem uma variação legível nos controles sobre fundo branco. A cor exata pode variar nesses controles para manter contraste.
- **WhatsApp:** confira o número com DDD, e o código do país se já cadastrado. Teste o botão de atendimento no aparelho.

Não é necessário editar widgets para trocar a marca. Os campos acima já existem no administrador; esta etapa passa a aproveitá-los na nova apresentação.

## 6. Preparar produtos para uma demonstração convincente

1. Cadastre categorias com nomes claros, evitando variações como “Camiseta” e “Camisetas” para o mesmo grupo.
2. Use fotos gerais consistentes de cada peça, com boa iluminação e proporção semelhante. Confira se os endereços HTTPS abrem sem login.
3. Na edição de variantes, preencha **“Imagem específica (URL HTTPS, opcional)”** com a foto daquela cor. O campo recebe uma imagem já hospedada; esta etapa não cria um novo envio de fotos de variantes.
4. Confira cor, tamanho e estoque de cada combinação. Padronize a escrita para evitar opções visualmente duplicadas. Não use cores/tamanhos fictícios para preencher filtros.
5. Marque alguns produtos como destaque e novidade; use preço anterior somente quando houver uma oferta real. Sem marcações, os produtos continuam acessíveis na coleção.
6. Escreva descrição, composição, cuidados e medidas reais disponíveis. Evite informações genéricas que possam induzir a escolha de tamanho incorreto.
7. Publique as peças que devem aparecer ao cliente. Variantes inativas não entram nas opções públicas.

A imagem específica da categoria é usada quando já está cadastrada. A interface administrativa atual de categorias não ganha um novo envio de imagem neste pacote; a vitrine usa uma foto de produto ou ícone quando necessário.

As imagens de prévia entregues junto ao ZIP usam a marca fictícia **Vila Moda** e ilustrações geradas por código nos testes. Elas demonstram o layout; não substituem produtos, fotos ou identidade da sua loja. O aplicativo continua usando os dados do seu catálogo.

## 7. Link de compartilhamento, opcional

O compartilhamento funciona com o texto do produto e o nome da loja. Se você JÁ possui uma vitrine web pública com a rota `/product/ID` funcionando, pode informar no build:

~~~text
--dart-define=LOJA_PUBLIC_STOREFRONT_URL=https://SUA-VITRINE
~~~

Use a URL da vitrine do comprador. Esta configuração não publica uma versão web e não configura links de abertura do aplicativo. Se ainda não tem essa vitrine acessível, deixe o parâmetro ausente; o app compartilha o texto sem inventar um endereço.

## 8. Conferência manual após instalar

1. Abra a Home: confira marca, banner, categorias e peças sem repetição nas seções.
2. Entre por uma categoria e por ofertas: confira o filtro inicial e a opção de limpar.
3. Busque um termo, aplique cor/tamanho/estoque e ordene pelos dois sentidos de preço. Role até carregar outra página, se houver produtos suficientes.
4. Abra uma peça, troque a cor e confira a foto. Escolha um tamanho esgotado e outro disponível; confira os botões e o total ao alterar a quantidade.
5. Adicione ao carrinho; confira a confirmação e a seleção salva. Em outra peça, use “Comprar agora” e confira o carrinho existente no checkout.
6. Confira favoritos, compartilhamento e WhatsApp com os dados reais da loja.
7. Amplie o texto nas configurações do aparelho e confira os controles principais. Teste também falha de conexão e nova tentativa.

## 9. Verificações desta entrega e limites

- Flutter analyze sem apontamentos; 59 testes Flutter e 78 testes backend aprovados.
- Inclui verificações de filtros, ordenação, cursores, busca atrasada, estoque, fotos por variante, contraste, limite de quantidade e produto independente da Home.
- Interfaces verificadas em testes de widgets com larguras de 320, 390 e 1200 pixels, incluindo texto ampliado em 30%. As quatro prévias PNG são capturas desses widgets com dados controlados.
- Não foi realizado deploy na sua Railway, consulta ao banco real, compra real nem instalação em aparelho físico durante esta entrega. Faça a conferência acima após publicar.

Se precisar reverter, restaure os arquivos SUBSTITUIR pelo backup anterior e remova somente os ADICIONAR indicados no manifesto. Restaure backend e aplicativo como um conjunto. Não há reversão SQL nesta etapa.

Próxima etapa prevista: melhorar checkout, entrega/retirada local e acompanhamento do pedido. Depois, rotina administrativa e preparação repetível do modelo por lojista.
