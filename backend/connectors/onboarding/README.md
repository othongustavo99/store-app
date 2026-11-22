# Frequência40 — Fase 5.20: Kit de prontidão comercial offline

Ferramenta sem rede, sem banco de dados, sem tokens e sem alterações nos pedidos ou no aplicativo.
Cria um **modelo reutilizável** para preparar futuramente uma implantação real — inclusive
uma modalidade **planejada** para o ERP/PDV próprio, que AINDA NÃO ESTÁ IMPLEMENTADO.

## Comandos (Windows PowerShell, a partir de `loja_roupas/backend`)

```powershell
node connectors\onboarding\cli.mjs --doctor
node connectors\onboarding\cli.mjs --init --mode bling --alias loja_demo --output .\connectors\onboarding\kit_loja_demo
node connectors\onboarding\cli.mjs --check .\connectors\onboarding\kit_loja_demo
node connectors\onboarding\cli.mjs --init --mode f40-erp --alias loja_futura --output .\connectors\onboarding\kit_erp_futuro
node --test connectors\onboarding\test\onboarding.test.mjs
```

Modos: `bling`, `omie`, `olist`, `csv`, `f40-erp`.

O `--doctor` verifica exclusivamente a **existência dos arquivos-fonte** de integrações e migrations
(019 a 024). Ele não compila Flutter/TypeScript, não valida o PostgreSQL nem testa APIs reais.
O `--init` cria um diretório novo, recusando sobrepor uma pasta existente. Gera perfil
conservador da auditoria (Fase 5.15), parecer, handoff e manifesto com hashes SHA-256.
Não gera credenciais nem UUIDs fictícios de loja ou integração. O `--check` detecta alteração,
remoção ou inclusão de arquivos no kit, sem aprovar produção.

Quando houver um contrato real, o kit de exemplo **não deve ser usado como evidência de homologação**.
Recrie a avaliação conforme o escopo, com IDs autênticos isolados, permissões mínimas,
testes com o fornecedor e conciliação assistida. Use o dossiê da Fase 5.19 nessa ocasião.

Se for necessário personalizar o questionário, gere um novo dossiê de avaliação pela
Fase 5.15; a edição manual de um kit já emitido invalida seu manifesto por design.

## Limites

- O conector inicial Bling/Omie/Olist precisa de homologação fornecedor a fornecedor.
- A modalidade CSV é assistida. Não há recebimento de pedidos em tempo real nem aceite automático.
- `f40-erp` NÃO possui conector ativo. É uma trilha de trabalho futuro para o ERP próprio.
- Nenhuma função deste módulo modifica `ENABLE_EXTERNAL_INTEGRATIONS` ou emite documentos fiscais.
- Os relatórios são modelos; não comprovam a operação de um cliente.

## Política de dados

Não coloque tokens, segredos, CPF, e-mail, contas bancárias ou dados de clientes dentro dos kits.
Use apenas aliases técnicos e guarde segredos no mecanismo seguro da implantação quando existir.
