# Etapa 01 — estabilidade, testes e diagnóstico do banco

Base: repositório https://github.com/othongustavo99/store-app, commit 747e7ed8a6f03f4f0714643d50fed223c829c2bb.
Esta entrega inicia a sequência de evolução do modelo comercial. Ao pedir a próxima etapa, a Etapa 01 será considerada aplicada.

## 1. O que esta etapa entrega

- Correção dos testes de ProductCard com ProviderScope e preferências isoladas.
- Teste de favoritar e desfavoritar.
- Correção de imports não utilizados e blocos de controle apontados pelo analyze.
- Migração dos seletores de frete e pagamento para RadioGroup, preservando as escolhas e regras existentes.
- Erros de banco legíveis, inclusive AggregateError sem mensagem.
- Identificação da fase ou migration que falhou; proteção para não esconder a causa por falha no rollback/encerramento.
- Localização da pasta migrations independente da pasta de execução.
- Comando db:check, com transação somente leitura, para testar conexão, pendências e checksums.
- Guia de configuração Windows/Railway e registro das próximas etapas.

Não há arquivos SQL novos ou modificados neste pacote. Não há arquivos a remover nesta etapa. Não é necessário alterar versões das dependências.

## 2. Como aplicar os arquivos

1. Feche o aplicativo em execução. Guarde uma cópia do projeto atual ou registre seu estado no Git antes de substituir.
2. Extraia este ZIP em uma pasta temporária.
3. Leia este arquivo e o MANIFESTO_ETAPA_01.json.
4. Copie o CONTEÚDO extraído para C:\Users\othon\Documents\store\loja_roupas, mesclando lib, backend, test e docs e aceitando substituir os arquivos de mesmos caminhos.
5. A raiz de destino é a pasta que contém pubspec.yaml, não a pasta backend.
6. Não apague sua pasta atual para colocar apenas este pacote: ele contém somente arquivos alterados/novos.
7. Nenhum .env, google-services.json, chave, node_modules, build ou dist é incluído. Preserve suas configurações locais.
8. Nenhum arquivo precisa ser removido.

O manifesto lista cada arquivo como ADICIONAR ou SUBSTITUIR e informa SHA-256. A lista de remoções está vazia.

## 3. Validar o aplicativo

Na raiz Flutter:

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas'
flutter pub get
flutter analyze
flutter test
~~~

Use a versão Flutter já utilizada nos logs enviados. A validação desta entrega usou Flutter 3.47.2 / Dart 3.13.2.

As mensagens “packages have newer versions incompatible with dependency constraints” são avisos de versões disponíveis; não são os erros dos testes. Não rode pub upgrade --major-versions para aplicar esta etapa.

Os testes do cartão agora têm o escopo Riverpod e preferências de teste. O escopo principal do aplicativo já existia e continua sendo utilizado.

Para testar a instalação conectada à loja, gere o APK com os mesmos parâmetros de backend/URL/slug que você já utiliza. Exemplo a preencher:

~~~powershell
flutter build apk --release --dart-define=LOJA_BACKEND=railway --dart-define=LOJA_API_BASE_URL=https://SUA-API.up.railway.app --dart-define=LOJA_STORE_SLUG=SEU-SLUG
~~~

Substitua URL e slug pelos seus valores atuais. A etapa não muda a loja de destino nem ativa recebimentos. Se usa um script próprio de build, preserve seus parâmetros.

Teste no aparelho: abrir um produto, favoritar/desfavoritar, abrir carrinho, avançar para checkout e alternar os meios disponíveis. Se entrega já estiver configurada, alterne as opções de frete. A seleção deve continuar funcionando e apenas uma opção por grupo fica marcada.

## 4. Validar o backend

~~~powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas\backend'
npm ci
npm run build
npm test
npm run db:check
~~~

O backend continua exigindo DATABASE_URL e JWT_SECRET válidos na configuração. Mantenha seu segredo atual; não precisa trocar credenciais para instalar estes arquivos.

