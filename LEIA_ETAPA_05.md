# Etapa 05 — operação administrativa

Base: https://github.com/othongustavo99/store-app, commit e21f715f4ba3bfcdd4bec0486491aecab16a80e0.
Pré-requisito: Etapas 01 a 04 aplicadas, incluindo a migration 017. Os arquivos da Etapa 04 foram conferidos contra esta base.
As melhorias desta etapa atendem ao backend Railway.

## 1. O que muda

### Pedidos e preparo de retirada

- Busca por pedido, cliente, telefone, nome da peça ou SKU na lista carregada.
- Filtros de pagamento pendente, a preparar, em preparo, retirada/entrega e finalizados. A tela informa quantos dos pedidos recentes estão sendo exibidos.
- Pedidos com **Pagar na retirada** podem ser preparados e marcados prontos antes de receber o dinheiro. O pagamento continua pendente e as peças permanecem reservadas.
- Proprietário ou gerente confirma o pagamento somente depois de conferir o recebimento. A confirmação baixa o estoque uma vez e preserva o preparo já realizado.
- O cliente vê “Em preparação · pagamento na retirada” ou “Pronto para retirada · pagamento pendente”, além da orientação para pagar no balcão.
- Funcionários sem gestão consultam os pedidos, mas não recebem os botões de preparo, confirmação financeira ou avanço operacional. O servidor também confere a autorização.
- A conclusão da retirada/entrega pede confirmação de que o cliente recebeu as peças.

### Estoque

- Tela com os saldos disponível, físico e reservado identificados separadamente.
- Ajuste mostra o saldo previsto antes de confirmar. Saídas não podem usar unidades reservadas e o estoque físico continua sujeito ao limite do servidor.
- Quantidade e motivo são obrigatórios. O histórico da variante permanece acessível.
- Se uma falha de conexão deixar o resultado incerto, o formulário mantém os dados e oferece **Repetir mesma operação**. A mesma chave é reutilizada para impedir uma segunda entrada/saída.
- Os controladores do formulário pertencem ao próprio diálogo, evitando uso após o fechamento.

### Produtos e categorias

- Cadastro começa sem cores ou tamanhos inventados. O lojista informa a grade real; opções repetidas com diferença apenas de maiúsculas/minúsculas são unificadas.
- Estoque disponível no cartão considera somente variantes ativas.
- Preços são convertidos em centavos sem arredondar casas decimais ocultas. Formatos aceitos incluem `79,90`, `79.90`, `1.250,00` e `1250`.
- Erros de validação/salvamento do produto aparecem em uma área fixa, acessível mesmo no formulário longo.
- Categoria pode receber ícone e imagem por URL HTTPS. A imagem passa a ser usada na vitrine já entregue.
- A edição envia a revisão carregada do produto. Se outra edição alterou os metadados, a API recusa a sobrescrita e orienta reabrir com os dados atuais.
- Botões de operação são bloqueados durante uma ação. Eventos do catálogo não substituem a lista enquanto um editor está aberto; a atualização pendente é recuperada ao fechar.
- O fechamento dos editores aguarda a animação antes de descartar seus controladores. Imagens/vídeos repetidos e excesso de mídias são recusados no formulário.

## 2. Aplicar os arquivos

1. Faça backup do projeto atual e do banco pelo seu fluxo habitual.
2. Extraia o ZIP em uma pasta temporária.
3. Copie seu CONTEÚDO para `C:\Users\othon\Documents\store\loja_roupas`, a pasta que contém `pubspec.yaml`.
4. Mescle as pastas e aceite substituir arquivos dos mesmos caminhos. Preserve os arquivos ausentes do pacote: ele é incremental.
5. Confira as operações e os hashes em `MANIFESTO_ETAPA_05.json`.

Nenhum arquivo precisa ser removido. O ZIP não contém `.env`, credenciais, `node_modules`, builds ou novas dependências.

**Migration nova: `backend/migrations/018_pickup_preparation.sql`. Preserve os SQL 001–017 exatamente como já foram aplicados. Não os formate nem os substitua para instalar esta etapa.**

Ordem de atualização: **banco → backend → aplicativo**.

## 3. Backend e banco

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas\backend'
npm ci
npm run build
npm test
npm run db:check
~~~

Com a etapa anterior aplicada, o diagnóstico deve mostrar 17 migrations aplicadas, somente a 018 pendente e nenhuma divergência. Se houver checksum divergente ou outra pendência, confira a versão e os arquivos antes de continuar; não altere o histórico para contornar o diagnóstico.

Confirme que `DATABASE_URL` aponta para o banco que o seu servidor usa. Preserve a conexão pública já configurada se estiver executando do Windows contra Railway. Não envie seu conteúdo no chat.

