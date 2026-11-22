# Fase 5.19 — Dossiê comercial de implantação (offline)

## Propósito

Consolidar, por cliente/integração, o parecer da Fase 5.15 e as evidências
**locais** das Fases 5.16–5.18 em um relatório legível. O relatório pode orientar
implantação, propostas, revisão de escopo e piloto assistido.

**NÃO é um conector de produção.** Não liga no ERP, não abre API, não acessa banco,
não grava pedidos, não confirma pagamento/estoque/nota fiscal e NUNCA autoriza
produção. Mesmo quando `reviewEligible=true`, exige homologação real e decisão
humana separada.

Compatível com Node.js 22+ (testado também com a versão Node 22 disponível no
ambiente de desenvolvimento). Não exige dependências npm adicionais.

## Uso imediato (Windows / PowerShell)

A partir de `loja_roupas/backend`:

```powershell
node connectors\deployment\cli.mjs --demo
node connectors\deployment\cli.mjs --input connectors\deployment\deployment.example.json
node connectors\deployment\cli.mjs --input connectors\deployment\deployment_csv.example.json --format json
node --test connectors\deployment\test\rollout.test.mjs
```

A demonstração usa dados fictícios. As verificações com o código existente
exigem a presença das Fases 5.15–5.18 já aplicadas.

## Criar dossiê de um cliente

```powershell
New-Item -ItemType Directory -Force .\connectors\deployment\clientes\loja_exemplo
Copy-Item .\connectors\deployment\deployment.example.json `
  .\connectors\deployment\clientes\loja_exemplo\plano.json
```

Editar apenas `plano.json` com os dados operacionais corretos. **Nunca incluir**
senhas, tokens OAuth, CPF, e-mail, dados de compradores ou segredos no plano.
O formato aceita somente campos previstos: atributos adicionais são rejeitados.

Para produzir um relatório sem sobrescrever arquivo existente:

```powershell
node connectors\deployment\cli.mjs `
  --input connectors\deployment\clientes\loja_exemplo\plano.json `
  --format md `
  --output connectors\deployment\clientes\loja_exemplo\dossie.md
```

Também são aceitos `--format text|json|md` e `--gate pilot|review`.
`--gate` é **apenas um filtro de preparação** para processos de conferência:
- código 0: relatório produzido e filtro atendido, se solicitado;
- código 3: filtro não atendido (porém relatório pode ser produzido);
- código 2: entrada inválida, evidência suspeita ou arquivo de saída já existe.

Nenhum desses resultados permite ativação automática ou substitui a aprovação humana.

## Se o cliente usa CSV manual

Usar `deployment_csv.example.json` como base, `manualCsvOrders: true` e manter
`requiredFlows` da avaliação F5.15 apenas nos fluxos **automáticos** que foram
verificados. `order_export` na F5.15 significa entrega automática ao ERP;
**não** confundir com o arquivo manual gerado pela F5.16.

Copiar para a pasta do cliente, em `evidencias/`, os arquivos produzidos nas
etapas anteriores, quando existirem:

- CSV exportado da F5.16, ex.: `evidencias/lote.csv`;
- manifesto original `evidencias/lote.csv.manifest.json`;
- retorno CSV do ERP, se existir, ex.: `evidencias/retorno.csv`;
- relatório de conciliação da F5.17, ex.: `evidencias/reconciliacao.json`.

Informar caminhos relativos em `artifacts` dentro do plano. O dossiê confere o
SHA-256 do CSV, quantidade de linhas, vínculo `storeId`/`integrationId`/`batchId`,
formato da conferência humana e integridade do preview registrado. O arquivo de
retorno do ERP é **somente identificado e hashado** aqui: a interpretação de
colunas/status deve ser feita pela F5.18 antes da conferência manual na F5.17.

Os arquivos reais podem conter dados pessoais. **Nunca colocá-los no repositório,
publicá-los em um chamado nem enviá-los sem autorização.** A pasta `clientes/`
está ignorada pelo `.gitignore` deste diretório.

## Campos principais

- `assessment`: perfil técnico estritamente validado pela F5.15.
- `binding`: UUID da loja e da integração; usado para impedir evidências de
  outro estabelecimento. Não guardar tokens.
- `manualCsvOrders`: `true` somente quando o escopo contratado inclui a
  exportação *manual* de arquivos de pedido por CSV.
- `checklist`: seis estados `pending`/`confirmed`, que representam **declarações
  humanas**, não verificações criptográficas de contrato ou homologação.
- `artifacts`: nomes de arquivos relativos à pasta do plano (ou `null`).

## Garantias e limites

- Dados de comprador e conteúdo bruto do CSV não aparecem no relatório.
- Arquivos existentes não são sobrescritos; reporte somente leitura.
- Arquivos de evidência fora da pasta do cliente, caminhos `..`, caminhos
  absolutos, links simbólicos e tamanhos acima dos limites são recusados.
- O dossiê nunca envia pedidos, altera estoque, libera retries, muda financeiro
  ou emite nota fiscal.
- Comprovante manual e retorno CSV **não provam aceite por API do ERP**.
- A confirmação de um cliente não é reutilizável para outro (`storeId`,
  `integrationId` e lote devem corresponder).
- Não é uma auditoria certificada de segurança, fiscal ou LGPD.

## Fluxo comercial recomendado

1. Levantar fornecedor, módulos, pontos de venda, escopo fiscal e capacidade de
   exportar arquivos ou acessar API autorizada.
2. Executar a avaliação da F5.15 e registrar escopo/limitações sem prometer
   recursos não implementados.
3. Executar os diagnósticos técnicos F5.10–F5.12 no painel da loja, se aplicável.
4. Em CSV, realizar F5.14 (catálogo), F5.16 (pedidos), F5.18 (retorno) e
   F5.17 (conciliação), conforme o escopo contratado, sempre sob supervisão.
5. Gerar o dossiê F5.19, resolver pendências e obter aprovação humana documentada.
6. Homologar no ERP real, com teste de venda e conciliação fiscal/financeira
   pertinente; somente então avaliar a entrada em produção com plano de reversão.
