# Frequência40 — Hotfix dos testes Flutter (após Fase 5.9)

## Origem
O log enviado em 21/11/2026 reportou 1 aviso em `flutter analyze`, 1 teste de integração com toque fora da tela, e 9 testes do checkout falhando com `[core/no-app]` do Firebase.

## Conteúdo e justificativa
1. `lib/features/admin/integrations/railway_integrations_screen.dart`: coloca chaves no `if (ctx.mounted)` — elimina o único aviso `curly_braces_in_flow_control_structures`. Não altera comportamento.
2. `test/phase58_integrations_screen_test.dart`: rola a `ListView` e aguarda a conclusão do movimento antes de tocar no botão `Reprocessar`.
3. `test/stage04_checkout_test.dart`: injeta `authProvider` simulado para o teste não instanciar `FirebaseAuth.instance` quando o backend de teste estiver em modo padrão Firebase. Não altera autenticação da aplicação.

## Instalação
Faça backup ou commit de segurança. Extraia o ZIP na RAIZ de `loja_roupas`, substituindo SOMENTE os três arquivos listados. Mantenha a estrutura de pastas.

No PowerShell, a partir da raiz `loja_roupas`:

```powershell
flutter pub get
flutter analyze
flutter test test/phase58_integrations_screen_test.dart
flutter test test/stage04_checkout_test.dart
flutter test
```

## Esperado
- `flutter analyze`: sem o aviso informado no log.
- O teste da Central de Integrações consegue tocar o botão no viewport de 800×600.
- Os testes de checkout não dependem de inicialização real do Firebase.

## Limites
Não foi possível executar Flutter neste ambiente, pois o SDK Flutter não está instalado. As mudanças foram inspecionadas em comparação aos arquivos de origem do projeto local da Fase 5.9, mas devem ser verificadas com os comandos acima. Falhas funcionais adicionais, se houver, podem ficar visíveis após resolver o problema inicial de Firebase.

Não há alterações no backend, Railway, variáveis de ambiente, migrations, pagamentos ou lógica de negócio.