~~~powershell
npm run db:migrate:prod
npm run db:check
~~~

Esperado: 018 aplicada, 18 migrations aplicadas e nenhuma pendente/divergente. A migration adiciona o estado de preparo da retirada e sua notificação. Os pedidos anteriores começam sem preparo antecipado; ela não marca pagamentos, não baixa estoque e não altera pedidos para “prontos”.

Os testes automatizados não executam essa migration. Publique os arquivos backend no ramo/serviço que você já usa após atualizar o banco. Inclua o SQL 018 no repositório de deploy e mantenha as migrations anteriores.

Com o endereço real da API:

~~~powershell
$apiDaLoja = 'https://SUA-API.up.railway.app'
Invoke-RestMethod -Uri "$apiDaLoja/health/ready"
~~~

Não há token financeiro, integração externa ou variável de ambiente nova obrigatória. Aplicar o ZIP localmente não faz deploy na Railway.

## 4. Flutter

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas'
flutter pub get
flutter analyze
flutter test --concurrency=1 --dart-define=LOJA_BACKEND=railway
~~~

`--concurrency=1` executa as suítes uma por vez, reduzindo o consumo de memória dos testes de interface no Windows. Ele não muda o funcionamento nem o desempenho do aplicativo distribuído.

Gere o APK com os parâmetros atuais da sua loja. Exemplo a preencher:

~~~powershell
flutter build apk --release --dart-define=LOJA_BACKEND=railway --dart-define=LOJA_API_BASE_URL=https://SUA-API.up.railway.app --dart-define=LOJA_STORE_SLUG=SEU-SLUG
~~~

Preserve os outros parâmetros que já utiliza. Distribua o aplicativo depois da migration e do backend.

## 5. Como operar “Pagar na retirada”

Esta seção substitui a limitação de preparo antes do pagamento descrita na Etapa 04.

1. Habilite **Pagar na retirada** nas configurações existentes da loja, caso ainda não esteja habilitado.
2. O cliente escolhe retirada, seleciona esse pagamento e registra o pedido. O dinheiro fica pendente; o estoque fica reservado.
3. Em Pedidos, use **A preparar** ou **Pagamento pendente** para localizar a compra.
4. Toque em **Preparar · pagamento na retirada** quando começar a separar as peças.
5. Depois de separar, use **Pronto · pagamento na retirada** e confirme **Está separado**. O cliente verá que pode buscar e que ainda precisa pagar.
6. No balcão, confira o dinheiro recebido. Use **Confirmar recebimento manual** e confira o pedido/valor do diálogo antes de confirmar.
7. O pagamento passa a confirmado e o estoque é baixado uma vez. Se as peças já estavam prontas, o pedido continua pronto; não precisa reiniciar a preparação.
8. Use **Concluir pedido** depois de entregar as peças ao cliente.

Repetir a confirmação de um pagamento local já confirmado retorna o pedido existente, sem segunda baixa de venda.

Não há preparação antecipada por esse fluxo para Pix combinado, WhatsApp, pagamento online ou entrega. Essas modalidades conservam o fluxo anterior, com confirmação financeira antes do avanço operacional.

Reserva vencida, pedido cancelado, outra loja, falta de permissão ou pós-venda em andamento impedem o preparo. A validade existente da reserva não é estendida ao separar as peças. Em caso de vencimento, atualize o pedido e confira a situação; não confirme dinheiro nem recrie a compra apenas para contornar o bloqueio.

O preparo é uma informação operacional separada do pagamento. Ele não entra nos totais de vendas pagas. Os indicadores antigos de “pedidos a preparar” na visão geral continuam ligados aos pedidos pagos; para incluir as retiradas ainda a pagar, use o filtro **A preparar** da tela Pedidos.

## 6. Ajustar estoque com conferência

1. Abra **Estoque/Inventário** e localize a peça, SKU, cor e tamanho.
2. Confira **Físico**, **Reservado** e **Disponível**. Disponível corresponde ao físico menos as reservas.
3. Abra o ajuste, escolha entrada ou saída, informe quantidade e motivo.
4. Confira a prévia dos saldos. Uma saída de 4 unidades não é permitida se apenas 3 estão disponíveis, mesmo que o físico seja maior.
5. Confirme. O servidor relê e bloqueia o saldo atual na transação antes de gravar, portanto pode recusar uma prévia que ficou desatualizada.

Se o saldo mudou ou o servidor retornou uma recusa, feche e atualize a lista antes de conferir outro ajuste. Se aparecer **Repetir mesma operação**, não altere a quantidade para tentar de novo: a tentativa está preservada. Repita o mesmo envio ou feche e confira o histórico antes de iniciar outra operação.

