# Etapa 06 — configuração por lojista e demonstração comercial

Base: [store-app](https://github.com/othongustavo99/store-app), commit `1b41edb9cf152140697be9d80c220acdb46058f2`.
Pré-requisito: Etapas 01 a 05 aplicadas, com as migrations 001–018 já executadas. Os arquivos entregues na Etapa 05 foram conferidos contra esta base.
Esta etapa atende ao modo Railway e acrescenta um fluxo repetível para preparar cada cliente.

## 1. O que foi entregue

- **Identidade da loja:** formulário organizado, quatro paletas iniciais, prévia de nome, slogan, logotipo, banner e cores. Nome e cores atualizam a prévia durante a edição; novas URLs de imagem são carregadas pelo botão de atualizar imagens. A prévia é ilustrativa; salvar publica os dados usados pela vitrine existente.
- **Edição protegida:** confirmação ao descartar alterações, rascunho preservado quando o salvamento falha, revisão do perfil enviada à API e botão de salvar fixo. Funcionários consultam; proprietário e gerente editam.
- **Loja e ambiente:** indicação do modo informado pelo servidor, slug e botão para copiar o UUID. O modo não pode ser convertido pela tela ou pelo JSON de marca.
- **Preparação da loja:** pendências de identidade, atendimento, catálogo com estoque, retirada, pagamento e políticas, com atalhos. Retirada, entrega local, pagamento online e transportadora aparecem conforme a configuração do backend. O indicador registra configuração cadastrada, sem prometer aprovação do gateway ou da loja.
- **Configuração por cliente:** JSON validado, gerador de parâmetros Flutter e plano Android. Dados do proprietário não entram nos parâmetros públicos do APK.
- **Provisionamento administrativo:** plano somente leitura por padrão; `--apply` cria uma loja nova com perfil, retirada e vínculo do proprietário já cadastrado. Uma loja existente é conferida e preservada, inclusive quando se usa `--apply`.
- **Conferência na abertura:** builds gerados por este fluxo verificam UUID, slug e modo da loja antes de montar o aplicativo e conferem novamente a identificação na disponibilidade do checkout. Há recuperação de falha de conexão. Builds antigos sem esses novos parâmetros continuam sem vínculo obrigatório.
- **Android por marca:** helper passa nome instalado, application ID e uso de Firebase ao Gradle. Produção exige release com assinatura própria. O helper não publica em loja de aplicativos nem altera o código-fonte para trocar de cliente.
- **Demo:** o seed recusa converter uma loja comercial em demonstração.

## 2. Aplicar o ZIP

1. Faça uma cópia do projeto atual.
2. Extraia o ZIP em uma pasta temporária e copie seu CONTEÚDO para `C:\Users\othon\Documents\store\loja_roupas`, onde está `pubspec.yaml`.
3. Mescle as pastas e aceite substituir os arquivos dos mesmos caminhos. Preserve os arquivos que não estão no pacote: a entrega é incremental.
4. Confira caminhos, operações e hashes em `MANIFESTO_ETAPA_06.json`.

**Nenhum arquivo deve ser removido. Não há migration nova, alteração dos SQL 001–018 ou mudança de dependências.** O ZIP não inclui `.env`, senhas, certificados, configurações locais de clientes, `node_modules`, builds ou APK.

Ordem de atualização: **backend → aplicativo**. Preserve a conexão pública do PostgreSQL que você já ajustou para executar comandos pelo Windows.

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas\backend'
npm ci
npm run build
npm test
npm run db:check
~~~

O diagnóstico deve mostrar **18 migrations aplicadas, nenhuma pendente e nenhuma divergência**. Não execute migration nova para instalar esta etapa. Os testes usam banco e serviços simulados, mas a configuração do backend precisa carregar: preserve seu `.env` local válido e não compartilhe seu conteúdo.

Publique o backend pelo fluxo que você já utiliza. Aplicar o ZIP localmente não atualiza a Railway. Confira `/health/ready` com a URL real da API e abra o perfil da loja antes de gerar um novo app.

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas'
flutter pub get
flutter analyze
flutter test --concurrency=1 --dart-define=LOJA_BACKEND=railway
~~~

Não há variável de ambiente nova obrigatória no servidor. `ALLOW_STORE_SELF_SERVICE` pode continuar desativada: o novo provisionamento é um comando administrativo que acessa o banco configurado no backend, sem abrir cadastro público de lojas.

## 3. Primeiro, experimente o painel existente

Entre como proprietário ou gerente e abra **Identidade da loja** nas configurações administrativas. Edite nome, slogan e cores, confira a prévia e salve. Para imagens, utilize URLs HTTPS de arquivos da própria marca. URLs de políticas devem abrir páginas reais com o conteúdo da loja.

Saia e entre na vitrine para conferir a marca publicada. Use o checklist para completar catálogo, estoque e retirada. A prévia não substitui o teste da vitrine real em diferentes tamanhos de tela.

O perfil visual permanece no backend. Nome instalado, ícone, identificador Android, API e loja vinculada pertencem ao aplicativo distribuído e exigem outro build quando mudam. O helper cobre nome e identificador Android; **ícones, splash e configuração nativa de iOS continuam sendo ajustes próprios de cada entrega**.

## 4. Preparar um app para uma loja JÁ existente

Não é preciso provisioná-la novamente.

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas'
Copy-Item -LiteralPath 'config\loja.example.json' -Destination 'config\minha-loja.local.json'
~~~

Edite `config/minha-loja.local.json`. O exemplo é fictício e não deve ser usado sem ajustes. Campos principais:

| Campo | Preencher com |
| --- | --- |
| `store.id` | Adicione o UUID real copiado no painel; necessário para preparar o app de uma loja existente |
| `store.name` | Nome da loja; usado para criar o perfil apenas quando a loja é nova |
| `store.slug` | Slug real, em minúsculas, números e hífens |
| `store.mode` | `DEMO` para loja de demonstração; `LIVE` para loja comercial/homologação |
| `store.ownerEmail` | Email da conta do proprietário; usado pelo provisionamento, não incluído no APK |
| `app.apiBaseUrl` | HTTPS público da API, sem credenciais, consulta ou fragmento |
| `app.applicationId` | Identificador Android exclusivo da marca e do ambiente |
| `app.displayName` | Nome que será exibido no aparelho |
| `app.environment` | `demo`, `homologacao` ou `producao` |
| `app.pushEnabled` | Comece com `false`; `true` requer configuração Firebase compatível com esse application ID |
| `app.publicStorefrontUrl` | Opcional, URL pública da vitrine para compartilhamento; deixe vazio se não houver |
| `brand` | Perfil inicial de uma loja nova; em loja existente, altere pelo painel |
| `fulfillment` | Retirada/entrega inicial de uma loja nova; em loja existente, altere pelo painel de entregas |

Exemplo do trecho `store` com UUID ilustrativo — substitua pelo real:

~~~json
"store": {
  "id": "10000000-0000-4000-8000-000000000001",
  "name": "Vila Moda Demonstração",
  "slug": "vila-moda-demo",
  "mode": "DEMO",
  "ownerEmail": "proprietario@example.com"
}
~~~

Separação exigida pelo validador:

| Ambiente | Modo da loja | Final do application ID |
| --- | --- | --- |
| `demo` | `DEMO` | `.demo`, como `br.com.suamarca.vilamoda.demo` |
| `homologacao` | `LIVE` | `.hml` ou `.homologacao` |
| `producao` | `LIVE` | ID próprio sem esses três sufixos |

**O campo ambiente não cria outro banco nem coloca o gateway em sandbox.** Homologação deve apontar para sua API/banco de teste e usar as credenciais de teste adequadas no servidor. Mantenha demo e operação real em lojas distintas; configurar `LIVE` no JSON não converte a loja do banco.

O JSON aceita apenas os campos previstos. Não coloque `DATABASE_URL`, senha, token, segredo de webhook ou chave privada nele. `config/*.local.json` e `.client-builds/` estão ignorados no Git; mantenha também uma cópia privada da configuração de cada cliente.

Prepare os arquivos públicos sem acessar o banco:

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas\backend'
npm run client:prepare -- --config=../config/minha-loja.local.json
~~~

Saída em `.client-builds/<slug>-<ambiente>/`: `flutter.defines.json` e `android.plan.json`. O comando valida a estrutura do arquivo; a conferência da loja no servidor acontece ao abrir o novo app. Ele não altera perfil, credenciais, catálogo ou pedidos.

## 5. Criar uma loja NOVA, quando fechar com outro cliente

O comando é destinado a você, administrador da infraestrutura. Ele usa `DATABASE_URL` do backend; confira o banco selecionado antes de qualquer `--apply`.

1. O proprietário precisa ter uma conta **ativa** cadastrada pelo fluxo de cadastro existente. O comando não cria usuário, senha ou token. Para uma nova API ainda sem aplicativo configurado, o cadastro existente é `POST /v1/auth/register`, com `name`, `email` e `password`; use seu cliente de API habitual e não compartilhe senha ou resposta com tokens.
2. Crie outro arquivo `.local.json`, com slug novo, email do proprietário, modo e marca corretos. **Omita `store.id`** ao planejar uma loja nova. Não reaproveite o slug da demonstração para uma loja comercial.
3. Execute primeiro o plano:

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas\backend'
npm run store:provision -- --config=../config/novo-cliente.local.json
~~~

`CREATE_PLANNED` indica que pode ser criada; nenhuma escrita é realizada nesse modo. Depois de conferir os dados e o banco, você pode aplicar:

~~~powershell
npm run store:provision -- --config=../config/novo-cliente.local.json --apply
~~~

`CREATED` indica que loja, vínculo `OWNER`, perfil, retirada/entrega inicial e auditoria foram gravados em uma transação. A loja começa sem catálogo, pedidos, recebimentos e credenciais externas. Falha antes do commit desfaz a transação.

O comando gera `store.resolved.json`, `flutter.defines.json` e `android.plan.json` na pasta `.client-builds/<slug>-<ambiente>/`. Guarde o arquivo resolvido, que inclui o UUID real, e use-o para os próximos builds. O email do proprietário fica no arquivo resolvido local, sem ir para os parâmetros do Flutter.

Se o slug já existir, o comando exige correspondência de modo, UUID informado e proprietário com papel `OWNER`; retorna **`EXISTING_UNCHANGED`**. Ele não troca nome, perfil, conta, equipe, estoque ou pedidos existentes. Para atualizar marca e entrega, use o painel. O JSON pode conter uma marca diferente da salva: em loja existente, quem define a vitrine é o perfil do servidor.

Não habilite o cadastro público de lojas como atalho. Não apague uma loja com histórico para refazer a configuração.

## 6. Gerar o APK por cliente

Com o backend compilado, SDK Flutter/Android configurados e o JSON contendo UUID:

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas'
# Apenas preparar e mostrar o plano; nenhum APK é compilado:
.\tools\build-client.ps1 -Config '.\config\minha-loja.local.json'

# Compilar uma demo ou homologação para testar:
.\tools\build-client.ps1 -Config '.\config\minha-loja.local.json' -Build -Mode debug
~~~

Para uma loja recém-criada, substitua `-Config` pelo caminho do arquivo resolvido, por exemplo `.\.client-builds\vila-moda-demo-demo\store.resolved.json`.

O helper passa os dados ao Flutter/Gradle, copia o APK somente se a compilação terminar com sucesso e grava um recibo com ambiente, UUID, application ID e hashes. A saída fica na mesma pasta `.client-builds`. Ao terminar ou falhar, restaura as variáveis de ambiente e a pasta de trabalho do PowerShell.

As propriedades são transmitidas com `ORG_GRADLE_PROJECT_*`, mecanismo documentado pelo [Gradle](https://docs.gradle.org/current/userguide/project_properties.html). O namespace Kotlin permanece compatível com o código existente; o application ID identifica o app instalado. Preserve o application ID de uma marca depois de publicar, conforme a [documentação Android](https://developer.android.com/build/configure-app-module).

### Produção

Use `store.mode=LIVE`, `app.environment=producao` e application ID próprio. Configure `android/key.properties` e o arquivo de assinatura particular seguindo o [guia de assinatura do Flutter](https://docs.flutter.dev/deployment/android#sign-the-app). As propriedades esperadas são `storeFile`, `storePassword`, `keyAlias` e `keyPassword`; `storeFile` é resolvido a partir de `android/app`. Não envie chaves ou senhas no Git ou no ZIP e mantenha backup privado para atualizar o mesmo app depois.

~~~powershell
.\tools\build-client.ps1 -Config '.\config\cliente-producao.local.json' -Build -Mode release
~~~

O helper recusa produção em debug e produção sem assinatura própria. Builds legados feitos fora dele conservam o comportamento anterior de assinatura; use o fluxo novo para as entregas comerciais. A etapa não automatiza AAB, publicação na Play Store, certificados de iOS ou lojas de aplicativos.

Com `pushEnabled=false`, o build Railway pode dispensar `google-services.json`. Com `true`, instale a configuração Firebase da própria marca e confira a integração de notificações já existente em aparelho real. Um novo application ID precisa da configuração correspondente; não reaproveite o arquivo de outro cliente.

## 7. Uma demonstração que ajude a vender

Use uma loja `DEMO` exclusiva, marca fictícia ou autorizada e outro identificador Android. Depois de provisionar uma demo **vazia**, o seed existente pode adicionar catálogo fictício:

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas\backend'
npm run demo:seed -- --slug=vila-moda-demo --enable-demo
~~~

Troque o slug pelo correto. Nesse fluxo, não passe `--owner-email`: o proprietário já foi vinculado pelo provisionamento. O seed não limpa pedidos ou estoque, não converte lojas comerciais e preserva um catálogo demo já carregado. As imagens tipográficas do seed são placeholders; substitua-as por fotos próprias ou licenciadas para uma apresentação comercial convincente.

Para uma demonstração com acesso público, a flag existente `ENABLE_PUBLIC_DEMO_LOGIN` só deve ser usada onde esse acesso fizer parte da apresentação; ela não dá acesso administrativo à loja comercial. Prefira uma conta de demonstração sem dados pessoais reais para apresentar o painel.

Roteiro de apresentação sugerido: navegar pela coleção → filtrar e buscar → escolher cor/tamanho → favoritar → carrinho → compra simulada com retirada → acompanhar pedido. No painel, mostrar cadastro de produto, estoque e preparação da retirada. Deixe explícito na apresentação que os pedidos demo não geram cobrança.

## 8. Pagamentos, entrega e validação antes da entrega comercial

A personalização da marca está mais simples, mas **o backend ainda usa integrações piloto por UUID de loja**. Não há conexão OAuth automática de várias contas de lojistas. Um token compartilhado não deve receber pagamentos por lojas diferentes.

Para o cliente que precisa de checkout online, configure a integração própria no servidor correspondente àquela loja e valide o fluxo. O caminho atual para vários clientes com credenciais independentes é manter serviços/ambientes próprios por operação ou desenvolver depois a conexão por lojista. O arquivo de marca não deve transportar credenciais financeiras. Entrega por transportadora também depende da integração autorizada, origem, medidas/peso e configuração de sandbox/produção do servidor.

Pagamento combinado, Pix manual e pagar na retirada continuam pendentes até a conferência do responsável. Em demo essas opções ficam desabilitadas. O checklist não consulta gateway ou transportadora: presença de configuração e links não prova funcionamento ou conteúdo externo.

Antes de distribuir, confira em aparelho real, com a API publicada:

- marca, ícone, splash, fotos, contraste, teclado, tela pequena e carregamento em conexão lenta;
- permissões de proprietário, gerente e funcionário;
- catálogo, variantes, disponibilidade e atualização de estoque;
- compra, repetição após falha de conexão, cupom, retirada/entrega e acompanhamento pelo cliente;
- recebimento conferido pela equipe, cancelamento, liberação de reserva e regras de trocas;
- pagamento online e webhook, se habilitados, usando primeiro o ambiente de testes do provedor;
- assinatura, application ID e atualização de uma versão anterior da mesma marca.

Os limites já documentados de listagem administrativa permanecem: catálogo até 500 registros recentes, pedidos até 100 recentes e estoque com paginação de 50. Esta etapa não amplia esses limites.

## 9. Verificações desta entrega e reversão

Verificações registradas no manifesto: analyze sem apontamentos, 100 testes Flutter na suíte completa, 12 testes desta etapa repetidos após o ajuste final da tipografia da prévia e 132 testes backend aprovados. O helper passou pela análise de sintaxe PowerShell e por verificações de geração do plano, restauração do ambiente após falha simulada do compilador e bloqueio de produção em debug ou sem assinatura.

Os testes de widgets incluem 320 pixels com texto ampliado, edição, descarte, falha de gravação, permissões e bloqueio/recuperação da conexão com a loja. Os testes backend usam banco e serviços simulados, inclusive no provisionamento; nenhum comando de criação foi aplicado ao seu banco.

**Limite da verificação Android:** a tentativa local de `gradle help --offline` encerrou durante o carregamento das configurações com `The settings are not yet available for build`. Portanto, a configuração nativa e o empacotamento Android ainda precisam ser validados pelo build no seu ambiente. Não foi gerado ou validado APK nesta entrega. Depois de aplicar o pacote, execute o helper para uma demo em debug e teste no aparelho antes de preparar uma versão comercial. O resultado dos testes Dart não substitui esse build.

As imagens de prévia que acompanham a entrega foram geradas por testes com dados fictícios. Não foram realizados deploy, cobrança, provisionamento em banco real ou publicação de aplicativo por mim.

Para reverter o código, restaure sua cópia anterior e publique novamente backend/app compatíveis. Não há migration a desfazer. Se você criar uma loja com `--apply`, reverter o código não remove essa loja nem seu histórico; preserve os dados e corrija sua configuração pelo procedimento administrativo.
