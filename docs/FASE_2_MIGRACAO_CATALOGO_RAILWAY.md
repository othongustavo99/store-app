# Fase 2 — Catálogo Railway, login API e sincronização em tempo real

## O que esta entrega faz e o que **não faz**

- Catálogo e categorias pelo PostgreSQL; leitura pública dos produtos publicados.
- Ações de catálogo autenticadas e autorizadas por loja (proprietário/gerente).
- Eventos de atualização via PostgreSQL LISTEN/NOTIFY e Server-Sent Events (SSE); reconecta e relê dados.
- Login, cadastro por email/senha e renovação de sessões na API (segredo de renovação salvo no armazenamento seguro do dispositivo).
- Importador controlado e opt-in de **categorias/produtos/variantes** do Firestore, com prévia e transação no PostgreSQL.
- Modo Firebase original mantido como rollback de teste, usando a flag de build, sem migração dupla de escrita.

**Ainda não disponível no modo Railway:** compra, confirmação de pagamento, frete, pedidos, chat, Google Sign-In, restauração/migração das contas antigas Firebase. Essas áreas ficam bloqueadas até a Fase 3 ou fases seguintes para evitar gravar um pedido no Firebase com estoque no PostgreSQL. **Não publique esta versão como loja pronta para venda.**

## 1. Aplicar o ZIP

1. Faça backup do projeto e do Firestore antes de qualquer importação. Faça snapshot/backup do PostgreSQL Railway.
2. Extraia o ZIP na pasta pai do repositório; copie **o conteúdo da pasta `loja_roupas/`** para a raiz atual do repositório `store-app` e substitua os arquivos homônimos.
3. Na raiz do repositório, execute:

```powershell
cd backend
npm install
npm run build
npm test
cd ..
flutter pub get
flutter analyze
flutter test
```

Se `npm run build` falhar, **não envie o deploy**: compartilhe o erro do terminal. Dependências e SDK Flutter não puderam ser compilados neste ambiente de entrega.

4. Atualize também os lockfiles gerados (`backend/package-lock.json`, `pubspec.lock`) e comite os arquivos. **Não** comite `.env`, JSON de conta de serviço Firebase nem credenciais.

```powershell
git add backend lib pubspec.yaml pubspec.lock docs backend/package-lock.json
git commit -m "feat: catalogo PostgreSQL, SSE e migracao Firebase"
git push origin master
```

O Railway, já conectado à branch `master` com **Root Directory `/backend`** e Dockerfile `/backend/Dockerfile`, deve reconstruir a API e executar a migration `002_catalog.sql` no próximo deploy. Observe os logs `Aplicada: 002_catalog.sql` e `/health/ready`.

## 2. Criar domínio público da API

No Railway: serviço `store-app` → **Settings → Networking → Public Networking → Generate Domain**.

Exemplo fictício: `https://store-app-production.up.railway.app`. Use a URL **real** emitida pelo Railway; `postgres.railway.internal` é privado e não serve para o app no celular.

Abra:
- `https://SEU_DOMINIO/health/live` → `{"status":"ok"}`.
- `https://SEU_DOMINIO/health/ready` → `{"status":"ready"}`.

Se já existir um domínio, mantenha-o.

## 3. Criar a primeira loja e vincular seu usuário

O backend da Fase 1 mantém `ALLOW_STORE_SELF_SERVICE=false` por segurança. Para **provisionar a primeira loja em homologação**:

1. Railway → `store-app` → Variables: altere **temporariamente** `ALLOW_STORE_SELF_SERVICE=true`; faça deploy.
2. No PowerShell, escolha seu domínio, email e nome. O exemplo abaixo solicita a senha sem exibi-la:

```powershell
$base = 'https://SEU_DOMINIO_REAL'
$email = Read-Host 'Email de proprietário'
$secret = Read-Host 'Nova senha (minimo 12 caracteres)' -AsSecureString
$cred = New-Object System.Management.Automation.PSCredential('x', $secret)
$senha = $cred.GetNetworkCredential().Password
$dados = @{ name='Administrador da loja'; email=$email; password=$senha } | ConvertTo-Json
$registro = Invoke-RestMethod -Method Post -Uri "$base/v1/auth/register" -ContentType 'application/json' -Body $dados
$headers = @{ Authorization = "Bearer $($registro.accessToken)" }
$loja = @{ name='Loja Piloto'; slug='loja-piloto' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/v1/stores" -Headers $headers -ContentType 'application/json' -Body $loja
Remove-Variable senha,dados,secret -ErrorAction SilentlyContinue
```

Se a conta de proprietário já tiver sido cadastrada: faça `/v1/auth/login` no lugar de `/register` com o mesmo JSON (sem `name`). Não tente criar duas vezes a mesma loja/slug.

3. **Imediatamente depois**, Railway → Variables → `ALLOW_STORE_SELF_SERVICE=false` e redeploy. Nunca deixe o cadastro público de lojas aberto como rotina de produção.
4. Acesse `https://SEU_DOMINIO/v1/shops/loja-piloto` para obter `id`, `name` e `slug`.
5. As credenciais do usuário acima são da **API nova**, não são automaticamente iguais às do Firebase.

## 4. Importar o catálogo existente do Firestore (opcional)

Se quiser manter as categorias e produtos já cadastrados no Firebase, use o importador incluído. **Ele não migra usuários, senhas, pedidos, pagamentos ou conversas.**