IMPORTANTE: npm run db:migrate:prod usa dist. Portanto, execute npm run build após substituir o TypeScript. O pacote não inclui dist para evitar divergência entre fonte e compilado.

db:check usa apenas consultas dentro de BEGIN READ ONLY e encerra a sessão. Não cria tabelas, não aplica SQL de migrations e não altera dados. Uma lista de migrations pendentes indica o estado do banco, sem aplicá-las. Checksum divergente/arquivo ausente encerra com erro e precisa ser investigado antes de migrar.

## 5. O erro “Falha nas migrations:” sem complemento

No arquivo .env local encontrado nesta sessão, DATABASE_URL aponta para localhost:5432. As tentativas TCP para 127.0.0.1:5432 e ::1:5432 foram recusadas. Isso indica que não havia PostgreSQL aceitando conexão nessa porta durante a verificação. A senha não foi exibida.

O erro exato da execução anterior não pode ser reconstruído a partir da mensagem vazia. O resultado local observado é compatível com um AggregateError de conexão. O novo tratamento mostra seus erros internos, a fase da execução e uma orientação.

Após recompilar, uma conexão recusada deve mostrar, por exemplo:

~~~text
Falha nas migrations (conexão com PostgreSQL):
ECONNREFUSED
ECONNREFUSED: connect ECONNREFUSED ::1:5432
ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:5432
Conexão recusada: confira host/porta e se o PostgreSQL está ativo...
~~~

Escolha a configuração abaixo de acordo com o banco que você realmente pretende usar.

### Caso A — PostgreSQL no próprio computador

- localhost só está correto se o PostgreSQL estiver instalado e iniciado nesse computador.
- Inicie o serviço PostgreSQL existente; confirme porta, usuário, senha e nome do banco de desenvolvimento.
- Ajuste DATABASE_URL no backend/.env para esses dados.
- Se o PostgreSQL roda em container, confirme a porta publicada no Windows.
- Rode npm run db:check novamente.

Não é necessário instalar banco local se a intenção é executar o comando contra o Railway.

### Caso B — comando executado no Windows, banco no Railway

1. No projeto Railway, abra o serviço PostgreSQL correto.
2. Consulte a opção de conexão externa. Se não estiver disponível, Settings → Networking → Public Access/TCP Proxy.
3. Use a conexão externa fornecida pelo serviço, normalmente DATABASE_PUBLIC_URL, com domínio e PORTA do proxy.
4. No backend/.env LOCAL, coloque essa conexão como valor de DATABASE_URL.
5. Preserve JWT_SECRET e demais variáveis do seu ambiente.
6. Rode npm run db:check.

A variável esperada pela aplicação continua chamando DATABASE_URL. Você usa nela o VALOR da conexão pública ao executar no Windows. Não substitua pela URL HTTP da API e não use .railway.internal fora da rede Railway.

Se DATABASE_URL já estiver definida como variável no PowerShell/Windows, ela tem prioridade sobre o .env. Confira a configuração do terminal antes de concluir que uma edição não funcionou; abra um terminal novo ou remova somente a variável temporária que você mesmo definiu. Não publique o valor em logs.

### Caso C — comando no serviço da API dentro do Railway

- Configure DATABASE_URL do serviço API por referência ao banco do mesmo projeto/ambiente, usando a rede privada do Railway.
- localhost dentro do container da API aponta para o próprio container, não para o serviço PostgreSQL.
- Mantenha os segredos e flags existentes do seu ambiente.
- O Dockerfile atual já compila o backend e executa migrations ao iniciar. Atualizar o código usado no deploy é necessário para o novo diagnóstico chegar ao Railway.
- Use o terminal do serviço, quando disponível, para executar npm run db:check. Não precisa expor o banco publicamente para comunicação interna.

Referência oficial: https://docs.railway.com/databases/postgresql

## 6. Quando executar migrations de verdade

Esta etapa não exige uma migration nova. Porém, se o banco está com migrations antigas pendentes, o fluxo existente ainda precisa concluí-las para os recursos correspondentes funcionarem.

