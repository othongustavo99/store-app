# F5.14 — Conector CSV para ERP/PDV sem API

## Proposta comercial

Complementar as integracoes nativas Bling, Omie e Olist/Tiny com uma via **orientada por arquivos** para sistemas de caixa que exportam CSV. A compatibilidade depende de cada fornecedor conseguir exportar os campos exigidos e nao equivale a integracao em tempo real, bidirecional ou certificada.

## Matriz de compatibilidade

| Origem | Produtos | Variantes | Precos | Estoque | Pedidos enviados ao PDV | Fiscal |
|---|---|---|---|---|---|---|
| CSV com IDs estaveis e colunas mapeaveis | Sim, assistido | Sim, cor/tamanho | Sim | Opcional, com snapshot confirmado | Nao | Nao |
| Sistema que so fornece PDF/relatorio nao estruturado | Nao, exige conversao validada | Nao garantido | Nao garantido | Nao garantido | Nao | Nao |
| ERP/PDV com API oficial | Preferir conector especifico | Depende do fornecedor | Depende do fornecedor | Depende do fornecedor | Depende do fornecedor | Depende do fornecedor |

## Aceite por estabelecimento

1. Confirmar a titularidade do cadastro e obter consentimento da loja para importar dados.
2. Exportar amostra REAL com produtos, variacoes, estoque e catalogo. Conferir que os IDs de produto e de variante sao unicos e nao mudam entre exportacoes.
3. Mapear os cabecalhos no arquivo privado de configuracao, definir categoria e validar a interpretacao de `status` e precos.
4. Executar preview OFFLINE: linha a linha validada antes de qualquer alteracao no banco. Nao confundir preview aprovado com importacao homologada.
5. Criar integracao por loja com escopo minimo (`catalog.write`; `stock.write` somente se autorizado) e um estado persistente por integracao.
6. Homologar em banco/loja de TESTE: produtos criados como rascunho, fotos/conteudo revisados, SKUs e GTIN sem conflito.
7. Se estoque fisico for ativado, validar data real do snapshot, deposito, produtos reservados e comportamento durante vendas simultaneas entre exportacoes.
8. Verificar reexecucao idempotente do MESMO CSV, arquivo atualizado, falha parcial e recuperacao usando o mesmo journal.
9. Aprovar plano de rollback/recuperacao, responsabilidade pela periodicidade dos arquivos e conferencia manual das divergencias.
10. So entao autorizar aplicacao em producao. Nao anunciar homologacao para sistema especifico sem evidencia com cliente e fornecedor.

## Limites operacionais

- Importacao manual por arquivo, nao conectividade direta com ERP; o usuario que exporta responde pela atualidade dos dados.
- Sem criacao de pedidos no ERP, conciliacao financeira ou emissao de NFC-e/NF-e.
- Sem alteracoes na estrutura de PostgreSQL, nas 24 migrations anteriores ou no Flutter.
- Nao resolver IDs inexistentes usando so o nome do produto ou EAN — conflitos sao bloqueados.
- Uma loja pode usar o conector CSV independente dos conectores nativos, mas nao deve permitir dois conectores diferentes como autoridades simultaneas do mesmo catalogo/estoque.
- Tratamento de arquivo parcial: erros de validacao impedem toda a escrita; falhas remotas podem gerar aplicacao parcial por produto, com estado reexecutavel.
