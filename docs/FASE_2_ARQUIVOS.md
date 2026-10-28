# Inventário — Fase 2

## Novos
- `backend/migrations/002_catalog.sql`
- `backend/src/routes/catalog.ts`
- `backend/src/scripts/firebase_catalog_import.ts`
- `lib/core/network/loja_api.dart`
- `lib/data/repositories/railway_catalog_repository.dart`
- `lib/features/admin/remote_admin_home.dart`
- `docs/FASE_2_MIGRACAO_CATALOGO_RAILWAY.md`
- `docs/FASE_2_ARQUIVOS.md`

## Substituir
- `backend/package.json`
- `backend/src/app.ts`
- `pubspec.yaml`
- `lib/data/repositories/product_repository.dart`
- `lib/data/repositories/category_repository.dart`
- `lib/providers/auth_providers.dart`
- `lib/providers/product_providers.dart`
- `lib/features/admin/login/admin_login_screen.dart`
- `lib/router/app_router.dart`

## Remover
Nenhum nesta etapa. **Não remova** o Firebase, o `main.dart`, os repositórios de pedidos ou os outros módulos ainda; parte do fluxo depende deles em modo legado. Não adicione credenciais ao repositório.
