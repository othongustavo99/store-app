# Frequencia40 / Store App — Fase 5.13
## Protecoes de fila, auditoria offline e roteiro de teste assistido

**Base obrigatoria:** Fases 1 a 5.12 aplicadas, inclusive as migrations anteriores. Este patch e INCREMENTAL e nao funciona isoladamente.

## O que foi modificado

1. `backend/connectors/shared/order_queue_core.mjs` (substituir):
   - compara o ID do pedido retornado pelo Store App com o ID solicitado pela fila;
   - impede que eventos repetidos do mesmo pedido, dentro de UM lote, provoquem duas tentativas de exportacao;
   - devolve o evento repetido a fila (`NACK retryable`) para novo ciclo, em vez de afirmar que foi exportado;
   - pedidos com identificacao divergente vao a revisao (`ORDER_SNAPSHOT_MISMATCH`).
2. `backend/connectors/shared/test/order_queue.test.mjs` (substituir): acrescenta testes de snapshot divergente, duplicidade e criacao incerta.
3. `backend/connectors/shared/commercial_safety.mjs` (novo): cenarios sinteticos para os 3 provedores, sem chamadas externas.
4. `backend/connectors/shared/commercial_safety_cli.mjs` (novo): relatorio offline em texto ou JSON.
5. `backend/connectors/shared/test/commercial_safety.test.mjs` (novo): valida o relatorio e a ausencia de credenciais.
6. `docs/INTEGRACOES_FASE_5_PARTE_13.md` (novo): roteiro de homologacao e criterios de aceite.
7. `LEIA_FASE_5_PARTE_13_SEGURANCA.md` (novo): este manual.
8. `MANIFESTO_FASE_5_PARTE_13.json` (novo): paths, operacoes, resultados de teste e limitacoes.

Nenhuma alteracao em Flutter, checkout, pagamentos, rotas HTTP, banco ou regras fiscais.

## Instalacao no Windows

1. Faca backup de banco (antes de qualquer deploy) e um commit de seguranca.
2. Descompacte o ZIP na **raiz de `loja_roupas`**, preservando pastas. Substitua somente os dois arquivos existentes listados acima; adicione os novos.
3. Abra PowerShell na raiz do projeto e rode:

```powershell
cd backend
npm ci
npm run build
npm test
node connectors/shared/commercial_safety_cli.mjs
node connectors/shared/commercial_safety_cli.mjs --json
cd connectors\shared
node --test
cd ..\bling
node --test
cd ..\omie
node --test
cd ..\olist
node --test
```

**Nota PowerShell:** execute `node --test` dentro de cada diretorio do conector (como mostrado acima). Os testes sao locais e usam dados ficticios.

O comando de auditoria deve retornar 12/12 verificacoes e sair com codigo 0. O JSON explicita `homologated:false`, `productionApproved:false`, `realErpCalls:0`.

## Railway / Deploy

- **Variaveis novas:** nenhuma.
- **Migration nova:** nenhuma.
- **Backend principal:** sem mudancas nesta fase; nao precisa deploy apenas por causa deste patch.
- **Workers de conectores:** atualizar o codigo do worker nas instalacoes que utilizarem fila automatizada, sempre em ambiente de homologacao primeiro.
- **Nao habilite** `F40_QUEUE_ENABLED`, `F40_APPLY`, `F40_ORDER_PROVIDER_CONTRACT_CONFIRMED` nem `ENABLE_EXTERNAL_INTEGRATIONS` em producao so para testar esta entrega.
- Se ainda nao existe conta de cliente ou conector em operacao, basta versionar os arquivos. Nenhuma conta ERP e necessaria para os testes OFFLINE.

## Interpretacao dos novos eventos

- `ORDER_SNAPSHOT_MISMATCH`: identificador retornado pela API nao corresponde ao ID do evento; requer investigacao; nenhum POST ao ERP.
- `QUEUE_DUPLICATE_ORDER_IN_BATCH`: outro evento do mesmo pedido ja foi tentado neste lote; o excedente volta a fila para ser reavaliado em novo ciclo; nenhum segundo POST no mesmo lote.
- Os erros de criacao incerta mantem tratamento de conciliacao manual; **nao** reenvie uma venda de forma cega.

## Limites e testes pendentes

Esta fase nao e prova de compatibilidade com todos os ERPs ou PDVs. Nao testa APIs reais, OAuth real, impressoras, NF-e/NFC-e, regras financeiras, impostos ou operacoes de uma loja. As regras de devolucao, cancelamento e financeiro continuam requerendo mapeamento e homologacao por fornecedor.

**Evidencia executada neste ambiente:** 123 testes Node.js de conectores aprovados, sendo 12 verificacoes no relatorio offline. Os testes sao simulados. `npm run build` do backend completo ficou bloqueado por dependencias `@types/*` incompletas neste container (TS2688); nenhum arquivo TypeScript do backend foi alterado por este patch. Repetir `npm ci`, `npm run build`, `npm test` no seu PC antes do commit/deploy.

Leia o roteiro em `docs/INTEGRACOES_FASE_5_PARTE_13.md` para a homologacao real de cada cliente.
