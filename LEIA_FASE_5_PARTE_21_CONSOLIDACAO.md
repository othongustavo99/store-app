# Frequência40 / Store App — Fase 5.21: consolidação técnica

**Base:** `loja_roupas(20261122-235502).zip`, recebido em 22/11/2026.

## Objetivo

Reforçar a montagem dos aplicativos white-label e reproduzir verificações sem
precisar de cliente real, fornecedor ERP/PDV, credenciais ou deploy. **Esta fase
não é homologação de ERP/PDV, nem implantação comercial concluída.**

## O que foi alterado

1. `lib/core/network/loja_api.dart`: em release, `LOJA_BACKEND` não assume
   Firebase implicitamente. É obrigatório indicar `railway` ou `firebase`.
   Em debug, permanece a escolha antiga para preservar o desenvolvimento legado.
2. `lib/main.dart`: valida o backend **antes** de iniciar Firebase ou carregar
   dados de loja. Se o APK não foi configurado corretamente, exibe uma mensagem
   neutra e não inicializa nenhum backend.
3. `tools/check-client-build.mjs`: pré-validação **offline** de
   `flutter.defines.json` + `android.plan.json`. Rejeita credenciais no arquivo de
   defines, URL incorreta, UUID/slugs divergentes, planos Android não condizentes,
   ambiente incompatível e produção em debug. Nunca imprime valores recebidos.
4. `tools/build-client.ps1`: roda a pré-validação antes de compilar o APK.
5. `tools/build_loja.ps1`: caminho legado sem UUID de loja exige agora
   `-PermitLegacyDemoBuild`, somente para uma demonstração consciente.
   Para entregas comerciais, use **apenas** o helper atual `build-client.ps1`.
6. `.github/workflows/storeapp-quality.yml`: tarefas separadas para backend,
   conectores, pré-validação white-label e Flutter. Não faz deploy nem executa
   testes contra banco de dados/ERP reais.
7. `.gitignore`: protege novos arquivos locais de credenciais e estados dos workers.
   **Atenção:** `.gitignore` não desversiona arquivos já enviados ao Git.
8. `test/phase521_backend_selection_test.dart` e
   `tools/test/check-client-build.test.mjs`: testes de regressão.

## Instalar no Windows

1. Faça commit e backup da pasta antes de aplicar.
2. Extraia o ZIP na **raiz `loja_roupas`**, preservando as pastas. Substitua
   apenas os arquivos que o manifesto marca como `replace`.
3. Nenhuma migration e nenhuma variável nova na Railway. Não envie `.env` no Git.

Na raiz `loja_roupas`:

```powershell
node --test tools/test/check-client-build.test.mjs
flutter pub get
flutter analyze
flutter test test/phase521_backend_selection_test.dart
flutter test --concurrency=1 --dart-define=LOJA_BACKEND=railway
```

No backend (para testes **offline**, sem credenciais reais):

```powershell
cd backend
npm ci
npm run build
$env:DATABASE_URL='postgresql://fake:fake@127.0.0.1:5432/offline_ci'
$env:JWT_SECRET='test_secret_secure_long_0123456789_0123456789'
npm test
node --test connectors/*/test/*.test.mjs
Remove-Item Env:\DATABASE_URL
Remove-Item Env:\JWT_SECRET
cd ..
```

`node --test connectors/*/test/*.test.mjs` funciona em shell Bash; no PowerShell,
use, na raiz de `loja_roupas`:

```powershell
Get-ChildItem backend\connectors -Recurse -Filter *.test.mjs | ForEach-Object {
    node --test $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Falhou teste em $($_.FullName)" }
}
```

> O comando acima usa apenas valores fictícios. Não substitui as variáveis
> reais configuradas na Railway e **não deve ser executado em um shell onde as
> variáveis de produção estejam presentes**. Prefira um terminal local novo.

## Criar/verificar um build de loja

O arquivo `config/loja.example.json` contém um exemplo de preenchimento. Para
um cliente, use a configuração resolvida com **UUID da loja** após o
provisionamento, conforme `LEIA_ETAPA_06.md`. Você pode somente preparar o
plano, sem compilar:

```powershell
cd backend
npm run build
cd ..
.\tools\build-client.ps1 -Config .\config\sua-loja.local.json -Mode debug
```

O comando gera o plano em `.client-builds/` (ignorado pelo Git). Verifica
`LOJA_BACKEND=railway`, HTTPS, slug/UUID, modalidade e assinatura exigida.
Para compilar um build de homologação:

```powershell
.\tools\build-client.ps1 -Config .\config\sua-loja.local.json -Mode release -Build
```

**Não use esse último comando com uma configuração ainda não revisada.** O
Android exige `android/key.properties` com chave própria para ambiente de
produção; builds de homologação/demonstração podem usar assinaturas diferentes.
Um teste de pré-validação **não assegura** que a assinatura é confiável, nem
verifica se a loja existe no banco ou se o ERP está disponível.

Para confirmar manualmente um plano existente:

```powershell
node tools\check-client-build.mjs `
  --defines=.client-builds\minha-loja-homologacao\flutter.defines.json `
  --plan=.client-builds\minha-loja-homologacao\android.plan.json `
  --mode=release
```

## GitHub Actions

Ao fazer commit e push (branches `master` ou `main`) ou abrir PR, o workflow
executa os testes. O GitHub precisa de acesso para baixar dependências.
**Os testes Flutter do workflow não foram executados neste ambiente**, porque
não há SDK Flutter instalado; confira o resultado na página de Actions do
repositório antes de considerar um build aprovado.

O workflow utiliza valores **fictícios** de `DATABASE_URL` e `JWT_SECRET` apenas
nos testes, sem conectar ao PostgreSQL nem expor credenciais do usuário.

## Verificações executadas neste ambiente

- `npm run build` — aprovado.
- `npm test` com variáveis offline fictícias — **217/217** aprovados.
- `node --test backend/connectors/*/test/*.test.mjs` — **396/396** aprovados.
- `node --test tools/test/check-client-build.test.mjs` — **23/23** aprovados.
- Teste do pré-validador com JSON **gerado pela função real `clientArtifacts`**
  em modo produção — aprovado.
- Flutter e PowerShell não disponíveis nesta execução; verificação real pendente.

## Fora do escopo e próximas prioridades

- Sem deploy Railway, sem migrations, sem mudar pagamento/checkout/frete.
- Sem criar ERP/PDV próprio, sem integrar cliente real agora.
- **Fase 5.22 (proposta):** parametrização segura de pagamentos/frete por loja,
  remoção progressiva do bloqueio de loja piloto com isolamento explícito.
  Não habilitar pagamentos reais sem testes de operação e autorização.
- **Fase 5.23 (proposta):** separar contratos e módulos genéricos de integração
  para reuso em Clube de Descontos, IA das lojas e outros aplicativos da empresa.

## Segurança de arquivos

A pasta do usuário tinha `.env`, `.git/`, `node_modules` e artefatos de builds.
**O patch desta fase não inclui nenhum deles.** Em novos ZIPs, envie somente
fontes e arquivos necessários; não inclua senhas, chaves, certificados,
credenciais do ERP, arquivos de estado com dados de clientes ou APKs privados.
