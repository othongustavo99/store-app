# Fase 4.7 — Frete cotado e expedição rastreável (etapa piloto)

## O que esta entrega faz

- Mantém **retirada na loja** sem custo de transporte.
- Habilita **cotação real da API do Melhor Envio**, inicialmente em sandbox, apenas quando houver token autorizado, CEP de origem e peso e dimensões de cada variante/SKU do carrinho.
- Mostra opções de transportadoras, preços retornados e prazos estimados, sem tabelas inventadas.
- Guarda cada cotação por **15 minutos** no PostgreSQL, vinculada ao cliente, loja, CEP e assinatura dos itens, preços e medidas; o servidor rejeita cotação expirada ou alterada.
- Prepara checkout DELIVERY: o valor de frete escolhido entra no total do pedido e na preferência Mercado Pago, mas **não é possível cobrar com cotações de sandbox**.
- Permite ao administrador registrar **manualmente** rastreio de envio efetivamente postado e confirmar uma entrega, com histórico privado para o cliente.

## Ainda NÃO implementado

- Compra, emissão, impressão e cancelamento de etiquetas no Melhor Envio; cadastro de documentos e nota fiscal, autorização OAuth por lojista, renovação de tokens, webhooks/rastreio automático e confirmação da transportadora. Sem esses itens o checkout de entrega em produção **não está homologado para venda real**.
- Um token de integração independente por estabelecimento: esta entrega permite **somente uma loja piloto**, `SHIPPING_PILOT_STORE_ID`, diferente do UUID do Railway.
- Integração real com Mercado Pago: permanece **desativada** se `ENABLE_REAL_PAYMENTS=false`.

## Instalação (Windows / VS Code)

1. Faça backup e extraia `LOJA_FASE_4_7_FRETE_ENTREGAS_RAILWAY.zip` **na pasta que contém `loja_roupas`**, mantendo os caminhos. Não copie `.env` nem pastas de `node_modules`.
2. Aplique arquivos completos; **não remova nenhum arquivo existente**.
3. Na raiz do projeto:

```powershell
cd backend
npm ci
npm run build
npm test
cd ..
flutter pub get
flutter analyze
flutter test
```

4. Se tudo passar, envie a branch que o Railway usa:

```powershell
git add backend/src backend/migrations/009_shipping_delivery.sql lib docs/FASE_4_7_FRETE_ENTREGAS_RAILWAY.md
git commit -m "feat: fase 4.7 cotacao de frete e expedicao"
git push origin master
```

5. Em **Railway > store-app > Deployments > Deploy Logs**, confirme `Aplicada: 009_shipping_delivery.sql`. Confirme também que `/health/ready` responde normalmente.

## Variáveis do Railway (store-app)

Para continuar somente em retirada, **não precisa adicionar nenhuma** das variáveis abaixo. O novo menu funciona, mas marca cotação externa indisponível.

Para habilitar cotação de testes com Melhor Envio, utilize credenciais exclusivas do **sandbox**:

| Variável | Exemplo / orientação |
|---|---|
| `SHIPPING_MELHOR_ENVIO_TOKEN` | token autorizado na conta/aplicação **sandbox** do Melhor Envio (NUNCA expor no Flutter/GitHub) |
| `SHIPPING_PILOT_STORE_ID` | UUID real de `stores.id` da loja piloto; não é slug |
| `SHIPPING_MELHOR_ENVIO_SANDBOX` | `true` inicialmente (padrão) |
| `SHIPPING_USER_AGENT` | `MinhaLoja (suporte@seudominio.com)` — troque pelo nome e email técnico reais |
| `ENABLE_REAL_PAYMENTS` | manter `false` enquanto o checkout financeiro não estiver homologado |
| `ENABLE_REFUNDS` | manter `false` durante testes |

A documentação oficial da API exige um `User-Agent` identificável, permite cotação por `products` com peso em kg e dimensões em cm e recomenda `custom_price` / `custom_delivery_time`. Consulte https://docs.melhorenvio.com.br/docs/cotacao-de-fretes .

