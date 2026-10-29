# P0 — Loja de Roupas: demo segura, vitrine pública, carrinho persistente e catálogo de teste

**Base:** `loja_roupas(8).zip` enviado em 29/10/2026. Este pacote contém **arquivos inteiros** com seus diretórios, não um projeto novo nem apenas um patch de trechos. O projeto principal que evolui na outra conversa permanece independente.

## O que mudou

1. Checkout demonstração exclusivo de **lojas `stores.is_demo=true`**. Disponível no APK release sem Mercado Pago, aceita seleção fictícia de Pix/cartão e confirma pedidos `PAID` com pagamento `provider='demo'`, sem gerar cobrança. Tudo validado no backend; o checkout de produção segue intocado e bloqueado enquanto o Mercado Pago estiver desligado. A baixa de estoque ocorre apenas no catálogo da loja demo. O P0 suporta **retirada** no checkout simulado; entrega e cobrança de frete continuam desabilitadas.
2. Navegação pública para `/`, `/categories`, `/category/:id`, `/product/:id`, `/search`, `/discounted`, `/cart`; autenticadas: `/checkout`, `/orders`, `/account`, `/chat`, `/support`, `/invite` e `/admin`. O destino original é preservado via `from`. Permissões de admin continuam sendo verificadas na API.
3. Carrinho guardado em `shared_preferences`, **separado por backend e slug**. Só grava ID, cor, tamanho e quantidade. A cada abertura carrega o catálogo, remove variantes inexistentes e limita a quantidade ao estoque atualizado. Requer conexão para restaurar e atualizar preço/estoque; se a consulta falhar, o cache é preservado e tentará restaurar no próximo início. Não é carrinho sincronizado entre dispositivos.
4. Script de povoamento isolado: **32 produtos**, **5 categorias**, **6 pedidos fictícios** em uma loja demo com placeholders de imagem. Não importa nem modifica catálogos ou pedidos comerciais existentes.
5. Faixa “MODO DEMONSTRAÇÃO” na área do cliente, aviso no checkout, pedidos e painel. Os valores do painel são explicitamente classificados como fictícios.
6. **Login de cliente demo com um toque** opcional: só funciona quando a loja é demo e `ENABLE_PUBLIC_DEMO_LOGIN=true`. Gera sessão de cliente nova, sem dar acesso a equipe. O **acesso do lojista continua com e-mail e senha**, intencionalmente: login administrativo público com um clique não é seguro.

## 1. Aplicar os arquivos no Windows

1. Faça uma cópia da pasta atual (`loja_roupas`) ou crie um commit antes das alterações.
2. Abra o ZIP P0 e **copie o conteúdo de dentro dele** para a raiz do projeto (pasta com `pubspec.yaml`), aceitando substituir os arquivos com nomes iguais. Não substitua a raiz inteira nem apague seus arquivos originais.
3. Não altere migrations `001` a `012`. A nova `backend/migrations/013_demo_mode.sql` **deve permanecer com esse nome**. Não há arquivos para apagar.
4. No PowerShell, na raiz do projeto:

```powershell
flutter pub get
flutter analyze
flutter test
```

5. Atualize e implante o backend **antes** de instalar o novo APK: o aplicativo agora consulta `is_demo` e `demoLoginEnabled`, que dependem da nova migration e das rotas P0.

## 2. Railway: backend e banco

Configure/garanta no serviço da API:

```text
ENABLE_REAL_PAYMENTS=false
ENABLE_REFUNDS=false
ENABLE_PUBLIC_DEMO_LOGIN=true
```

> Ative a terceira apenas no ambiente em que deseja mostrar uma **loja demo pública**. Ela, sozinha, **não** habilita guest login em lojas reais: a API exige `stores.is_demo=true` também. Não coloque `JWT_SECRET`, `DATABASE_URL` ou tokens em `--dart-define`/APK. Mantenha demais variáveis existentes da API.

A imagem Docker do `backend/Dockerfile` executa `node dist/db/migrate.js` antes de iniciar o servidor. Ao publicar o backend atualizado, o Railway deverá aplicar automaticamente a migration `013_demo_mode.sql`. Confira os logs de deploy (mensagem `Aplicada: 013_demo_mode.sql`) e `/health/ready` com status `ready`. Faça backup do PostgreSQL antes das migrations.

**Se sua implantação não usa esse Dockerfile / CMD padrão**, execute migrations manualmente na sua configuração antes do novo Flutter:

```powershell
cd backend
npm ci
npm run build
npm run db:migrate
```

O comando de migração deve usar a mesma `DATABASE_URL` do serviço correto, nunca um banco aleatório.

## 3. Criar/popular uma loja demo (somente uma vez)

**Recomendado:** criar um slug separado, por exemplo `vitrine-demo-f40`. Nunca usar o slug/DB de uma loja que tenha vendas reais.

Para vincular o painel administrativo, primeiro registre normalmente no aplicativo uma conta com e-mail e senha. Ela deve existir na tabela `users`. Depois execute o seed com o e-mail **dessa** conta:

```powershell
cd backend
npm ci
npm run demo:seed -- --slug=vitrine-demo-f40 --enable-demo --owner-email=SEU_EMAIL_CADASTRADO
```

