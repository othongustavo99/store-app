# Etapa 02 — confiabilidade da compra

Base: https://github.com/othongustavo99/store-app, commit fca2116a46752e13bc2c46910f29e7b3618d914b.
Pré-requisito: Etapa 01 aplicada. O repositório utilizado nesta entrega já contém seus arquivos.
A conexão com o banco foi considerada resolvida, conforme confirmado nesta conversa.

## 1. O que muda

### Carrinho e favoritos

- Produtos salvos são recuperados pelos IDs, independentemente dos primeiros 50 itens da Home.
- Nova rota pública POST /v1/shops/:slug/catalog/products/resolve, limitada a 100 IDs por chamada e aos produtos publicados da loja indicada.
- O aplicativo divide listas maiores em lotes. Falha em qualquer lote não vira uma resposta parcial usada para limpar o carrinho.
- Carrinho com falha de recuperação mostra uma mensagem e “Tentar novamente”, preservando os dados locais.
- Favoritos exibem mensagem de falha e permitem nova tentativa. Produtos indisponíveis são diferenciados de uma lista vazia.
- A lista de favoritos conserva IDs indisponíveis para que as peças possam reaparecer quando publicadas novamente.
- Favoritar durante a inicialização conserva a lista anterior; gravações de toques rápidos são serializadas.
- Na recuperação bem-sucedida do carrinho, preço e estoque são atualizados. A regra existente continua limitando quantidade ao estoque e removendo itens/variantes confirmados como indisponíveis.

### Cupom e pagamento online

- O gateway recebe os preços com o desconto efetivamente registrado no pedido.
- Subtotal, desconto, frete e total são conferidos antes de chamar o gateway.
- Rateio e arredondamento usam centavos inteiros. O frete permanece integral.
- Quando necessário, uma linha é dividida em duas faixas de preço para preservar cada centavo. Em descontos extremos, produtos são agregados em uma linha de cobrança, com descrição; o detalhamento original permanece no pedido.
- A resposta do gateway também precisa corresponder ao total e à referência do pedido.
- Ao retomar pedido com cupom e preferência ainda válida, o servidor consulta o gateway. Se o valor da preferência antiga estiver incorreto, atualiza a mesma preferência e confere a resposta antes de devolver o link.
- A listagem não entrega diretamente links de pedidos com desconto: a retomada passa pela verificação.
- A confirmação por webhook continua verificando assinatura, referência, moeda e valor.

### Mensagem de pagamento local

A informação em “Meus pedidos” acompanha o estado retornado pela API. Após confirmação do responsável, mostra “Pagamento confirmado pela loja”. Cancelamento, revisão e reembolso têm mensagens próprias, sem continuar dizendo que o pagamento está pendente.

## 2. Como aplicar o ZIP

1. Faça backup/cópia ou registre no Git o projeto com a Etapa 01.
2. Extraia este ZIP em uma pasta temporária.
3. Copie seu CONTEÚDO para C:\Users\othon\Documents\store\loja_roupas, a pasta que contém pubspec.yaml.
4. Mescle backend, lib, test e docs e aceite substituir arquivos de mesmos caminhos.
5. Confira o MANIFESTO_ETAPA_02.json: cada arquivo tem operação ADICIONAR ou SUBSTITUIR e SHA-256.
6. Nenhum arquivo deve ser removido. Preserve os arquivos que não aparecem no pacote.
7. O pacote é incremental; não substitua a pasta inteira do projeto pelo conteúdo reduzido deste ZIP.

Nenhum .env, credencial, node_modules, build, dist ou arquivo SQL é incluído. Não há mudança de dependências nem migration nova. As migrations 001–016 permanecem como estão.

A ordem de atualização é **backend primeiro, aplicativo depois**. O novo aplicativo precisa da rota de resolução por IDs.

## 3. Backend — compilar e validar

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas\backend'
npm ci
npm run build
npm test
npm run db:check
~~~

Resultados esperados: TypeScript compila; 71 testes passam; db:check conecta ao banco e informa o histórico. Os testes de rotas desta etapa usam banco e gateway simulados; não fazem compras reais.

Mantenha DATABASE_URL e os segredos já configurados. Não precisa repetir a configuração de conexão resolvida na Etapa 01. Se aparecer pendência SQL antiga, ela pertence ao histórico anterior; esta etapa não exige executar db:migrate:prod.

Não é necessário habilitar gateway, trocar tokens ou modificar flags de demonstração para instalar a atualização.

## 4. Publicar o backend antes de atualizar o APK

Coloque os arquivos backend deste pacote no repositório/ramo que alimenta o deploy, usando seu fluxo habitual. Faça o deploy e confira build e /health/ready.

A rota nova pode ser conferida com o endereço real da API, o slug e o UUID de um produto publicado dessa loja:

~~~powershell
$apiDaLoja = 'https://SUA-API.up.railway.app'
$slugDaLoja = 'SEU-SLUG'
$consultaProdutos = @{ ids = @('UUID-DE-UM-PRODUTO-PUBLICADO') } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$apiDaLoja/v1/shops/$slugDaLoja/catalog/products/resolve" -ContentType 'application/json' -Body $consultaProdutos
~~~

Preencha os exemplos antes de executar. Resposta esperada: products contendo o produto correspondente. UUID ausente, de outra loja ou não publicado não deve aparecer na lista.

404 nessa rota pode significar que o backend antigo ainda está publicado ou que o slug não existe. Confira a versão do deploy. O aplicativo preserva seu cache se a consulta falhar; atualizar só o APK não cria a rota no servidor.

## 5. Flutter — validar e gerar a atualização

Na raiz do projeto:

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas'
flutter pub get
flutter analyze
flutter test
~~~

