# Fase 5.15 — Auditoria de compatibilidade comercial (Store App)

## Objetivo

Adicionar um instrumento offline, uniforme e verificável para descobrir **antes da venda** se o ERP/PDV de uma loja pode receber o Store App e quanto trabalho adicional será necessário. Não ampliar artificialmente a lista de fornecedores 'suportados'.

## Caminhos analisados

| Caminho | Implementação já existente | Limitações atuais |
|---|---|---|
| Omie | Conector inicial, catálogo/estoque e pedidos assistidos | Integração não homologada, produtos simples, pedidos pagos de retirada sem frete/descontos; status informativo |
| Bling | Conector inicial, catálogo/estoque e pedidos assistidos | Mesmo escopo restrito; autenticação e permissões dependem da conta do cliente |
| Olist/Tiny | Conector inicial, catálogo/estoque e pedidos assistidos | Mesmo escopo restrito; exige validação do contrato da API e das regras da loja |
| CSV | Importação assistida de produtos/variantes/preço e estoque físico opcional | Sem exportação de pedidos, sem atualização em tempo real, sem emissão fiscal |
| Outra API | Base de APIs e eventos da Frequência40 aproveitável | Adaptador novo necessário para autenticação, mapeamento e testes |
| Sistema sem API/CSV | Nenhum caminho comprovado | Consultar fornecedor sobre API, exportações ou integração autorizada |

**Não há homologação com contas reais nesta fase.** 'Implementação existente' significa código e testes simulados disponíveis, não certificação de funcionamento em toda versão do software.

## Perguntas comerciais mínimas

1. Qual é o nome e versão do ERP/PDV? O fornecedor oferece API, webhooks ou exportação CSV?
2. Existe documentação oficial e autorização contratual de integração? Uma conta sandbox pode ser fornecida?
3. Os identificadores SKU/GTIN e IDs de variantes permanecem estáveis? Há grades, produtos compostos ou múltiplos depósitos?
4. Qual software é a fonte oficial de estoque e preços? Estoque é inteiro ou fracionário? Qual a frequência de atualização?
5. A loja precisa enviar pedidos do app ao ERP? Inclui frete, retirada, descontos, pagamentos mistos e devoluções?
6. Quem emite NF-e/NFC-e e qual processo fará a conferência e disponibilização de XML? Não confundir referência fiscal com nota emitida.
7. O ERP exige dados do comprador? Há permissão e justificativa para transferi-los? Como as informações são protegidas?
8. Quem fará conferência e aprovação de um piloto real? Como reverter falhas sem duplicar pedidos ou baixar o estoque duas vezes?

## Procedimento recomendado por cliente

1. Registrar as respostas em um perfil **sem dados pessoais nem segredos**.
2. Gerar relatório JSON ou Markdown pela CLI da pasta `backend/connectors/assessment`.
3. Separar **bloqueios de escopo** de **documentos/evidências pendentes**.
4. Apresentar proposta comercial somente com o escopo efetivamente suportado (ou explicitamente orçado para desenvolver).
5. Configurar acesso individual no ambiente isolado do cliente, mantendo a automação desativada.
6. Executar homologação com produtos, estoque, um pedido pago, cancelamento e reconciliação manual do retorno; comparar estoque real e documentos fiscais no ERP.
7. Registrar a aprovação operacional e fiscal, revisar LGPD, plano de rollback, suporte e procedimentos de incidentes.
8. Habilitar integrações em produção **somente com autorização expressa** e monitoramento ativo.

## API / persistência / migrações

Nenhuma alteração no backend Fastify, banco PostgreSQL, Flutter, rotas públicas ou checkout. Ferramenta Node.js 22, ESM, sem dependências adicionais, sem acesso à rede. Não há migration e não há variável Railway nova. Os arquivos de perfis e relatórios locais não devem ser versionados.

## Contrato do relatório

`assessment.mjs` exporta `validateProfile`, `assessProfile`, `reportMarkdown` e `MATRIX` para reaproveitamento em futuros componentes de gestão. A saída JSON inclui `verdict`, `hardBlockers`, `pendingChecks`, `notices`, `approach`, `productionAuthorized:false`. Não há qualquer função de ativação de integração.

## Limitações e próximos desenvolvimentos

- Essa etapa não adiciona um conector ERP novo e não constitui teste de rede; qualifica o que falta integrar.
- O diagnóstico é baseado em informações declaradas pelo usuário e precisa ser confrontado com documentação e testes reais.
- Para CSV, seria interessante desenvolver posteriormente uma exportação assistida de pedidos (se o ERP suportar importação), com idempotência e controle de retorno.
- Para API, priorizar endereços e exemplos oficiais de ERP, contrato de IDs/estoque, produtos com grades, impostos, meios de pagamento e reconciliação real de pedidos.
- A liberação comercial continua sendo manual, conforme validação contratual, fiscal e operacional de cada cliente.
