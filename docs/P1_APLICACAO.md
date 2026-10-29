# Loja de Roupas — P1 (29/10/2026)

**Base:** projeto com P0 já aplicado. Este pacote contém só os arquivos **novos ou alterados no P1**; preserve tudo mais, inclusive `backend/migrations/013_demo_mode.sql` e as variáveis do P0.

## 1. Escopo

### Marca e identidade
- `store_profiles.secondary_color` e `offline_methods` por loja, migration **014**.
- Cor principal e secundária usadas no `ThemeData` por meio do perfil público do Railway; componentes principais do carrinho/produtos acompanham o tema.
- Nome exibido no Android configurável no build e título Flutter carregado da API.
- WhatsApp da página do produto usa `supportPhone` do perfil Railway; **não compartilha mais o número do desenvolvedor** com lojas Railway.
- Cadastro no painel: nome, logo HTTPS, banner HTTPS, cores e formas de pedido local.

### Jornada do cliente
- Barra com **Início / Categorias / Favoritos / Carrinho / Perfil** em Android e desktop.
- Perfil reúne Pedidos, Atendimento, Conta, acesso administrativo (para equipe autorizada) e Sair.
- Favoritos ficam salvos localmente e separados por `LOJA_STORE_SLUG` (não estão sincronizados entre dispositivos).
- Vitrine: novidades, promoção, seleção, categorias e catálogo. A seção “mais vendidos” **não** é exibida com ranking inventado; vendas reais aparecem apenas no dashboard.

### Admin
- Endpoint `GET /v1/stores/:storeId/operations/analytics` autenticado, com totais brutos, gráfico semanal, top 5 vendidos, últimos pedidos e variantes com baixo estoque.
- Indicadores de teste são identificados como *fictícios*. Os valores de receita são brutos, podem incluir devoluções e usam datas de referência do servidor (UTC); não representam lucro.

### Checkout
- Fluxo em três etapas: **Entrega e contato / Pagamento / Revisão**.
- Busca de CEP automática pelo ViaCEP, com botão de cotação como alternativa e cartões de endereço salvo.
- Formas locais **opcionais** por loja: pagar na retirada, Pix manual combinado com a loja, WhatsApp. Todas criam **pedido PENDENTE**, reservam estoque e não usam Gateway. **Não há QR Code Pix, link de cobrança, reconhecimento automático de comprovante nem transferência de valores.**
- Somente **OWNER / MANAGER** pode clicar em confirmar pagamento local no painel. A API valida novamente loja, permissões, status, prazo, saldo reservado e impedimentos de cancelamento.
- Pedidos pendentes expiram após **48 h**, de acordo com o processo já existente de expiração de reservas; se confirmar depois da expiração, a API recusa.
- Para pagamentos locais, somente **RETIRADA**. O checkout online/delivery com pagamento real continua dependendo das credenciais e autorização próprias (mantê-lo desligado neste estágio).

## 2. Aplicação local do ZIP

1. Faça commit ou uma cópia de segurança do projeto **com P0**.
2. Extraia o ZIP **na raiz Flutter** (diretório que contém `pubspec.yaml` e a pasta `backend`), mantendo a árvore.
3. **Substitua os arquivos com os mesmos nomes**. Não exclua os outros arquivos existentes. **Nenhum arquivo precisa ser removido**.
4. Execute no PowerShell:

```powershell
cd C:\CAMINHO\DO\PROJETO
flutter pub get
flutter analyze
flutter test
```

> Não rodamos o compilador Flutter neste ambiente; ajustes locais podem ser necessários de acordo com sua versão do SDK/plugins. Corrija eventuais erros do `flutter analyze` antes de publicar.

## 3. Railway e banco PostgreSQL

1. Faça backup do banco de produção antes de rodar migrations.
2. Faça o deploy do **backend atualizado** e confira o caminho do Root Directory (`backend`) no serviço Railway.
3. Execute a nova migration **014** (migrations 001–013 não devem ser editadas):

```powershell
cd backend
npm ci
npm run build
npm run db:migrate:prod
npm test
```

Se Railway já executa as migrations no processo de deploy, **não** execute novamente manualmente. O migrador usa uma tabela de checksums e bloqueio concorrente.

4. Confirme que as variáveis permanecem **desabilitando cobranças reais**:

```env
ENABLE_REAL_PAYMENTS=false
ENABLE_REFUNDS=false
```

`ENABLE_PUBLIC_DEMO_LOGIN` só deve ser `true` se houver uma loja demo isolada, como na fase P0.

