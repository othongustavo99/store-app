# Frequencia40 Store App - Fase 5 (patch incremental)

## Instalar

1. Garanta backup e commit de seguranca. Pressupoe Fases 1-4 aplicadas e testadas.
2. Extraia o ZIP na raiz `loja_roupas`. O ZIP inclui **apenas novos arquivos** em `backend/connectors/omie`, `docs/` e este guia, sem substituicao de arquivos das fases anteriores.
3. No PowerShell do VS Code:

```powershell
cd backend
npm ci
npm run build
npm test
cd connectors\omie
node --test
```

4. Antes de configurar conta Omie, leia `backend/connectors/omie/README.md`, ajuste o JSON de exemplo e execute primeiro `node sync.mjs` **sem** `--apply`.

## Railway

- **Nenhuma variavel nova no servico existente do backend Store App.** Mantenha `ENABLE_EXTERNAL_INTEGRATIONS` como configurado nas fases anteriores.
- **Nenhuma migration nova nesta fase**. O conector funciona como um processo separado e nao interfere nos processos da API.
- Variaveis do **conector separado**: `OMIE_APP_TOKEN`, `F40_OMIE_CONFIG`, `F40_API_URL`, `F40_INTEGRATION_TOKEN`, `F40_STATE_FILE`, `F40_APPLY` para escrita confirmada. `F40_OMIE_CONFIG` e `F40_STATE_FILE` sao caminhos absolutos no sistema do worker. `F40_STATE_FILE` exige volume persistente.
- Nao adicionar segredos ao codigo nem ao repositorio. Nao ligar rotinas automatizadas antes de homologar dados e credenciais.

## Resultado dos testes

- Testes exclusivos do conector com `node --test`: **12 aprovados** (mock HTTP e estado local).
- Testes do backend das fases anteriores: **nao reexecutados nesta entrega** (codigo do backend nao foi alterado).
- Validacao contra API Omie e PostgreSQL real: **nao realizada**. Nao anunciar como conector comercial homologado ainda.

## Limite do escopo

Esta e a **primeira parte da Fase 5**: Omie -> Store App para produtos simples/precos/estoque. Os conectores de pedidos Omie, Bling, Olist/Tiny e demais fornecedores requerem implementacao especifica nas proximas entregas. Nenhum sistema pode ser considerado 'compativel com qualquer ERP' sem APIs e homologacao.
