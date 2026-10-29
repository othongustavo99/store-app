# Loja de Roupas — P2 Etapa 2 | Aplicação (29/10/2026)

**Pré-requisito:** o projeto já deve conter **P0, P1 e P2 Etapa 1**. Este pacote é incremental e seus arquivos vêm COMPLETOS, respeitando a árvore de diretórios. Não aplique diretamente sobre o ZIP `loja_roupas(8).zip` inicial. Nenhum arquivo precisa ser removido nesta etapa.

## 1. Mudanças entregues

- **Cupons por loja no Railway:** criação e listagem no admin, validade opcional, percentual ou valor fixo, mínimo de pedido, quantidade máxima, limite por usuário e ativação/desativação; prévia autenticada; apuração transacional no servidor (preços e estoque revalidados), registro do código e desconto nos pedidos. Não existe cobrança real oculta.
- **Push de atualização dos pedidos (opcional):** Android/iOS com FCM, opt-in do cliente no Perfil, associação do token ao usuário/loja no Railway, retirada local do token ao desativar/sair, trigger PostgreSQL + outbox, worker com bloqueio de concorrência e tentativas. O envio só funciona depois da configuração de Firebase por aplicativo/loja e de credenciais privadas exclusivamente no backend.
- **Paginação ampliada:** categoria e promoções recebem 24 produtos por lote em scroll, busca existente mantém cursor, e a Home passa a mostrar uma seleção inicial de 50 produtos, com link para catálogo completo. Novos filtros `discounted`, `featured`, `new` na API. O catálogo do admin permanece com o limite anterior: seu desempenho em catálogos gigantes será pauta futura.

## 2. Aplicação dos arquivos

1. Faça backup/snapshot do PostgreSQL do Railway, arquive o projeto no Git e registre o commit atual.
2. Extraia o ZIP **na raiz Flutter** que contém `pubspec.yaml` e a pasta `backend/`. Substitua os arquivos com mesmos caminhos; não cole código isolado, não remova outros arquivos.
3. Na pasta `backend`, instale/valide a compilação: `npm ci` seguido de `npm run build`.
4. Na implantação do Railway, **execute a migration `016_p2_coupons_push.sql` no banco correto antes de publicar as novas rotas**: `npm run db:migrate:prod`, com `DATABASE_URL` apontando para esse Postgres, e diretório de trabalho `backend` (onde está `migrations/`). Na configuração Railway, faça isso como pre-deploy command ou em um job com acesso ao mesmo banco; confira o log 'Aplicada: 016_p2_coupons_push.sql'. Se o serviço já usa `npm run db:migrate:prod` no deploy, mantenha o mecanismo existente e verifique a execução em logs.
5. Publique o backend atualizado. Após deploy, confira `/health/ready` e os logs. Os pedidos do P0 e P1 devem continuar funcionando.
6. No computador de desenvolvimento, na raiz Flutter, rode `flutter pub get`, `flutter analyze`, `flutter test` e `flutter build apk --release` com seus parâmetros Railway de sempre.

**Não instale** dependências de `node_modules` copiadas de outro ambiente; o ZIP não contém essa pasta, nem `.env` ou senhas. `backend/package-lock.json` foi atualizado para manter `firebase-admin` em dependências de produção.

## 3. Comandos PowerShell — backend

```powershell
cd backend
npm ci
npm run build
# Com DATABASE_URL e JWT_SECRET válidos no ambiente de teste:
npm test
# No Railway ou ambiente autorizado com backup realizado:
npm run db:migrate:prod
```

**Importante:** `npm test` executa testes com variáveis de validação; um banco operacional com dados reais não deve ser usado nos testes. `db:migrate:prod` executa migrações reais. No laboratório desta entrega, TypeScript compilou e **49/49 testes** existentes + novos passaram. Não foi possível validar migration contra um PostgreSQL real neste ambiente.

## 4. Comandos PowerShell — aplicativo