5. Na tela `/admin/store-settings`, cadastre as duas cores, contatos e logo/banner. Para uma loja não-demo, **ative uma modalidade local por vez** após conferir os procedimentos da loja; por padrão, todas ficam **desligadas**. O backend respeita essas escolhas por loja. **Não adicione token de Mercado Pago**.
6. Depois de atualizar o perfil, abra a loja novamente para revalidar o tema. O listener do catálogo também tenta atualizar automaticamente.

## 4. Build Android e configuração por lojista

### Construção normal (mantém identificador Android atual)

```powershell
flutter build apk --release `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://SUA-API.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=vitrine-demo-f40
```

### Build com identidade nativa por loja

Use o script `tools/build_loja.ps1`, sem editar manualmente os IDs. Exemplo:

```powershell
.\tools\build_loja.ps1 `
  -BackendUrl 'https://SUA-API.up.railway.app' `
  -StoreSlug 'vitrine-demo-f40' `
  -AppName 'Vitrine Demo' `
  -ApplicationId 'com.loja.roupas.loja_roupas'
```

Quando o identificador for diferente do original, é preciso gerar um `google-services.json` do projeto Firebase **correspondente ao novo `applicationId`** (o plugin Google Services ainda faz parte desta base legada). Passe `-GoogleServicesJson 'C:\config\cliente\google-services.json'`. O script confere o pacote e restaura o arquivo original ao fim. Não armazene credenciais nem dados pessoais de clientes no repositório.

**Importante:** nesta entrega foi implementado **perfil de build por loja**, preservando `flutter build apk` sem `--flavor`. Não foram criados Gradle product flavors independentes nem schemes iOS; a ativação exigiria separar de vez a configuração Firebase legada. O script atende à troca de nome e applicationId sem quebrar o fluxo de teste atual.

**Ícone e splash:** ainda exigem uma imagem/logo final fornecida pelo lojista e configuração de assets nativos. A marca pública (logo/banner) já funciona sem alterar o APK; não foi criado automaticamente um ícone genérico para todas as lojas.

**Assinatura:** o Gradle da base ainda usa `signingConfigs.debug` para release; isto serve para teste, **não** para entrega comercial/Google Play. Antes de vender, configurar keystore de release, `applicationId`, política de privacidade e permissões. Esse ajuste não foi forçado aqui para evitar quebrar a assinatura existente.

## 5. Checklist de aceite — teste antes de demonstrar

1. **Demo:** vitrine visitante, login cliente demo, pedido Pix/cartão fictício; pedido aparece no admin como demo.
2. **Vitrine:** Início/Categorias/Favoritos/Carrinho/Perfil; feche e reabra: favoritos continuam salvos. Troque de `LOJA_STORE_SLUG` e confira separação.
3. **Marca:** atualize `primaryColor` e `secondaryColor` via painel e confirme mudança no tema; teste WhatsApp com telefone próprio cadastrado.
4. **Checkout:** insira CEP válido; verifique preenchimento e endereço salvo; teste sem rede (preenchimento manual continua disponível).
5. **Local pendente:** em loja **NÃO-demo**, ligue Pagar na Retirada; finalize um pedido; confirme `PENDING_PAYMENT`, `paymentProvider=offline`, sem cobrança; admin confirma depois de conferência externa.
6. **Segurança:** cliente não deve conseguir chamar endpoint de confirmação; usuário da equipe STAFF também não; OWNER/MANAGER autorizados.
7. **Expiração e inventário:** pedidos locais não confirmados após 48h devem expirar, com liberação do estoque reservado. Confirmação dupla não deve baixar estoque duas vezes.
8. **Dashboard:** loja A nunca vê pedidos/vendas da loja B; no modo demo todas as cifras são fictícias.
9. **Mercado Pago:** o gateway continua sem cobrança real; não toque em `ENABLE_REAL_PAYMENTS` ou tokens nesta fase.

## 6. Rollback

Primeiro faça o deploy do backend anterior e recoloque os arquivos do Flutter do seu backup P0. **Não é necessário remover a migration 014**: as novas colunas são aditivas e não mudam regras históricas. Para desabilitar imediatamente pedidos locais, em cada loja desmarque os métodos na tela de configuração. Se necessário, com backup e aprovação operacional, um administrador de banco pode executar:

```sql
UPDATE store_profiles SET offline_methods = ARRAY[]::text[];
```

Não reverta os pedidos já criados, não apague a tabela `payments` e não tente corrigir status de venda diretamente por SQL: use as rotinas existentes de pedido/estoque, preservando auditoria e saldo de reservas.
