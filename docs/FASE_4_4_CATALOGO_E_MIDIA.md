# Fase 4.4 — Catálogo profissional e upload autenticado (Railway)

## Base

Aplicar **depois da Fase 4.3** (e das correções anteriores). Este ZIP contém arquivos **completos** na árvore `loja_roupas/`. Faça um commit/backup antes de substituir.

Esta fase NÃO remove o Firebase, NÃO libera frete nem marketplace com múltiplos recebedores e NÃO substitui o inventário transacional. **Não exige migration**: usa tabelas existentes da Fase 1/2 e auditoria da Fase 4.

## Adicionar

- `backend/src/routes/catalog_management.ts`
- `backend/src/services/catalog_management.ts`
- `backend/src/tests/catalog_management.test.ts`
- `lib/data/repositories/railway_catalog_admin_repository.dart`
- `lib/features/admin/products/railway_catalog_management_screen.dart`
- `docs/FASE_4_4_CATALOGO_E_MIDIA.md`

## Substituir

- `backend/src/config.ts`
- `backend/src/app.ts`
- `backend/src/routes/catalog.ts`
- `lib/data/repositories/railway_catalog_repository.dart`
- `lib/router/app_router.dart`

## Remover

Nada nesta fase. `lib/features/admin/products/admin_products_screen.dart` e `lib/data/services/media_upload_service.dart` continuam disponíveis **somente no fluxo Firebase legado**, não use upload unsigned do legado na loja Railway.

## O que muda

- `/admin/products` usa uma tela própria para Railway e preserva o painel Firebase no modo antigo.
- Nova rota admin `GET .../catalog/manage/products` inclui rascunhos, ocultos, estoque real/reservado, SKU e visibilidade. A vitrine passa a ler sempre o catálogo **público**; não mostra rascunhos quando o administrador está logado.
- Criação do produto com **SKU único** por loja, cor/tamanho, primeira entrada de estoque auditada, descrição, preço em centavos, imagem/capa e categoria existente.
- Edição de produto altera **somente metadados e preço**, sem modificar unidades físicas/reservadas.
- Novas variantes possuem SKU e estoque inicial registrados. Para outras entradas/saídas depois disso, use `Inventário e movimentações`.
- Variantes reservadas não podem ser desativadas, e SKUs repetidos são recusados.
- `DRAFT`/`PUBLISHED`/`HIDDEN`; publicação exige imagem. Arquivar mantém pedidos históricos.
- Galeria: inclusão por link ou upload de foto, primeira imagem é capa, é possível remover e reordenar fotos no cadastro.
- Upload autenticado: API Railway assina os parâmetros de upload Cloudinary por tempo limitado e vincula a pasta à loja; o celular/Windows nunca recebe API_SECRET.
- Vídeos nesta fase são **links HTTPS**, não upload binário; adicionar validação de formatos, moderação, limites e cotas mais adiante.

## Configurar mídia no Railway

No painel do **Cloudinary** (conta do e-commerce), encontre *Cloud name*, *API Key* e *API Secret* nas credenciais da sua conta. NÃO use o preset público antigo `loja_roupas` no modo Railway.

Em Railway > serviço `store-app` > **Variables**, adicione:

```env
CLOUDINARY_CLOUD_NAME=SEU_CLOUD_NAME
CLOUDINARY_API_KEY=SUA_API_KEY
CLOUDINARY_API_SECRET=SEU_API_SECRET_PRIVADO
```

Faça novo deploy para carregar as variáveis. **Nunca** coloque `CLOUDINARY_API_SECRET` em `lib/`, `--dart-define`, GitHub ou screenshots. Restrinja a conta Cloudinary: configure política de formatos JPG/PNG/WebP, tamanho de arquivo e monitore consumo/quotas. A verificação de extensão e 8 MB no Flutter é **uma barreira de UX**, não um limite antifraude no servidor de mídia. Para produção em escala, considere presets assinados com restrições e proteção de cota por estabelecimento.

**Sem Cloudinary configurado:** cadastrar produtos, preço e variantes continua possível, mas o botão **Enviar foto** retornará `Upload não configurado`; por enquanto, o administrador pode informar uma URL HTTPS.