```powershell
# Na pasta raiz, fora de backend
flutter pub get
flutter analyze
flutter test

flutter build apk --release `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://SUA-API.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=vitrine-demo-f40
```

Substitua URL e slug pelos utilizados no P0/P1. `LOJA_PUSH_ENABLED` deve ficar **ausente/false** enquanto o Firebase não estiver preparado. Você pode validar todo o checkout e os cupons sem ativá-lo.

## 5. Uso de cupons — dentro do aplicativo

**Lojista:** Painel → Cupons de desconto → Novo cupom. Informe código, tipo, desconto, compra mínima, limites e validade opcional. A chave de uso é **por loja**. Códigos são normalizados em maiúsculas; evite acentos, espaços ou símbolos fora de `A-Z`, `0-9`, `_`, `-`. Um funcionário STAFF pode visualizar, mas só OWNER/MANAGER pode criar ou ativar/desativar (o backend verifica).

**Cliente:** adicionar itens ao carrinho → Checkout → Revisão → preencher e validar cupom. Um desconto estimado aparece na interface. **No envio do pedido**, a API recalcula preço, estoque, limites e validade, inclusive em APK release. Cupons não são meios de pagamento e não ativam Mercado Pago.

**Regras atuais:** não acumula cupons no mesmo pedido, desconto não reduz o valor dos produtos a zero (mínimo 1 centavo), transporte não é descontado, limite de utilização é contabilizado quando o pedido é **criado** (inclusive compras demo e pedidos pendentes), e cancelamentos/expiração não devolvem automaticamente essa utilização. Este último caso pode ser evoluído mais adiante caso o lojista queira política de reuso.

Teste sugerido: crie `TESTE10` com 10% e limite total 2/usuário 1, confira compra demo com valor descontado, status de pedido no painel e bloqueio de segunda tentativa. Experimente cupom vencido/inativo e outro de valor fixo; confirme que o valor mostrado é o valor persistido no pedido.

## 6. Notificações push — ativação **opcional**, fora e dentro do app

Não use credenciais do Mercado Pago; FCM não é um serviço de pagamento. Você precisa de um projeto Firebase de um aplicativo (ID de pacote exatamente igual ao build Android) e do FCM ativado. Para distribuir várias lojas como aplicativos separados, planeje projetos/credenciais Firebase correspondentes por cliente. Para iOS, configure APNs no Firebase e os arquivos/schemes Apple da loja antes de ativar; a entrega não automatiza essa parte nativa.

**Fora do app (Firebase e Railway):**

1. Crie/configure o app Android na Console Firebase, usando o `applicationId` do build daquela loja. Coloque seu `google-services.json` em `android/app/google-services.json`. Se usar o identificador Android personalizado do P1, ele precisa estar registrado no Firebase; o arquivo antigo de outro package não basta.
2. No Firebase Console, gere/obtenha a credencial de **conta de serviço** com permissão para enviar mensagens Firebase. Armazene-a exclusivamente em gerenciador de segredos (Railway): nome `FCM_SERVICE_ACCOUNT_JSON_BASE64`, valor = conteúdo JSON em base64, **sem expor em `--dart-define`, repositório, logs, ZIP ou app**. No PowerShell local, um exemplo para preparar o valor, sem imprimi-lo em logs compartilhados: `[Convert]::ToBase64String([IO.File]::ReadAllBytes('caminho\privadoirebase-admin.json'))`.
3. Reinicie/republique o backend com essa variável configurada. Se ausente, o worker de push não inicia e checkout, catálogo e cupons continuam normalmente. Os tokens de clientes devem pertencer ao mesmo projeto Firebase que a credencial do worker.
4. Gere o APK usando as opções Railway acima e inclua `--dart-define=LOJA_PUSH_ENABLED=true`, somente quando o Firebase do app estiver devidamente preparado.
5. No aplicativo instalado em dispositivo compatível, entre na conta → aba **Perfil** → **Ativar notificações dos meus pedidos**. Conceda permissão no sistema. Para parar: aba Perfil → **Desativar notificações neste aparelho**. O logout também tenta revogar o token remoto e o invalida localmente.

**Evento:** o backend envia avisos quando o status de um pedido do cliente muda. Não envia campanha de marketing nem mensagens promocionais arbitrárias. O texto não expõe itens, endereço ou preço. O sistema de notificação do SO é quem exibe mensagens em segundo plano; com o app em primeiro plano, o SSE atual mantém a tela de pedidos atualizada, e uma notificação visual própria em foreground não faz parte desta etapa. Rede, permissões, configuração FCM e fabricante do celular podem impedir a entrega.

**Segurança:** não use token do FCM como credencial de autenticação; cadastro/remoção no Railway sempre exige sessão. As credenciais privadas FCM permanecem no Railway. Se `FCM_SERVICE_ACCOUNT_JSON_BASE64` for removida, o envio é desativado sem afetar pedidos.

## 7. Validações obrigatórias

- Confirme **P0**: visitante navega, cliente demo entra e compra fictícia aparece no admin.
- Confirme **P1**: identidade, meios de pagamento local pendentes, frete e dashboard.
- Confirme **P2 Etapa 1**: cadastro/grade de variantes, busca, avaliações e zoom.
- **P2 Etapa 2:** crie cupom, teste validade, mínimo, limite global e por usuário. Recarregue a loja e confira total com desconto tanto no cliente quanto no admin.
- Teste ofertas/categorias em loja com mais de 24 produtos: próximo lote deve aparecer sem repetir e sem sumir ao rolar.
- Push só depois de configurado: aceite no Perfil, faça pedido, mude status no admin e confira recebimento no Android em segundo plano; teste saída/desativação.
- Faça novamente pedido **sem cupom** e com pagamento local pendente: o desconto deve ser zero e confirmação manual intacta.
- Não habilite cobranças reais até configurar o projeto comercial por lojista.

## 8. Limitações e reversão

- Este pacote não foi compilado pelo Flutter neste ambiente (SDK Flutter/Dart indisponível); rode `flutter analyze` e teste builds Android/Windows/iOS antes de distribuir. A migration não foi exercitada contra PostgreSQL real. Não é correto tratar a fase como aprovada para loja real antes disso.
- `firebase_messaging` requer setup específico Android/iOS. Windows não recebe FCM com esta implementação; no Windows o app funciona com push desativado.
- A Home exibe uma seleção inicial (até 50), e o catálogo completo está na busca; ofertas e categorias são paginadas. A área administrativa de listagem massiva ainda pode exigir paginação futura.
- Para reverter uma falha de publicação, faça rollback **dos arquivos** e da versão do backend para o commit anterior, mantendo a migration `016` (é aditiva). Só remova tabelas/colunas com procedimento de banco planejado e backup, porque elas podem conter cupons, pedidos ou tokens novos. Não reexecute SQL antigo alterado.