O script usa `DATABASE_URL` no ambiente (ou `.env` local) e cria loja demo, perfil, categorias, produtos, variantes, seis pedidos demonstrativos e associação `OWNER` do e-mail indicado. A loja precisa estar vazia. Se o slug já tiver produtos/pedidos reais, a execução **falha sem alterá-los**. Ao repetir o seed numa loja já preenchida pela carga, não duplica a carga.

**Como executar com PostgreSQL do Railway:**

- Se o serviço disponibilizar terminal/SSH no próprio container Railway, após o deploy execute: `node dist/scripts/seed_demo.js --slug=vitrine-demo-f40 --enable-demo --owner-email=SEU_EMAIL_CADASTRADO`. O script JavaScript é compilado no Docker.
- Alternativamente, no seu computador execute `npm run demo:seed` com uma **conexão pública do PostgreSQL** (TCP Proxy habilitado), usando `DATABASE_URL` do banco público selecionado. Não use o hostname privado `.railway.internal` do computador, e não publique ou cole a URL com senha. Remova a variável temporária após rodar.

O seed não liga o Mercado Pago, não cria senha administrativa padrão e não expõe o banco no aplicativo. As fotos são placeholders tipográficos `placehold.co`; antes de uma demo de vendas mais refinada, substitua por fotos próprias/licenciadas pelo painel.

## 4. Compilar APK release conectado à loja demo

Na raiz do projeto Flutter, use a **URL pública HTTPS da API** e o **slug exato** criado no seed:

```powershell
flutter build apk --release `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://SUA-API.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=vitrine-demo-f40
```

APK: `build/app/outputs/flutter-apk/app-release.apk`.

**Não é preciso** passar `ENABLE_DEMO_CHECKOUT` no Flutter: o servidor define se a loja é demo. Para cliente comercial, use slug próprio e mantenha `is_demo=false`; sem Mercado Pago real, o checkout permanecerá indisponível, como proteção.

## 5. Roteiro de testes no aparelho

1. Fechar sessões e abrir app: home deve aparecer **sem pedir login**. Entrar em produto, escolher cor/tamanho, adicionar ao carrinho.
2. Fechar totalmente o app, abrir novamente, aguardar sincronização do catálogo e conferir que os itens continuam no carrinho. Verificar o limite de estoque.
3. Tocar em `Finalizar`: deve abrir login com botão `Entrar como cliente demo` **se** `ENABLE_PUBLIC_DEMO_LOGIN=true` e slug demo. Também é possível registrar um cliente real (conta normal) nesta loja demo.
4. Após login, voltar ao checkout, preencher nome e telefone, selecionar **Pix simulado** ou **Cartão simulado** e confirmar. **Nenhum QR Pix ou link de cartão real** aparece. Deverá abrir `Pedidos` com status pago e aviso fictício.
5. Entrar com a conta do lojista vinculada pelo `--owner-email`, abrir `Painel da loja` e conferir novo pedido, evolução de status e indicadores fictícios.
6. Consultar a URL `https://SUA-API.up.railway.app/v1/shops/vitrine-demo-f40/checkout/availability`: resposta deve ter `demo: true`, `enabled: true` e `simulatedMethods: ["PIX", "CARD"]`.
7. Teste negativo: com uma loja **não demo**, tentativa de enviar `demoPaymentMethod` na API precisa falhar (400 ou checkout 503 enquanto não há gateway). Nunca liberar simulação por `kDebugMode` em lojas reais.

## 6. Limites, segurança e volta atrás

- Pedidos de demonstração têm `is_demo=true` e pagamento `demo`; **não entram no Mercado Pago nem criam estornos**. Entram nas contagens e no estoque **da loja demo**. É por isso que essa loja não deve ser reaproveitada como loja comercial.
- Login de cliente de um clique cria uma conta fictícia individual para cada sessão. Para demo aberta ao público, monitore criação de contas e eventual acúmulo no banco; pode desligar `ENABLE_PUBLIC_DEMO_LOGIN` a qualquer momento.
- Os pedidos de demo simulados são **pagos** para permitir testar fluxo completo; não houve transferência de dinheiro. Não use métricas dessa loja para relatórios financeiros de verdade.
- Para parar **novos checkouts** demo, marque `stores.is_demo=false` pelo banco *somente se não houver intenção de preservar esse ambiente demonstrativo*. É melhor suspender a loja demo (`stores.status='SUSPENDED'`) ou desligar login público. Não apague dados sem backup.
- Para reverter o código, restaure os arquivos originais do seu backup/commit. **Não reverta migration 013 automaticamente** em banco com dados; ela é aditiva e inofensiva com `false` como padrão.
- **Validação feita neste ambiente:** `npm run build` executado com sucesso; `npm test` executado com **42/42 testes aprovados** usando variáveis de teste temporárias e sem acessar um banco real. Não foi possível executar `flutter analyze`/`flutter test` porque Flutter SDK não está instalado aqui, nem validar migration, seed e checkout contra PostgreSQL real. Faça esses testes no Windows/Railway antes de apresentar a demo.

## 7. Arquivos removidos

Nenhum. O ZIP contém só arquivos novos/substituídos, sem `.env`, `node_modules`, `.dart_tool`, `build`, credenciais ou `.git`.