Não use saída manual para representar uma venda já registrada por pedido. A confirmação financeira do pedido já baixa as peças reservadas.

## 7. Cadastrar e editar o catálogo

### Grade e estoque inicial

Informe as cores e os tamanhos realmente disponíveis, separados por vírgula, e toque em **Gerar grade**. Confira cada combinação e seu estoque inicial. Opções novas começam em zero; não são criadas quantidades positivas automaticamente.

Se alterar as listas, gere a grade novamente e confira as quantidades antes de salvar. Estoque de variantes existentes continua sendo alterado pelo Inventário, com movimentação e motivo, e não pela edição do preço/descritivo.

### Fotos, categorias e publicação

- A primeira imagem do produto é a capa. Confira as fotos antes de publicar. Limites atuais: 20 imagens e 5 vídeos por produto.
- Nova categoria aceita um ícone/emoji e uma URL HTTPS opcional de imagem. A imagem precisa estar hospedada e acessível sem login; este campo não faz upload de categoria.
- O envio de fotos de produto mantém a integração Cloudinary já existente. Não é necessário configurar um serviço novo para esta etapa.
- A foto específica da variante continua sendo informada pelo campo URL HTTPS opcional. Ela é usada na seleção de cor/tamanho do cliente, como na Etapa 03.
- Rascunho permite preparar o cadastro sem exibir a peça ao comprador. Publicação exige foto e uma variante ativa. Confira o estoque e as informações reais antes de publicar.
- Ocultar/arquivar retira a peça da vitrine sem apagar os snapshots dos pedidos anteriores.

### Edição em outro dispositivo

Se receber “Este produto foi alterado em outro dispositivo”, feche e reabra a edição pela lista atualizada. Confira a alteração feita pela outra pessoa e então reaplique o que deseja mudar. Não envie uma edição antiga novamente tentando vencer o bloqueio.

A verificação de revisão protege os metadados enviados pela versão atual do aplicativo. Aplicativos anteriores continuam aceitos durante a implantação gradual; atualize os dispositivos administrativos para usar essa proteção. Ajustes de estoque têm seu próprio controle transacional e não dependem dessa revisão.

## 8. Conferência manual após instalar

- Cadastre uma categoria com imagem HTTPS e confira a vitrine do comprador.
- Cadastre um rascunho com uma cor/tamanho reais, estoque inicial e preço com vírgula. Confira os SKUs gerados.
- Edite o mesmo produto em dois dispositivos: salve um, depois tente salvar a edição antiga do outro e confira a recusa.
- Confira que variantes inativas não são somadas como estoque disponível no cartão do produto.
- Faça uma entrada e uma saída de homologação, comparando prévia, saldo atualizado e histórico.
- Tente saída maior que o disponível e confira o bloqueio.
- Registre uma compra de homologação com **Pagar na retirada**, prepare, marque pronta e confira a tela do cliente ainda com pagamento pendente.
- Confirme o recebimento somente após a conferência correspondente e confira preservação do preparo e baixa única do estoque.
- Entre como funcionário sem gestão: consulte dados e confirme ausência dos botões de alteração restritos.
- Confira filtros/busca e as telas com texto ampliado no aparelho usado na demonstração.

## 9. Validação e limites

Resultado local: **Flutter analyze sem apontamentos, 88 testes Flutter e 116 testes backend aprovados**. A suíte Flutter foi executada com `--concurrency=1` após o executor ficar sem memória no modo paralelo.

Os testes usam repositórios, banco e serviços simulados. As prévias são capturas de widgets com dados fictícios. Não foi realizado deploy, aplicação da migration em banco real, recebimento real nem instalação em aparelho físico nesta entrega. Os resultados finais e a relação de arquivos ficam no manifesto.

As verificações incluem preparo sem confirmação financeira, estoque reservado, repetição idempotente, reserva vencida, permissões/loja, edição antiga do catálogo, preço em centavos, grade real, fechamento dos formulários, prévia de estoque e telas de 320 pixels com texto ampliado.

A lista de pedidos consulta até 100 pedidos recentes; busca e filtros atuam nessa lista e a tela informa o limite. O catálogo administrativo mantém o limite anterior de 500 produtos recentes. O Inventário permanece paginado em 50 variantes. A ampliação dessas consultas para grandes históricos fica para uma evolução posterior.

Para reverter código, use o backup anterior. Preserve a migration 018 e seu arquivo depois de aplicada; não remova a coluna nem o histórico SQL para reverter o aplicativo. Atualize os dispositivos administrativos em conjunto: versões antigas não exibem o preparo antecipado, embora o pagamento continue pendente no servidor.

Próxima etapa prevista: configuração repetível por lojista, identificação clara dos ambientes e preparação da demonstração comercial.
