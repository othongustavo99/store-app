# Fase 4 — Correção de compilação Dart (Inventário)

## Problema

Em `lib/features/admin/inventory/railway_inventory_screen.dart`, o `separatorBuilder` declarou os dois parâmetros como `_`. Na versão do analisador Dart instalada, isso gera `The name '_' is already defined`.

## Correção

A assinatura agora é `separatorBuilder: (context, index) => const Divider(height: 1)`, preservando o restante da tela.

## Aplicação

Extraia o ZIP na pasta **acima** da pasta `loja_roupas`, sobrescrevendo o arquivo citado. Não remova nenhum arquivo.

Na raiz `loja_roupas`, execute:

```powershell
flutter analyze
flutter run -d windows --dart-define=LOJA_BACKEND=railway --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

Substitua `SEU-SLUG` pelo slug real da loja cadastrada no PostgreSQL.

Esta correção é só Flutter: não é necessário redeploy no Railway. Se `flutter analyze` indicar novos **errors** após o ajuste, compartilhe a saída completa.
