# Loja de Roupas — Evolução para plataforma comercial

Projeto Flutter em desenvolvimento. Objetivo: e-commerce multi-loja comercial com
cliente, painel administrativo e, no futuro, ferramenta Dev Windows.

## Estado atual

- Fase 0 aplicada: proteções para demonstração, indicadores e testes iniciais.
- **Fase 1:** API backend Node.js/TypeScript + PostgreSQL multi-loja no Railway.
- O Flutter **ainda usa Firebase** para catálogo, pedidos e autenticação até a Fase 2.
- **Não publique nem aceite pagamentos reais**: ainda não existem checkout seguro,
  gateway de pagamento, migração de dados ou autorização completa no Flutter.

## Como executar

Flutter: `flutter pub get`, `flutter analyze`, `flutter test`.
Backend: veja [backend/README.md](backend/README.md) e
[docs/FASE_1_RAILWAY_APLICACAO.md](docs/FASE_1_RAILWAY_APLICACAO.md).

## Etapas seguintes

- Fase 2: substituição progressiva dos repositórios Firebase por API HTTP
  e sincronização em tempo real, com plano de migração de dados e usuários.
- Fase 3: compra e pagamento reais com estoque transacional.
- Fases 4–8: ferramentas administrativas, visual, lojas, Windows Dev e expansão.

**Não remova Firebase até que a Fase 2 tenha sido concluída e validada.**
