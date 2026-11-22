# Frequencia40 — Store App / ERP e PDV — Fase 5.14

## Novidade: conector por arquivo CSV, sem exigir API do fornecedor

Este patch e **incremental** e pressupoe as Fases 1 a 5.13 ja aplicadas. Ele **adiciona** uma pasta nova `backend/connectors/csv`, sem substituir arquivos existentes do backend, Flutter ou banco.

### O que o conector faz
- Lê CSV UTF-8 configuravel por cliente (delimitador `;`, `,` ou TAB).
- Interpreta IDs externos, produtos, variantes, SKU, descricao, preco, GTIN opcional, cor, tamanho e status.
- Agrupa grades do mesmo produto em um unico payload; preserva reservas de estoque.
- Aplica os dados no Store App pela API existente de catalogo, com `eventId`/`sourceVersion` persistidos e idempotencia.
- Sincroniza saldo fisico apenas mediante opcao explicitamente confirmada e snapshot com data UTC, pela API dedicada ao estoque.
- Rejeita dados invalidos em PREVIEW antes de qualquer escrita; nao publica novos produtos automaticamente.

### Instalacao no Windows
1. Commit de seguranca e backup do banco.
2. Extraia este ZIP na pasta raiz `loja_roupas`, preservando diretorios. **Todos os arquivos sao novos.**
3. No terminal PowerShell, a partir da raiz do projeto:

```powershell
cd backend
npm ci
npm run build
npm test
cd connectors\csv
node --test
```

4. Para testar o preview apenas com os arquivos de exemplo, **ainda no diretorio `backend\connectors\csv`**, execute:

```powershell
$env:F40_CSV_CONFIG=(Resolve-Path .\settings.example.json).Path
$env:F40_CSV_INPUT=(Resolve-Path .\catalog.example.csv).Path
node .\sync.mjs
```

Esperado: `mode=PREVIEW`, 2 produtos, 3 variantes, `imported=0`, `productionApproved=false`.

### Railway / configuracao
- **Nenhuma migration nova.**
- **Nenhuma variavel adicional no backend Railway.**
- **Nenhum deploy do backend** por causa deste patch: os arquivos sao do conector separado.
- Nao e necessario cadastrar contas Omie/Bling/Olist para testar o CSV.
- Quando fechar com cliente, configurar worker ou execucao assistida com as variaveis descritas em `backend/connectors/csv/README.md` e credencial individual autorizada na Central de Integracoes.
- **Nao habilitar APPLY nem stockMode=PHYSICAL em ambiente de producao sem homologacao e decisao sobre estoque oficial.**

### Evidencias / limites
- Testes locais com mocks; nao ha homologacao com sistema de caixa real, impressoras, notas fiscais ou pagamentos.
- Valida o arquivo inteiro antes de qualquer alteracao. Em falha remota, um lote pode ser parcialmente aplicado, com operacoes pendentes e verificacao manual.
- **CSV nao equivale a integracao continua com qualquer sistema**: exige exportacao com IDs estaveis e pode operar apenas manualmente. Pedidos e vendas do Store App NAO sao escritos no ERP por esta via.
- Conectores Omie/Bling/Olist continuam disponiveis e sem alteracoes.

Consulte `docs/INTEGRACOES_FASE_5_PARTE_14.md` e `backend/connectors/csv/README.md` para configuracao, regras e homologacao comercial.
