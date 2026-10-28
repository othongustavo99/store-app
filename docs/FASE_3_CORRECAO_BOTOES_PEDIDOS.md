# Fase 3 — Correção dos botões de pedidos (Flutter/Dart)

Esta correção mantém o backend da Fase 3, o Railway, o Firebase temporário e todas as demais telas inalterados.

## Arquivos para substituir

- `lib/features/client/orders/railway_orders_screen.dart`
- `lib/features/admin/orders/railway_admin_orders_screen.dart`

## Erro corrigido

O callback `onPressed:()=>void _refresh()` possui sintaxe inválida.
Foi substituído pelo callback Dart válido `onPressed:() { _refresh(); }`.
Essa sintaxe inválida também gerava mensagens em cascata sobre a ausência do parâmetro obrigatório `icon`.

## Como aplicar

1. Faça backup do projeto ou um commit de segurança.
2. Extraia a pasta `loja_roupas/` deste ZIP sobre a raiz do seu projeto e substitua **somente os dois arquivos** indicados.
3. Na raiz do projeto, execute:

```powershell
flutter pub get
flutter analyze
flutter run -d windows
```

4. Caso o analisador ainda reporte **errors** (em vez de warnings/info), copie as linhas completas da saída `flutter analyze` para diagnóstico de problemas não incluídos nesta correção.
5. Para publicar os arquivos no GitHub (se validado):

```powershell
git add lib/features/client/orders/railway_orders_screen.dart lib/features/admin/orders/railway_admin_orders_screen.dart
git commit -m "fix: corrigir callbacks de atualização de pedidos"
git push origin master
```

## Exclusões e configuração externa

- Nenhum arquivo deve ser excluído.
- Nenhuma variável de ambiente do Railway precisa ser alterada.
- Nenhuma migration precisa ser executada.

## Validação

O conteúdo foi conferido estaticamente, mas **não foi executado** com Flutter neste ambiente.
