# Fase 5.13 — Protocolo de seguranca e homologacao ERP/PDV

## Escopo

O objetivo desta fase e assegurar que as simulacoes mais perigosas de exportacao de pedidos falhem de forma segura antes de habilitar conectores em qualquer cliente. `node connectors/shared/commercial_safety_cli.mjs` executa 12 verificacoes **sinteticas, offline, sem credenciais** cobrindo:

- pedido nao pago, demonstrativo, entrega nao suportada;
- divergencia de valores e ausencia de ID do produto no ERP;
- referencias de pedido na saida dos adaptadores Omie, Bling e Olist/Tiny;
- parametrizacao fiscal EXPLICITA no adaptador Omie, sem inferencia de CFOP/NCM;
- pedido diferente do solicitado na fila;
- dois eventos do mesmo pedido em um lote;
- criacao incerta de venda no ERP e falha do ACK;
- inatividade de pedidos nao pagos;
- necessidade de consentimento explicito para escrita na fila;
- impedimento de compartilhar o diario de envio entre provedores/lojas.

O resultado tem `homologated:false`, `productionApproved:false`, e `realErpCalls:0` por desenho.

## Procedimento de homologacao assistida (quando houver cliente)

**Ambiente:** use conta de testes/sandbox do fornecedor quando disponivel, loja piloto, dados sinteticos e ERP com registros reversiveis. Documente autorizacao do lojista e do parceiro quando exigida. Mantenha workers automaticos desativados inicialmente.

1. **Identificacao do ambiente**: registrar loja, fornecedor, versao/API, contato de suporte, UF, modo de estoque e credenciais no cofre seguro do cliente; nao colocar segredos no checklist.
2. **Permissoes**: verificar escopos minimos (`orders.read`, `orders.write`, `events.read`, `orders.customer.read` quando dados pessoais forem necessarios). Confirmar controle OWNER na Central de Integracoes e revogacao.
3. **Produtos**: vincular SKU/GTIN/variantes a IDs do ERP, validar produtos com grade, kits, depositos, saldos fisicos, reservas e precos, incluindo situacoes que devem ser rejeitadas.
4. **Pedido valido**: selecionar pedido de teste com pagamento comprovado, cliente e itens mapeados; executar PREVIEW, confirmar os valores e a referencia `F40-<uuid>` antes da primeira escrita assistida.
5. **Criacao unica**: enviar UMA vez ao ERP sob supervisao, obter ID atribuido pelo ERP, ler de volta pelo fornecedor e verificar o vinculo no Store App. Nao criar registro financeiro/fiscal automaticamente ate homologar regras particulares.
6. **Falha antes do POST**: simular indisponibilidade do Store App e verificar que nenhum pedido remoto e criado.
7. **Falha durante/apos POST**: simular timeout da criacao; verificar diario com `NEEDS_RECONCILIATION`, consultar diretamente o ERP e concluir reconciliacao; **nunca** reenviar sem conferir.
8. **Falha de ACK e repeticao**: simular perda do ACK e dois eventos do mesmo pedido no lote; confirmar que a fila nao provoca segundo POST no ciclo e que o diario persiste entre reinicios.
9. **Status**: observar mudancas no ERP e mapear somente status externos com seguranca. Cancelamentos, estornos, devolucoes, pagos e notas nao devem ser modificados automaticamente por mapeamento desconhecido.
10. **Monitoramento**: conferir ultimo worker report, ausencia de eventos DEAD, sinalizacao de falhas, opcoes de replay e o diagnostico da Central. Registrar evidencias sanitizadas sem PII ou tokens.
11. **Fiscal e pagamentos**: validar separadamente, com contador e provedor, os fluxos reais exigidos pela UF e pelo regime do cliente. Sem validacao fiscal e financeira, nao prometer emissao fiscal ou integracao total.
12. **Go/no-go**: usar a Fase 5.12 para ver pendencias internas, mas liberar apenas apos resultados reais, aceite do cliente, backup, plano de rollback e responsabilidade pelo suporte.

## Criterios de aceite antes de ativacao real

- Nenhuma duplicacao de pedidos em timeout, replay ou restart.
- Referencia/ID remoto persistido e confrontado antes de marcar evento como concluido.
- Saldo fisico separado de estoque reservado; nenhuma perda silenciosa de atualizacoes.
- Testes completos do backend, conectores e Flutter (quando houver mudanca de UI) aprovados no ambiente do cliente.
- Sem credenciais, CPF, e-mail ou payloads de compradores em logs de diagnostico.
- Credenciais e arquivos de estado isolados por loja, protegidos, com backup e controle de acesso.
- Fluxos fiscais/financeiros/retornos nao homologados explicitamente desativados.

## Reversao

Se o worker de homologacao apresentar comportamento anormal: desabilitar o processo do conector, preservar o diario persistente, a fila e os IDs externos; **nao apagar registros nem refazer POSTs automaticamente**. Retornar ao build anterior do conector somente depois de conferir o estado dos pedidos em andamento. O patch da F5.13 nao altera esquema do banco de dados nem contratos HTTP.