Resultados esperados: analyze sem apontamentos e 40 testes aprovados.

Gere o APK com seus parâmetros de backend e loja atuais. Exemplo a preencher:

~~~powershell
flutter build apk --release --dart-define=LOJA_BACKEND=railway --dart-define=LOJA_API_BASE_URL=https://SUA-API.up.railway.app --dart-define=LOJA_STORE_SLUG=SEU-SLUG
~~~

Use a URL e o slug corretos, além de outros parâmetros de marca/distribuição que já utiliza. Foi utilizado Flutter 3.47.2 / Dart 3.13.2 na validação.

Instale como atualização do aplicativo existente, com o mesmo identificador e assinatura, para conservar as preferências locais. Reinstalar com limpeza de dados apagaria as listas do dispositivo.

## 6. Conferência funcional no aparelho

Use sua loja de demonstração/homologação para as verificações.

**Carrinho**
1. Escolha um produto pela busca. Quando o catálogo tiver mais de 50 itens, inclua um que esteja fora da seleção inicial.
2. Adicione cor/tamanho, feche totalmente o aplicativo e abra novamente.
3. Confira o item, a quantidade aceita e o preço atual.
4. Com itens salvos, feche o app, desligue a rede e abra o carrinho: deve aparecer falha de recuperação, sem declarar o carrinho vazio.
5. Ligue a rede e toque em “Tentar novamente”: os itens válidos devem voltar.
6. Arquive ou esgote uma peça na loja de teste e recupere novamente: a disponibilidade confirmada no servidor continua sendo respeitada.

**Favoritos**
1. Favorite uma peça da busca e confira a aba Favoritos.
2. Feche/abra e confirme a persistência.
3. Teste falha de rede e recuperação.
4. Se uma peça salva deixar de ser publicada, a tela deve informar indisponibilidade e conservar seu ID.
5. Toque rapidamente em favoritar/desfavoritar e confira o resultado após reabrir.

**Pagamento com cupom**
1. Teste cupom fixo e percentual no checkout demo e confira os totais no pedido e painel.
2. Inclua mais de uma unidade e confira os centavos.
3. Se houver gateway já configurado para homologação, confira também o valor no checkout do Mercado Pago. Demo e pagamento combinado não exercitam a API do gateway.
4. Em pedido pendente existente com cupom, retome o pagamento pelo aplicativo e confira o total.
5. Feche checkouts que estavam abertos no navegador antes do deploy e retome pelo aplicativo atualizado.

Valores já pagos na versão anterior não são alterados nem reembolsados automaticamente por este pacote. Caso existam cobranças antigas com cupom divergente, concilie os pedidos e o gateway antes de orientar novo pagamento. Links antigos compartilhados externamente e ainda não retomados pelo app mantêm o estado no provedor até serem atualizados ou expirarem; a preferência gerada pelo código anterior tinha validade de 30 minutos.

**Pagamento combinado**
1. Em uma loja de homologação com essa modalidade, registre um pedido e confira a mensagem de conferência pendente.
2. Confirme pelo painel com uma conta responsável autorizada.
3. Atualize “Meus pedidos”: a mensagem deve ser “Pagamento confirmado pela loja”.
4. Verifique também as mensagens de cancelamento e revisão, quando aplicáveis.

## 7. Validação executada nesta entrega

- Flutter analyze: No issues found.
- Flutter test: 40/40 aprovados.
- TypeScript compilado e backend: 71/71 testes aprovados.
- Testes financeiros incluem 400 combinações determinísticas de valores, quantidades, descontos e frete.
- Testes de rota verificam payload enviado ao gateway, correção/reutilização de preferência antiga e bloqueio por divergência.
- Testes da consulta por IDs verificam validação, limites, parâmetros da loja e tratamento de produtos ausentes.
- Testes de interface verificam recuperação após erro, produto salvo fora da Home, indisponibilidade e mensagens de pagamento.
- O fluxo por IDs também foi exercitado com a flag LOJA_BACKEND=railway e API simulada.

Não apliquei alterações em banco real, não realizei cobranças e não publiquei no Railway. Os testes de banco/gateway nesta etapa utilizam simulações e não comprovam por si só o funcionamento contra PostgreSQL/Mercado Pago reais. A conferência no aparelho e em homologação continua necessária.

## 8. Limites e continuidade

- As listas continuam locais ao dispositivo; não há sincronização entre aparelhos.
- Itens que a versão antiga já removeu permanentemente do carrinho precisam ser adicionados novamente.
- A Home continua sendo uma seleção inicial de até 50 produtos; o catálogo completo permanece na busca.
- A paginação administrativa, a política de duração de reservas e a integração financeira por lojista ficam para etapas próprias.
- Os avisos de vulnerabilidades das dependências enviados anteriormente também precisam de análise específica; esta etapa não atualiza pacotes.
- A próxima etapa concentra o polimento da vitrine e do produto: marca consistente, filtros do catálogo, fotos/variantes e ações de compra.

## 9. Reverter os arquivos

Restaure do seu backup os arquivos marcados SUBSTITUIR e remova somente os marcados ADICIONAR no manifesto desta etapa. Recompile backend e aplicativo. Para consistência do fluxo, reverta as duas partes em conjunto.

Não há reversão de esquema nesta entrega. Atualizações de preferências feitas no gateway não são desfeitas pela restauração de arquivos. Não retorne a uma versão com cobrança incorreta para continuar usando cupom em pagamento real.

## Referência técnica

[Mercado Pago — criar preferência](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/create-preference/post)
[Mercado Pago — atualizar preferência](https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-pro-preferences/update-preference/put)
