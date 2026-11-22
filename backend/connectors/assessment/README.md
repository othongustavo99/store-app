# Frequência40 Store App — Avaliação de compatibilidade ERP/PDV (Fase 5.15)

Ferramenta **offline** para qualificar um cliente e orientar a implantação, sem conectar o ERP, manipular pedidos, armazenar segredos ou alterar o banco.

## O que responde

- Qual caminho técnico cabe à loja: conector inicial Omie/Bling/Olist, importação CSV, API customizada ou sem canal confirmado.
- Quais fluxos foram pedidos e se a implementação atual cobre **o escopo declarado**.
- O que ainda precisa ser comprovado: acesso, identificadores, estoque oficial, dados de compradores, sandbox e piloto.
- Quais incompatibilidades precisam de desenvolvimento: grades complexas nos conectores iniciais, depósitos múltiplos, estoque fracionário, pedidos com entrega, descontos ou pagamento misto, fluxo fiscal.

O relatório é **declaratório e conservador**; não certifica compatibilidade, não comprova endpoints, não faz emissão de notas fiscais nem libera produção. `productionAuthorized` é sempre `false`.

## Uso no PowerShell (partindo de `loja_roupas/backend`)

```powershell
node connectors\assessment\cli.mjs --input connectors\assessment\example_bling.json
node connectors\assessment\cli.mjs --input connectors\assessment\example_csv.json --format json
node connectors\assessment\cli.mjs --input connectors\assessment\example_bling.json --format md --output connectors\assessment\reports\exemplo.md
node --test connectors\assessment\test\assessment.test.mjs
```

Crie previamente a pasta `connectors/assessment/reports`, se desejar gravar relatórios. A saída não sobrescreve arquivos existentes. `--format text` é o padrão; `--format json` facilita integração futura com a Central.

## Bloqueios opcionais para pipelines

```powershell
node connectors\assessment\cli.mjs --input connectors\assessment\example_bling.json --gate pilot
node connectors\assessment\cli.mjs --input connectors\assessment\example_bling.json --gate review
```

Códigos de saída: **0** = relatório gerado (ou gate atendido); **2** = entrada inválida/erro de arquivo; **3** = gate não atendido. Gate `pilot` exige no mínimo `READY_FOR_ASSISTED_PILOT`; gate `review` exige `MANUAL_PRODUCTION_REVIEW`. Nenhum gate significa homologação ou autorização automática de venda.

## Como preencher o perfil

Copie `example_bling.json` ou `example_csv.json` para `private/cliente.json` (pasta local ignorada pelo Git).

- `storeAlias`: apelido técnico, sem nome de pessoa, CPF, e-mail ou CNPJ.
- `provider`: `bling`, `omie`, `olist` ou `other`.
- `transport`: `connector` (um dos três adaptadores), `csv`, `api` (necessita adaptador) ou `none`.
- `requiredFlows`: `catalog_import`, `stock_import`, `order_export`, `order_status_read`, `fiscal_reference`.
- `vendorCapabilities`: para **cada fluxo**, `confirmed` (com evidência), `unconfirmed` ou `unsupported`. Um adaptador no código não significa que a API daquele cliente foi homologada.
- `operation`: opções booleanas declarando uso real de variações, depósitos múltiplos, estoque fracionário, entregas, descontos e pagamento misto.
- `evidence`: `confirmed`, `unconfirmed` ou `unsupported` por verificação. Nunca preencha `confirmed` apenas porque alguém disse que 'deve funcionar'.

**Não inclua chaves de API, tokens OAuth, dados pessoais, senhas, números fiscais, amostras de consumidores ou URLs privadas no perfil.** Campos desconhecidos são recusados. Os únicos arquivos de exemplo publicados não contêm dados reais.

## Significado dos pareceres

- `REQUIRES_SCOPE_CHANGE`: pelo menos um fluxo solicitado não existe ou requisito essencial está indisponível.
- `DISCOVERY_PENDING`: caminho potencial, mas faltam evidências e/ou testes.
- `READY_FOR_ASSISTED_PILOT`: sem bloqueios declarados, evidências iniciais marcadas como confirmadas, mas piloto não concluído.
- `MANUAL_PRODUCTION_REVIEW`: o perfil afirma que piloto foi reconciliado; **ainda exige conferência humana e homologação real**.

### Cuidados comerciais

Não trate o relatório como promessa de 100% de compatibilidade. O caminho CSV desta versão **só importa catálogo e saldo físico opcional**; não cria pedidos no sistema de caixa e não é integração em tempo real. Os três adaptadores dos ERPs ainda são iniciais, com testes simulados: itens com grades, frete, desconto, múltiplos depósitos e outras condições podem exigir evolução. A emissão fiscal é responsabilidade do ERP/provedor fiscal, não dos conectores.
