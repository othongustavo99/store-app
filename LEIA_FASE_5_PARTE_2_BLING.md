# Frequencia40 | Store App | Fase 5 Parte 2 — BLING

## APLICACAO DO PATCH

1. Faca um commit/backup do codigo antes da atualizacao.
2. Extraia este ZIP na **raiz** do projeto `loja_roupas`, preservando a estrutura de pastas.
3. Este ZIP adiciona **somente novos arquivos**: `backend/connectors/bling/*` e `docs/INTEGRACOES_FASE_5_PARTE_2_BLING.md`. Nao substitui migrations, Flutter, backend/src ou o conector Omie.
4. No PowerShell:

```powershell
cd backend
npm ci
npm run build
npm test
cd connectors\bling
node --test
```

5. Para entender o OAuth e configurar um cliente futuro, leia `backend/connectors/bling/README.md`.

## RAILWAY

- **Nenhuma variavel nova no backend Store App** e **nenhuma migration nova** nesta entrega. Preservar as configuracoes das Fases 1-4.
- O Bling fica em conector separado. A configuracao por cliente sera feita ao contratar, sem expor segredos no Flutter nem no repositorio.
- Variaveis do conector quando houver cliente: `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`, `BLING_REDIRECT_URI` (OAuth), `F40_BLING_TOKENS_FILE` (tokens rotativos), `F40_BLING_CONFIG`, `F40_API_URL`, `F40_INTEGRATION_TOKEN`, `F40_STATE_FILE` e `F40_APPLY` (ativacao confirmada).
- `F40_BLING_TOKENS_FILE` e `F40_STATE_FILE` precisam de armazenamento persistente e privado em ambiente de producao; um processo separado por cliente ou isolamento equivalente.
- Nao coloque a aplicacao em producao sem homologacao em conta Bling real e banco PostgreSQL de teste. Tokens e estado precisam de backups, controle de acesso e politica de recuperacao.

## VERIFICACOES REALIZADAS

- `node --test` do novo conector: testes locais executados e aprovados com HTTP simulado.
- Nenhuma alteracao nos arquivos do backend existente; por isso a compilacao e os testes do backend devem ser executados no seu projeto apos aplicar o patch.
- **Nao executado**: emissao de pedidos, configuracao OAuth em uma conta Bling real, homologacao multi-deposito, comunicacao contra Railway em producao.

## O QUE AINDA NAO FOI IMPLEMENTADO

Envio de pedidos, conciliacao fiscal, recebimento automatico por webhook, grades de produtos e homologacao comercial. Nunca vender como 'integracao Bling completa' antes dessas etapas.
