# Loja de Roupas — modelo comercial em evolução

Aplicativo Flutter para compradores e administração de lojas locais de roupas. API Fastify/TypeScript com PostgreSQL, preparada para dados separados por loja. O objetivo é reutilizar a base com identidade e configuração próprias de cada lojista.

## Entrega atual

**Etapa 01 — estabilidade, testes e diagnóstico do banco.**

Leia [LEIA_ETAPA_01.md](LEIA_ETAPA_01.md) para instalação do pacote, configuração Windows/Railway, validação, limitações e reversão. O histórico e as próximas etapas ficam em [docs/EVOLUCAO_MODELO_COMERCIAL.md](docs/EVOLUCAO_MODELO_COMERCIAL.md).

A base já contém catálogo, variantes, inventário, checkout, pedidos, atendimento, pós-venda, cupons e identidade de loja. A validação desta etapa não equivale à aprovação completa de operação comercial.

## Backend escolhido no build

A aplicação possui caminhos Firebase legado e API Railway. O padrão ainda é Firebase. Para utilizar a API, preserve seus parâmetros:

~~~text
--dart-define=LOJA_BACKEND=railway
--dart-define=LOJA_API_BASE_URL=https://SUA-API
--dart-define=LOJA_STORE_SLUG=sua-loja
~~~

As telas e regras novas de comércio estão no caminho Railway. Preserve o legado enquanto houver necessidade de compatibilidade; sua remoção não faz parte desta etapa.

## Verificações

Na raiz Flutter: flutter pub get, flutter analyze, flutter test.

Em backend: npm ci, npm run build, npm test. O comando npm run db:check verifica conexão e migrations em transação somente leitura. Migrations reais continuam sendo aplicadas por npm run db:migrate:prod, após recompilar e confirmar o banco correto.

DATABASE_URL e JWT_SECRET são configurados no ambiente do servidor/backend local. Segredos não entram no aplicativo.

## Próximas prioridades

- Corrigir recuperação do carrinho/favoritos fora dos primeiros 50 produtos.
- Corrigir a montagem do valor cobrado com cupom.
- Refinar mensagens e acompanhamento após confirmação manual.
- Polir vitrine, produto, compra e rotina do lojista.
- Tornar provisionamento, marca e integrações repetíveis por cliente.

Recebimento e frete externos ainda dependem de configuração de loja piloto. Antes de operar com clientes reais, validar integração própria do lojista, assinatura de distribuição e os cenários completos de compra em homologação.

Os documentos de fases antigas em docs são referências históricas; verifique o registro da etapa atual antes de seguir seus comandos.
