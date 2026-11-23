# Frequência40 Store App — Hotfix Flutter da Fase 5.22

## Diagnóstico

Nos testes Flutter da Fase 5.22, o teste `proprietário registra intenção de pagamento sem credencial e sem ativar gateway` falhava porque o botão `Salvar planejamento` aparecia na árvore de widgets, mas estava fora da área visível no ambiente de testes (800 × 600). O `scrollUntilVisible()` detectava o widget antecipadamente, não movia o `ListView` e `tap()` não acertava o botão. Por isso `repo.saves` permanecia em zero.

## Correção

Substituímos somente `scrollUntilVisible` por `ensureVisible` nesse cenário, seguido por `pumpAndSettle`, com verificações de que o botão existe e está habilitado após a escolha do provedor. O teste continua exigindo que uma ação de toque real ocorra; **não** silenciamos o aviso com `warnIfMissed: false`.

## Arquivos a substituir

- `test/phase522_commercial_rollout_screen_test.dart`

Nenhum arquivo de produção é alterado. Sem migrations, mudanças em Railway, checkout, pagamentos, roteamento ou backend.

## Aplicação

1. Faça um commit de segurança.
2. Extraia o ZIP na raiz de `loja_roupas`, preservando as pastas e substituindo apenas o arquivo de teste.
3. A partir da raiz `loja_roupas`, execute:

```powershell
flutter analyze
flutter test test/phase522_commercial_rollout_screen_test.dart
flutter test --concurrency=1 --dart-define=LOJA_BACKEND=railway
```

## Validação

A alteração foi revisada estaticamente usando o arquivo exato incluído na Fase 5.22. O SDK Flutter não está instalado no ambiente desta edição; os comandos devem ser executados no seu Windows antes do commit de aprovação.

Se houver outro erro, envie o trecho inicial da falha e as linhas `Expected` / `Actual` — a contagem de testes não substitui a análise de cada ocorrência.
