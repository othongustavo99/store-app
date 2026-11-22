# Frequencia40 — Fase 5.16 | Exportacao assistida de pedidos por arquivo CSV

## Proposito

Permitir que o Store App produza um arquivo CSV de pedidos selecionados para ERPs/PDVs que possuam **importador de pedidos documentado e autorizado**. Esta fase **nao acrescenta um conector de ERP**. O operador precisa importar o arquivo e reconciliar manualmente com o sistema de destino.

### Fluxo

1. Integracao da loja com `orders.read` lista/identifica os IDs elegiveis no processo administrativo. Operador seleciona de 1 a 30 pedidos para um lote no JSON privado.
2. O CLI le `GET /v1/external/orders/:orderId` com credencial de integracao isolada pelo backend e valida todos os snapshots, sem consultar dados pessoais.
3. A PREVIEW emite resumo e SHA-256 do CSV com colunas configuradas, valores em centavos e data no fuso declarado da loja.
4. Em modo WRITE o operador confirma explicitamente a operacao e o mesmo SHA-256. A integracao revalida snapshots, reserva IDs em estado persistente, grava arquivo CSV novo e manifesto `*.csv.manifest.json`.
5. O operador importa o arquivo na ferramenta do PDV, compara referencias (`F40-<uuid>`), codigos de produto, itens e totais e documenta o aceite; sem atualizacao automatica do Store App.

### Bloqueios importantes

- Pedidos demo, nao pagos, cancelados, com entrega, desconto, frete, totais inconsistentes ou produto nao mapeado.
- Nenhuma chave externa criada automaticamente. `externalVariantId` deve estar mapeado na **mesma integracao** utilizada na exportacao.
- Idempotencia local: repeticao do mesmo pedido registrada no journal fica bloqueada, mesmo com outro nome de arquivo. Arquivo existente tambem e protegido. Falhas incertas exigem investigacao, nao reset de estado.
- Apenas arquivo local; nao transmite nem consulta o ERP, nao faz POST de criacao de pedidos, nao emite NF-e/NFC-e, nao corrige faturamento nem sincroniza estoque.
- Nao atende estoque multi-deposito, descontos, fretes, fiscal, entrega, pedidos com cancelamento ou pos-venda em curso, sem especializacao para o fornecedor.
- O status de pagamento `APPROVED` do snapshot nao e prova de que nao houve estorno ou processo de pos-venda depois; conferir antes da importacao.

### Seguranca e dados

- Token pela variavel `F40_INTEGRATION_TOKEN`, nunca por JSON ou log. Reutilizar a mesma credencial da F5.14 quando for necessario conservar mapeamentos.
- CSV sem CPF, email, telefone ou endereco; somente IDs tecnicos, produtos, quantidades e valores.
- CSV com aspas e neutralizacao de prefixos que seriam formulas em planilhas. Nao abrir arquivo comercial em maquinas compartilhadas.
- Preview sem gravacao; WRITE com confirmacao exata mais hash de revisao; saida com `wx` para nao sobrescrever.
- Estado por loja/integracao, bloqueio via arquivo `.lock`. Execucao em duas maquinas com journals diferentes nao tem coordenacao distribuida; evitar.

### Validacao e limites

- Testes locais Node.js usam dados ficticios e HTTP local, nunca a API real de fornecedor.
- Nenhuma nova migration, variavel Railway, tela Flutter ou alteracao na logica de checkout. Somente novos arquivos do worker de CSV e documentacao, mais notas atualizadas na auditoria comercial e no README do conector.
- Compatibilidade com layout do importador, campo `orderTotal` repetido por linha, coluna de identificador externo e data no fuso horario exigem homologacao especifica com o ERP/PDV.
- Sem comprovacao de aceite do ERP, `erpReceived:false` e `productionApproved:false` permanecem em todos os relatorios.
