# Fase 5.20 — preparação sem cliente real

## Acordo de escopo

1. Não testar com empresas reais nesta fase.
2. Preparar templates de configuração e verificação para o futuro.
3. Não confundir prontidão da estrutura com homologação comercial.
4. Não construir nem ativar agora um ERP próprio; deixar claro seu estado como trabalho futuro.
5. Não mudar checkout, movimentação financeira, fiscal, estoque ou políticas de autenticação do app.

## Estrutura técnica reutilizada

- F5.15: `assessment/assessment.mjs` e `reportMarkdown()` geram parecer conservador.
- F5.19: dossiês por loja devem ser usados mais tarde, quando a loja e os UUIDs forem reais.
- F5.20: gera perfis-modelo e relatórios de integridade, não dados de uma instalação ativa.

## Modos do gerador

| Modo | Implementação existente | Situação no kit |
| --- | --- | --- |
| Bling | Conector inicial por API | Pendente de contrato, configuração e homologação |
| Omie | Conector inicial por API | Pendente de contrato, configuração e homologação |
| Olist/Tiny | Conector inicial por API | Pendente de contrato, configuração e homologação |
| CSV | Fluxo manual de arquivos | Pendente de especificação do layout e conciliação real |
| ERP/PDV Frequência40 | Ainda não implementado | Somente trilha futura para adaptador próprio |

## Limites do verificador de fontes

O comando `--doctor` verifica a existência de arquivos, não código executável, migrations
executadas ou APIs online. O código e os testes devem continuar sendo validados com Node
antes de commits e com clientes apenas quando houver um contrato real.

## Próximo horizonte de arquitetura interna

Quando a criação do ERP/PDV próprio for priorizada, manter contratos separados para catálogo,
estoque, pedidos, pagamentos e emissão fiscal; idempotência em todas as criações; reconciliação
de pedidos com falhas incertas; credenciais isoladas por estabelecimento; rastreabilidade e
permissões. Não misturar emissão fiscal com o simples registro de referências externas.