Pré-requisitos:
- Loja de destino **sem categorias e sem produtos**.
- Credencial Firebase Admin JSON baixada para uma pasta local protegida, nunca dentro do projeto ou ZIP.
- Backup do Firestore e do banco Railway.
- Acesso PostgreSQL local: use um banco de homologação local OU habilite temporariamente TCP Proxy no banco Railway em `Postgres → Settings → Networking → Public Access` e utilize `DATABASE_PUBLIC_URL` no `.env` **local**. Não copie a URL de banco para Flutter. Desative Public Access depois.
- O usuário/conta de serviço Firebase precisa ter permissão de leitura para as coleções `categories` e `products`.

Na pasta `backend` e no PowerShell, configure:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS='C:\CAMINHO_PRIVADO\firebase-service-account.json'
$env:MIGRATE_STORE_SLUG='loja-piloto'
$env:MIGRATE_DRY_RUN='true'
npm run catalog:import
```

O script só imprime quantidades nesta primeira execução. Verifique categorias, imagens e variantes. Para executar a gravação **apenas depois de validar a prévia**:

```powershell
$env:MIGRATE_DRY_RUN='false'
$env:ALLOW_CATALOG_IMPORT='YES'
npm run catalog:import
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS
Remove-Item Env:ALLOW_CATALOG_IMPORT
```

Todas as inserções são transacionais; se houver erro, ocorre `ROLLBACK`. O script recusa catálogos de destino não vazios. Os IDs do Firestore são armazenados em `legacy_firebase_id`, enquanto os IDs visíveis na API são UUIDs novos. A migração é **de uso único**; não sincroniza edições feitas depois no Firebase. Faça o corte sem edições simultâneas, ou repita o processo em uma loja de homologação vazia.

**Mídias:** referências HTTPS existentes são copiadas (não fazem upload). URLs de Firebase Storage ou links temporários devem ser auditados e migrados para armazenamento permanente antes da venda comercial. No momento, o upload de imagens novo ainda utiliza o Cloudinary configurado no projeto.

## 5. Executar o app conectado ao Railway

Em um dispositivo Android conectado via Flutter (exemplo com a loja `loja-piloto`):

```powershell
flutter run -d SEU_DISPOSITIVO_ANDROID `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://SEU_DOMINIO_REAL `
  --dart-define=LOJA_STORE_SLUG=loja-piloto
```

Use HTTPS. **Não** coloque `DATABASE_URL`, `JWT_SECRET` ou credenciais Firebase Admin no `--dart-define`: elas pertencem ao servidor.

Entre com o email/senha da API, usado para criar a loja. O servidor identificará seu papel com `/v1/stores/mine` e permitirá `/admin/products` se você for OWNER/MANAGER/STAFF (alterações exigem OWNER/MANAGER). Novas contas de clientes podem usar o cadastro da API. Login com Google está temporariamente desativado nesse modo.

Para voltar ao comportamento antigo para testes, omita as flags `LOJA_BACKEND=railway` / `LOJA_API_BASE_URL` / `LOJA_STORE_SLUG`; o padrão é Firebase. **Não use os dois modos para realizar vendas em paralelo.**

## 6. Teste de sincronização em dois dispositivos

1. Conecte dois dispositivos à mesma loja e API. Abra `/` com produtos visíveis nos dois.
2. No dispositivo administrador, abra `/admin/products`, cadastre uma categoria e um produto com variante e foto HTTPS.
3. Sem recarregar manualmente, verifique que o segundo dispositivo mostra o produto: gatilho PG → LISTEN/NOTIFY → SSE → nova consulta.
4. Altere o preço e o estoque; confirme atualização. Depois arquive; o cliente não deve mais vê-lo.
5. Desative a rede no segundo dispositivo, edite o produto no primeiro, reative a rede: a reconexão deve carregar o estado atualizado.
6. Tente alterar o catálogo com um usuário cliente (sem membership): a API deve responder 404/403; não basta esconder o botão Flutter.
7. Confira que `/checkout`, `/orders`, `/chat` e `/admin/orders` exibem a tela "Em implantação", evitando operações misturadas com Firebase.

Endpoints principais:

- `GET /v1/shops/:slug/catalog/categories`
- `GET /v1/shops/:slug/catalog/products`
- `GET /v1/shops/:slug/catalog/events` (SSE)
- `GET /v1/stores/:storeId/catalog/products` (Bearer)
- `POST /v1/stores/:storeId/catalog/products` (Bearer + OWNER/MANAGER)
- `PUT /v1/stores/:storeId/catalog/products/:productId` (Bearer + OWNER/MANAGER)
- `DELETE /v1/stores/:storeId/catalog/products/:productId` (arquiva, não apaga do banco)

## Limitações para a próxima fase

- Pagamentos e pedidos **não foram transferidos**, nem o estoque reservado por compras. Na Fase 3 implementaremos transação de checkout, webhooks, pedidos por usuário e notificações de entrega.
- Não migramos senhas e identidades Firebase; é necessário um plano de migração de contas com login federado ou redefinição, **antes** de publicar para clientes existentes.
- O endpoint de catálogo retorna até **500 produtos**, sem paginação. Na fase de escalabilidade precisará filtros, paginação/cursor e consultas por produto id.
- O painel permite criação e ajuste de estoque; ainda faltam SKU legível, importação em lote pela interface e workflow de moderação.
- O modo Railway mantém dependências Firebase de recursos legados, mas elas não executam vendas quando Railway está ativo.
- A fonte de verdade é PostgreSQL depois do corte. Não editar o mesmo catálogo no Firebase e no Railway em paralelo.
- Revise o preset de upload Cloudinary, que ainda está no app, antes de abrir uma loja para terceiros.
- Em produção, verifique HTTPS, política de CORS se adicionar Flutter Web, rotatividade de JWT_SECRET, verificações de conta e backups.
