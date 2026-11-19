# Frequencia40 - Fase 5: Primeiro adaptador comercial (Omie)

Nesta fase adicionamos um **adaptador separado** (`backend/connectors/omie`) para importacao assistida a partir da API Omie. Nao alteramos o backend Fastify, Flutter ou PostgreSQL, e nao substituimos as fases anteriores.

## Alcance efetivo

| Funcionalidade | Estado |
|---|---|
| Consultar produto Omie por ID interno | Implementado (cliente HTTP) |
| Converter descricao, SKU, GTIN, preco para Store App | Implementado |
| Importar produto simples como rascunho / atualizar preco | Implementado via Fase 2, exige mapping e credenciais |
| Sincronizar estoque fisico por local de estoque configurado | Implementado, desligado por padrao, depende de permissao |
| Preview sem gravacao + aceite explicito para aplicar | Implementado |
| Estado persistente com retries idempotentes | Implementado (arquivo local por loja, nao banco) |
| Sincronizar vendas/pedidos Store -> Omie | **Nao** |
| Renovar token Omie automaticamente | **Nao** |
| Bling, Olist/Tiny, TOTVS e outros fornecedores | **Nao** |
| Producao homologada | **Nao** |

## Por que iniciar por Omie?

A API do Omie permite consultar produtos e estoque a partir do token de aplicativo e fornece identificador interno de produto. Os demais fornecedores exigem estrategia propria de autenticação e autorizacao; Bling e Olist/Tiny usam OAuth2 e nao podem ser conectados com uma suposta chave de API universal.

## Proximas entregas

1. Conector Omie de pedidos (cliente/parcelas/fiscal/estornos), depois de contas reais para validar regras e mapeamentos de clientes, natureza de operacao e formas de pagamento.
2. Conector Bling v3: autorizacao OAuth2, refresh, limites, mapeamentos, sincronizacao e homologacao.
3. Conector Olist/Tiny v3: OAuth2, token, pedido/estoque/cadastro de produto.
4. Versoes para outros ERPs/PDVs por adaptadores padronizados, sempre com credenciais e permissoes fornecidas pela loja.

## Segurança e implantacao

Manter o backend do Store App e o conector em ambientes separados. Se optar por Railway, um worker por loja/conta, com credenciais individuais e disco persistente ou um mecanismo de estado transacional. Nao usar filesystem efemero como base de idempotencia em producao. O modo preview so requer token Omie; o modo APPLY usa credencial F40 da mesma loja com catalog.write e, quando estoque ativado, stock.write. Todos os passos praticos estao em `backend/connectors/omie/README.md`.
