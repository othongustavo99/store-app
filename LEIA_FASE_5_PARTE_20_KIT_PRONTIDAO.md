# Frequência40 Store App — Fase 5.20
## Kit offline de prontidão comercial: ERP externo, CSV e futuro ERP próprio

**Objetivo definido nesta fase:** manter o sistema tecnicamente organizado para iniciar a
implantação quando um cliente real contratar o Store App. **Não fazer testes nem homologação
com fornecedores ou clientes agora.** Também não criar credenciais, empresas fictícias no banco,
ativar workers, emitir documentos fiscais ou executar migrations.

### O que este ZIP faz

Cria o módulo local `backend/connectors/onboarding/`:

- `--doctor`: checa a presença de **18 arquivos-fonte** do conjunto de integrações/migrations já planejados (019–024). Verifica somente presença, não execução nem operação real.
- `--init`: cria um **diretório NOVO** com perfil de auditoria conservador (Fase 5.15), parecer, guia de implantação e handoff operacional, mais um manifesto de integridade SHA-256.
- `--check`: verifica o kit gerado, inclusive hashes, nomes, modelo de dados e ausência de alterações indevidas. Não aprova produção.
- Oferece cinco modalidades: `bling`, `omie`, `olist`, `csv` e `f40-erp`.
- `f40-erp`: **modelo de planejamento**, não um ERP nem um conector pronto. Não gera IDs/tokens falsos ou supostas credenciais.
- Os `false` do questionário de operações são placeholders: não representam requisitos de um cliente confirmado.

### Aplicação

1. Comite tudo que já foi aplicado até a Fase 5.19.
2. Extraia o ZIP na raiz `C:\Users\othon\Documents\store\loja_roupas`, mantendo as pastas.
3. Os arquivos novos não substituem nem modificam arquivos existentes.
4. Na raiz `loja_roupas`, rode:

```powershell
cd backend
node connectors\onboarding\cli.mjs --doctor
node --test connectors\onboarding\test\onboarding.test.mjs
```

Se desejar conferir todos os conectores (sem APIs externas):

```powershell
node --test connectors\assessment\test\assessment.test.mjs
node --test connectors\deployment\test\rollout.test.mjs
node --test connectors\csv\test\csv.test.mjs
node --test connectors\csv\test\order_export.test.mjs
node --test connectors\csv\test\order_reconcile.test.mjs
node --test connectors\csv\test\order_ack_import.test.mjs
```

### Criar um kit demonstrativo

Ainda dentro de `backend`:

```powershell
node connectors\onboarding\cli.mjs --init --mode bling --alias loja_demo --output .\connectors\onboarding\kit_loja_demo
node connectors\onboarding\cli.mjs --check .\connectors\onboarding\kit_loja_demo
```

Para apenas deixar uma trilha de preparação do ERP/PDV próprio:

```powershell
node connectors\onboarding\cli.mjs --init --mode f40-erp --alias erp_futuro --output .\connectors\onboarding\kit_erp_futuro
node connectors\onboarding\cli.mjs --check .\connectors\onboarding\kit_erp_futuro
```

**Os kits são amostras sem cliente.** O comando `--init` não sobrescreve pastas existentes.
Evite comitar pastas de clientes reais; mantenha qualquer dado ou credencial fora dos repositórios.

### Resultado esperado de `--doctor`

`F40 DOCTOR OFFLINE: 18/18 arquivos presentes` se todos os patches anteriores estiverem realmente aplicados.
Se faltar algo, o CLI informa `FALTA` e sai com código 3. Isso pode indicar uma fase não aplicada
ou estrutura local diferente. **18/18 não significa backend compilado, Railway migrada,
cliente homologado ou integração autorizada.**

### Railway, banco e Flutter

- Variáveis novas: **nenhuma**.
- Migration nova: **nenhuma**.
- Deploy de backend: **não necessário**.
- Flutter: **nenhuma alteração**.
- Integrações de produção: devem continuar desativadas até o contrato e a homologação real.
- A verificação `--doctor` não confere a execução das migrations no PostgreSQL.

### Limitações e próxima fase

O kit facilita a preparação offline, mas não implementa um ERP/PDV próprio, não amplia as
operações dos adaptadores Bling/Omie/Olist e não substitui a homologação. Nenhum fornecedor
é automaticamente declarado compatível. Quando for criar o ERP próprio, a integração precisará
ser codificada, testada e conciliada usando a API por loja e padrões de idempotência já definidos.

Na sequência podemos trabalhar na **estrutura interna do ERP/PDV próprio** ou continuar
a organização técnica do Store App, sem envolver um cliente real até haver contrato.
