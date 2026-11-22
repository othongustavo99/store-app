# Frequência40 | Store App — Fase 5.18: Retorno tabular de pedidos CSV

**Instalação**: extrair este ZIP na raiz da pasta `loja_roupas`, mantendo a estrutura de subpastas. Todos os arquivos da F5.18 são novos; nenhum arquivo existente precisa ser excluído ou substituído. O pacote pressupõe Fases 5.16 e 5.17 aplicadas (incluindo respectivos arquivos de código, não só o README).

**Objetivo**: analisar CSV de retorno exportado por um ERP/PDV depois de importar manualmente pedidos da F5.16. Configuração de nomes de colunas e valores de situação por fornecedor; cruzamento por referência do pedido, loja/integração, manifesto e estado persistente; sinalização de valores, linhas e pedidos ausentes; rascunho de conferência F5.17 **sem qualquer confirmação automática**.

**Teste rápido no PowerShell (na raiz `loja_roupas`):**

```powershell
cd backend
node connectors\csv\order_ack_import_cli.mjs --demo
node --test connectors\csv\test\order_ack_import.test.mjs
node --test connectors\csv\test\order_reconcile.test.mjs
node --test connectors\csv\test\order_export.test.mjs
```

**Para testar todos os conectores**, no diretório `backend`:

```powershell
foreach ($conector in @('shared','bling','omie','olist','csv','assessment')) {
  Push-Location "connectors\$conector"
  node --test
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Falha em $conector" }
  Pop-Location
}
```

**Operação real**: leia `backend/connectors/csv/ACK_IMPORT_README.md` antes de configurar caminhos e status do ERP. Os exemplos de retorno são FICTÍCIOS. Esta fase NÃO aceita PDF/XLSX diretamente, não faz rede, não cria pedidos no ERP e não atualiza o journal. O rascunho só serve para facilitar o registro humano F5.17 depois de conferência real.

**Railway / implantação**: nenhuma migration, nenhuma variável global nova, nenhuma alteração de backend/checkout/Flutter. Não publique scripts de exemplo com dados de clientes ou senhas. Nunca altere/recrie o journal de estado persistente da F5.16 para obter nova exportação.

**Validação realizada**: Node.js 22 — 303 testes dos conectores e ferramentas, incluindo 42 novos desta fase, todos aprovados no ambiente de desenvolvimento. Não houve teste com retorno verdadeiro de ERP, nem execução em Windows neste ambiente. Homologar o layout e o significado dos status de cada ERP antes de usar com loja real.