Não use volumes Railway para armazenar fotos acessíveis por clientes: PostgreSQL armazena os **links**, Cloudinary entrega as imagens com distribuição apropriada. A utilização de Railway Bucket/S3 poderá substituir Cloudinary em fase futura, se preferir.

## Aplicar no Windows / VS Code

Extraia o ZIP acima da pasta `loja_roupas` e substitua os arquivos. Na raiz do projeto:

```powershell
cd backend
npm ci
npm run build
# no Windows: configure DATABASE_URL e JWT_SECRET de teste no backend/.env
npm test
cd ..
flutter pub get
flutter analyze
flutter test
```

OBS: testes do backend carregam validação das variáveis `DATABASE_URL` e `JWT_SECRET`, mesmo sem acessar o banco. Use valores de **homologação/teste** e não cole URLs ou segredos de produção em arquivos versionados. Os testes unitários não acessam PostgreSQL.

Depois de passar a validação:

```powershell
git add backend lib docs
git commit -m "feat: fase 4.4 catalogo e upload assinado"
git push origin master
```

Railway: não há migration `007` nesta fase. Confirme `Active` e `/health/ready`. Se houver falha, consulte Deploy Logs. As novas rotas começam em `/v1/stores/:storeId/catalog/manage` e requerem Bearer token; acesso GET aceita equipe, alterações apenas OWNER ou MANAGER.

Windows (substitua slug pela loja **existente** no PostgreSQL):

```powershell
flutter run -d windows `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

## Roteiro de validação com dois dispositivos

1. Entre com OWNER e abra **Administração > Produtos e categorias**.
2. Cadastre uma categoria real caso não exista.
3. Cadastre uma camiseta como **rascunho**, com SKU único, cor/tamanho e 3 unidades iniciais. Confirme que não aparece na vitrine cliente.
4. Envie foto pelo botão (após configurar Cloudinary); ou cadastre um link HTTPS. Salve o produto como **Publicado**.
5. Abra a vitrine num segundo dispositivo: a camiseta aparece com capa/preço via evento de catálogo.
6. Edite o preço/descrição e confirme atualização do segundo dispositivo.
7. Verifique que as 3 unidades continuam intactas no inventário.
8. Adicione variante de outro tamanho e confirme o SKU/entrada de estoque no inventário.
9. Tente repetir o mesmo SKU; a API deve recusar. Tente desativar variante reservada por pedido de teste; a API deve recusar.
10. Oculte o produto e verifique que some da vitrine; posteriormente publique novamente.
11. Arquive um produto de teste sem apagar registros antigos de pedidos.
12. Entre com STAFF: catálogo visível para consulta; botões de edição ocultos e backend deve negar PATCH/POST.
13. Repita no Android quando disponível. Verifique reconexão e refresh.

## Limitações explícitas

- O Flutter **não foi compilado** neste ambiente de geração; `flutter analyze`, `flutter test` e `flutter run -d windows` precisam passar no seu SDK.
- O backend foi compilado e os 23 testes unitários passaram com variáveis fictícias; **não há integração testada** com o PostgreSQL Railway, API Cloudinary ou múltiplos dispositivos.
- Busca no painel é local sobre os 500 produtos mais recentes: paginação, busca indexada e virtualização virão antes do grande volume comercial.
- Alterações concorrentes de metadados ainda usam último a salvar (sem versionamento otimista). Esse controle será necessário mais adiante.
- Remover URL da galeria **não apaga automaticamente o arquivo do Cloudinary**. Gestão de arquivos órfãos, compressão server-side, moderação e quotas serão necessidades de comercialização.
- Preços são aplicados a todas as variantes ativas neste editor. Preços diferentes por SKU são evolução futura.
- O PUT legado de produtos bloqueia ajustes de estoque de variantes existentes e impede criação/remoção de SKU durante edição; use a nova interface.
- Não há liberação de pagamento para todas as lojas, frete real, devolução/reembolso automático ou isolamento comercial integral validado em produção.
