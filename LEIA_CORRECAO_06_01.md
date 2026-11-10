# Correção 06.1 — conteúdo da tela inicial desaparece

Pré-requisito: Etapas 01–06 aplicadas. Esta é uma correção incremental da tela inicial.

## Causa confirmada

Quando o carregamento retornava uma lista de produtos vazia ou um erro de rede, a Home passava a usar `SliverFillRemaining(hasScrollBody: false)` com `EmptyState` como filho. Esse componente usa `LayoutBuilder` e uma área de rolagem própria. A combinação provocava uma medição intrínseca incompatível, gerando `LayoutBuilder does not support returning intrinsic dimensions` e falhas posteriores no layout da vitrine.

Isso explica o comportamento observado: a tela aparecia durante o carregamento, o conteúdo sumia após a resposta e a navegação inferior continuava visível. A falha foi reproduzida em teste com o código recebido e deixou de ocorrer após a correção. O teste no aparelho com outro renderizador apresentou a mesma falha antes da correção; o pacote preserva o renderizador Android padrão.

Os dois estados da Home agora usam `SliverToBoxAdapter`, que permite ao conteúdo ocupar sua altura natural e continuar na rolagem da página. A correção não cria produtos nem transforma erros em uma lista vazia: catálogo vazio e falha de conexão continuam com mensagens distintas, e o erro mantém o botão de tentar novamente.

## Aplicar

1. Extraia o conteúdo do ZIP na raiz `C:\Users\othon\Documents\store\loja_roupas`, a pasta que contém `pubspec.yaml`.
2. Substitua `lib/features/client/home/home_screen.dart`.
3. Adicione o teste e os documentos incluídos no pacote. Confira caminhos e hashes no manifesto.

Nenhum arquivo deve ser removido. Não há alteração de dependências, backend, banco, credenciais ou configuração do cliente. Não é necessário executar migration, seed ou provisionamento. Aplique a correção ao projeto e gere outro APK; instalar novamente o APK antigo mantém o defeito.

## Conferir o Flutter

```powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas'

flutter analyze
if ($LASTEXITCODE -ne 0) { throw 'Confira os apontamentos do analyze.' }

flutter test --concurrency=1 --dart-define=LOJA_BACKEND=railway
if ($LASTEXITCODE -ne 0) { throw 'Confira a falha dos testes.' }
```

Verificações desta entrega: 108 testes Flutter aprovados, incluindo 8 novos testes de regressão, e analyze sem apontamentos. Os novos testes cobrem Home vazia e com erro em 320, 390 e 1200 pixels, texto ampliado, recuperação após falha, carregamento da marca e restauração da sessão.

## Gerar o APK e atualizar o celular

Use o arquivo de configuração que você já preencheu. Preserve o application ID para atualizar a instalação atual.

```powershell
Set-Location 'C:\Users\othon\Documents\store\loja_roupas'
$ErrorActionPreference = 'Stop'

.\tools\build-client.ps1 -Config '.\config\minha-loja.local.json' -Build -Mode debug
```

Aguarde o helper terminar com `APK gerado:`. Se a compilação falhar, confira o erro antes de instalar. Depois:

```powershell
$configAtual = Get-Content -LiteralPath '.\config\minha-loja.local.json' -Raw -Encoding UTF8 | ConvertFrom-Json
$pastaApkAtual = Join-Path (Get-Location).Path ('.client-builds\{0}-{1}' -f $configAtual.store.slug, $configAtual.app.environment)
$apkAtual = Join-Path $pastaApkAtual ('{0}-{1}-debug.apk' -f $configAtual.store.slug, $configAtual.app.environment)

if (!(Test-Path -LiteralPath $apkAtual)) {
    throw 'O APK corrigido ainda nao foi gerado.'
}

$adbAtual = 'C:\Users\othon\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adbAtual -s ZF525F5Z4L install -r $apkAtual
if ($LASTEXITCODE -ne 0) { throw 'Confira a mensagem da instalacao.' }

& $adbAtual -s ZF525F5Z4L shell am force-stop $configAtual.app.applicationId
& $adbAtual -s ZF525F5Z4L shell am start -n "$($configAtual.app.applicationId)/com.loja.roupas.loja_roupas.MainActivity"
```

O comando `install -r` atualiza a instalação compatível sem limpar seus dados. Não é necessário desinstalar ou limpar o armazenamento do aplicativo para corrigir este problema.

## Conferência no aparelho

O APK debug corrigido foi compilado e instalado como atualização no celular conectado durante esta sessão, preservando os dados da instalação. A Home vazia permaneceu visível após o carregamento, a troca de abas e uma segunda abertura, usando o renderizador Android padrão. Os estados de erro e recuperação foram verificados nos testes automatizados. Seu projeto original ainda precisa receber os arquivos deste ZIP para que os próximos builds incluam a correção.

Abra o app e aguarde o carregamento. Sem produtos publicados, deve aparecer “Estamos preparando a vitrine”, com o cabeçalho e a navegação disponíveis. Role a página para ver a mensagem completa. Se a consulta falhar, deve aparecer “Não foi possível carregar a vitrine” com “Tentar novamente”. Com produtos disponíveis, as coleções continuam sendo exibidas.

Esta correção é visual/funcional da Home e não muda o modo `LIVE/DEMO`, permissões, pagamentos ou o estado dos pedidos. A criação de uma demonstração com compras simuladas continua exigindo uma loja marcada como `DEMO`.
