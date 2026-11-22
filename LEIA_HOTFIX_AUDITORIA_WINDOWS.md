# Frequência40 — Hotfix da auditoria ERP/PDV (Fase 5.15) no Windows

## Sintoma

Ao executar `node --test connectors\assessment\test\assessment.test.mjs` na pasta `backend`, cinco testes do CLI falham com `Cannot find module 'C:\C:\Users\...'`.

## Causa e correção

Os testes convertiam URLs de arquivo em caminhos de sistema usando `new URL(...).pathname`. No Windows, isso produz um caminho com uma barra inicial (como `/C:/Users/...`) e o runtime acaba interpretando o drive duas vezes. Agora usamos `fileURLToPath` de `node:url` para converter essas URLs corretamente, incluindo espaços e caracteres especiais no nome das pastas.

Foi adicionado também um teste específico para detectar a regressão de unidade duplicada no Windows.

## Arquivo alterado

Substitua **apenas** este arquivo, mantendo a estrutura da pasta a partir da raiz `loja_roupas`:

`backend/connectors/assessment/test/assessment.test.mjs`

O arquivo `backend/connectors/assessment/cli.mjs` não precisa ser alterado. Nenhuma migration, variável Railway, mudança Flutter ou deploy do backend é necessária.

## Verificação

No PowerShell, a partir da pasta raiz `loja_roupas`:

```powershell
cd backend
node --test connectors\assessment\test\assessment.test.mjs
node connectors\assessment\cli.mjs --input connectors\assessment\example_bling.json
```

Resultado esperado do primeiro comando: **33 testes aprovados** (32 originais + 1 teste de regressão).

O CLI exibirá o parecer offline, sem acessar APIs externas ou enviar dados ao ERP.

## Validação já realizada

A suíte corrigida foi executada em ambiente Linux com Node.js 22.16.0: **33/33 aprovados**. Também verificamos a transformação de `file:///C:/...` para `C:\...` por `fileURLToPath(..., { windows: true })`. A execução efetiva no Windows do usuário ainda precisa ser confirmada.

A Fase 5.16 permanece pausada até a confirmação dos testes no Windows.