Primeiro confirme com db:check que a conexão é o banco/ambiente correto. Em um banco com dados, tenha backup/snapshot antes de aplicar migrations pendentes. Depois:

~~~powershell
npm run build
npm run db:check
npm run db:migrate:prod
npm run db:check
~~~

Pare a sequência se qualquer comando falhar. Não execute repetidamente sem ler a causa.

Se aparecer “Migration alterada após execução”, preserve o histórico. Restaure o arquivo exatamente como aplicado e crie uma migration nova quando uma correção de esquema for necessária. Não edite o checksum no banco nem apague schema_migrations para forçar passagem. Diferenças de finais de linha LF/CRLF também mudam o checksum; confirme os bytes dos arquivos e o pacote originalmente aplicado. Os SQL existentes não foram empacotados ou alterados nesta etapa.

Se aparecer “Arquivo ausente”, confira se o projeto local está numa versão anterior ao banco.

Se surgir erro SQL com o nome de uma migration, esse diagnóstico deve orientar a correção específica. Este pacote não presume que a conexão é o único problema possível do ambiente.

## 7. Publicar o backend atualizado

Depois dos testes locais, coloque os arquivos backend desta entrega no repositório/ramo que alimenta seu deploy e faça o deploy pelo fluxo que você já usa. Nenhuma publicação foi feita automaticamente nesta entrega.

No Railway, confirme build concluído, logs de inicialização e /health/ready. O endpoint deve retornar ready quando o serviço conseguir acessar seu banco. A aplicação de SQL pendente no startup depende do Dockerfile/comando de início atual; não adicione uma segunda execução paralela sem necessidade.

Não é necessário alterar configurações de Firebase, Cloudinary, Mercado Pago ou frete para aplicar esta etapa.

## 8. Resultado da validação e limites

- Flutter analyze: sem apontamentos (No issues found), após corrigir os 45 itens do log inicial.
- Flutter test: 21/21 aprovados; anteriormente havia 17 aprovados e três reprovados. Inclui um novo teste de favoritos.
- Backend: compilação TypeScript e 54/54 testes aprovados; inclui cinco testes de diagnóstico e histórico de migrations.
- db:check e db:migrate:prod: falha de conexão local reproduzida com credenciais fictícias e diagnóstico ECONNREFUSED legível, sem depender de banco real.
- Arquivos SQL/migrations existentes: preservados.

Foi reproduzida a falha de conexão local com credenciais fictícias; os comandos retornaram código 1 e diagnóstico legível. Nenhuma migration foi aplicada em banco real. Não validei esta entrega em aparelho físico nem realizei deploy.

## 9. Reverter esta etapa

Restaure do seu backup os arquivos listados como SUBSTITUIR e remova somente os listados como ADICIONAR, se desejar reverter o pacote. Depois recompile o backend e o app. Como esta entrega não muda SQL, não há reversão de esquema própria dela.

Se você tiver aplicado migrations que já estavam pendentes por outro motivo, elas são operações separadas e não são desfeitas pela reversão dos arquivos desta etapa.

## 10. Próximas entregas previstas

1. Etapa 01: estabilidade, testes e diagnóstico (este pacote).
2. Etapa 02: confiabilidade da compra — carrinho/favoritos por ID, total com cupom e confirmação dos pedidos.
3. Etapa 03: vitrine e produto — apresentação de roupas, filtros reais, marca consistente e ações de compra.
4. Etapa 04: checkout e experiência local — retirada, entrega na cidade e acompanhamento.
5. Etapa 05: operação do lojista — cadastro simplificado, mídia, estoque e pedidos.
6. Etapa 06: personalização repetível e roteiro de demonstração comercial.

A divisão pode ser ajustada às falhas e prioridades observadas nos testes. Os problemas de cupom/cobrança e itens além dos primeiros 50 identificados na análise continuam previstos para a Etapa 02. Esta primeira etapa fornece uma base verificável para tratá-los.
