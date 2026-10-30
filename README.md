# Loja de Roupas — modelo comercial em evolução

Aplicativo Flutter para compradores e administração de lojas locais de roupas. API Fastify/TypeScript com PostgreSQL, preparada para dados separados por loja. O objetivo é reutilizar a base com identidade e configuração próprias de cada lojista.

## Entrega atual

**Etapa 06 — configuração por lojista e demonstração comercial.**

Leia [LEIA_ETAPA_06.md](LEIA_ETAPA_06.md) para instalar a etapa atual, sobre as Etapas 01 a 05. Não há migration nova: preserve os SQL 001–018 e publique backend antes do aplicativo. A configuração Windows/Railway e o diagnóstico do banco permanecem em [LEIA_ETAPA_01.md](LEIA_ETAPA_01.md). O histórico e as próximas etapas ficam em [docs/EVOLUCAO_MODELO_COMERCIAL.md](docs/EVOLUCAO_MODELO_COMERCIAL.md).

A base já contém catálogo, variantes, inventário, checkout, pedidos, atendimento, pós-venda, cupons e identidade de loja. A validação desta etapa não equivale à aprovação completa de operação comercial.

## Backend escolhido no build

A aplicação possui caminhos Firebase legado e API Railway. O padrão ainda é Firebase. Para utilizar a API, preserve seus parâmetros:

~~~text
--dart-define=LOJA_BACKEND=railway
--dart-define=LOJA_API_BASE_URL=https://SUA-API
--dart-define=LOJA_STORE_SLUG=sua-loja
~~~

As telas e regras novas de comércio estão no caminho Railway. Preserve o legado enquanto houver necessidade de compatibilidade; sua remoção não faz parte desta etapa.

Para novos clientes, use `config/loja.example.json`, o gerador `npm run client:prepare` no backend e `tools/build-client.ps1` conforme o guia da Etapa 06. O gerador inclui UUID e modo esperados da loja para conferência antes da abertura. Configurações locais e artefatos ficam fora do Git.

## Verificações

Na raiz Flutter: flutter pub get, flutter analyze, flutter test --concurrency=1 --dart-define=LOJA_BACKEND=railway.

Em backend: npm ci, npm run build, npm test. O comando npm run db:check verifica conexão e migrations em transação somente leitura. Migrations reais continuam sendo aplicadas por npm run db:migrate:prod, após recompilar e confirmar o banco correto.

DATABASE_URL e JWT_SECRET são configurados no ambiente do servidor/backend local. Segredos não entram no aplicativo.

## Entregas e próximas prioridades

- Recuperação de carrinho e favoritos por IDs, inclusive fora da Home: entregue na Etapa 02.
- Montagem e conferência do valor cobrado com cupom: entregue na Etapa 02.
- Mensagens após confirmação manual, revisão e cancelamento: entregues na Etapa 02.
- Vitrine por marca, filtros reais, ordenação, fotos por variante e ações de compra: entregues na Etapa 03.
- Checkout revisado, retirada com orientações, entrega local por CEP e histórico de pedidos: entregues na Etapa 04.
- Preparo antes do pagamento na retirada, filtros de pedidos, prévia de estoque e ajustes do cadastro: entregues na Etapa 05.
- Prévia da marca, checklist, provisionamento por CLI e parâmetros de build por cliente: entregues na Etapa 06.
- Próxima prioridade: homologação integrada da demonstração e ajustes finais em aparelho real.
- Evolução posterior: conexão das integrações externas por lojista; o backend atual conserva os limites do piloto.

Pagamento online e frete por transportadora ainda dependem de configuração de loja piloto. Entrega local usa taxa fixa e faixas de CEP cadastradas pelo lojista, sem transportadora. Antes de operar com clientes reais, validar integração própria do lojista, assinatura de distribuição e os cenários completos de compra em homologação.

Os documentos de fases antigas em docs são referências históricas; verifique o registro da etapa atual antes de seguir seus comandos.