**Para obter o token no Melhor Envio:** acesse https://sandbox.melhorenvio.com.br/, crie conta e aplicação em **Integrações → Área Dev**, configure autorização e as permissões necessárias à cotação. O Melhor Envio usa OAuth 2.0 e tokens com validade: o processo comercial completo precisará fazer renovação segura. Consulte https://docs.melhorenvio.com.br/docs/autenticacao e https://docs.melhorenvio.com.br/docs/sandbox . Não configure `SHIPPING_MELHOR_ENVIO_SANDBOX=false` em produção apenas para forçar uma cobrança: o fluxo de etiquetas e autorização da loja ainda precisa ser finalizado.

## Cadastro no aplicativo

Execute Flutter:

```powershell
flutter run -d windows `
 --dart-define=LOJA_BACKEND=railway `
 --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
 --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

- Entre como proprietário/gerente e abra **Administração → Frete e embalagens**.
- Cadastre o **CEP real** de origem e, em cada SKU, peso em kg e largura/altura/comprimento em cm. Use as dimensões do produto embalado e teste os limites das transportadoras.
- Entre como cliente, coloque um SKU em estoque no carrinho, abra checkout, escolha **Entrega**, informe um CEP e toque **Cotar frete**. Sem token ou dimensões, o recurso avisa que não está disponível.
- Teste alteração de quantidade, preço, peso e CEP após cotação: a opção antiga não deve mais permitir a finalização. A API também rejeita a cotação antiga.
- Com pagamentos desativados, o botão financeiro continua bloqueado, mas a simulação da cotação pode ser testada.
- Num pedido já pago por integração válida, a equipe usa **Registrar postagem** com código obtido da transportadora e depois **Confirmar entrega**. Esse registro é **manual**, não uma consulta automática aos Correios.

## Arquivos do pacote

Novos:
- `backend/migrations/009_shipping_delivery.sql`
- `backend/src/services/shipping_rules.ts`
- `backend/src/routes/shipping.ts`
- `backend/src/routes/shipment_management.ts`
- `backend/src/tests/shipping_rules.test.ts`
- `lib/data/repositories/railway_shipping_repository.dart`
- `lib/features/admin/shipping/railway_shipping_screen.dart`
- `lib/features/admin/shipping/railway_shipment_dialog.dart`
- `docs/FASE_4_7_FRETE_ENTREGAS_RAILWAY.md`

Substituídos:
- `backend/src/app.ts`, `backend/src/config.ts`, `backend/src/routes/commerce.ts`
- `lib/data/repositories/railway_order_repository.dart`
- `lib/features/client/checkout/railway_checkout_screen.dart`
- `lib/features/admin/remote_admin_home.dart`
- `lib/router/app_router.dart`
- `lib/features/admin/orders/railway_admin_orders_screen.dart`
- `lib/features/client/orders/railway_orders_screen.dart`
- `lib/features/support/railway_order_timeline_dialog.dart`

Removidos: nenhum.

## Validação e rollback

`npm run build` e `npm test` executados localmente com credenciais de teste fictícias: 32/32 testes aprovados. **Flutter não estava disponível neste ambiente** e não foi executado build Flutter, migration no PostgreSQL hospedado, nem conexão à API do Melhor Envio com credenciais reais. Execute `flutter analyze` e teste em dois dispositivos.

Se houver erro após o deploy, retire temporariamente `SHIPPING_MELHOR_ENVIO_TOKEN` do Railway para manter retirada; isso não desfaz a migration, que deve permanecer. Não apague o banco nem altere migrations executadas. Mantenha cópia e restauração testada do PostgreSQL.

## Próxima fase comercial

Conectar **cada lojista** ao Melhor Envio via OAuth, emissão/compra de etiquetas (documentação fiscal e elegibilidade por transportadora), eventos de transportadora e conciliação; só então habilitar entrega com cobrança real. A oferta de cotação sem compra de etiqueta pode criar divergências logísticas e por isso deve ficar em homologação.
