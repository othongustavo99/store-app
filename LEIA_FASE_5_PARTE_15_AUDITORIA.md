# Frequência40 — Store App ERP/PDV — Fase 5.15

## NOVO: Auditoria comercial de compatibilidade (offline)

Este ZIP é **incremental** e pressupõe as Fases 1 a 5.14 já aplicadas. Ele adiciona apenas a pasta `backend/connectors/assessment`, a documentação e este arquivo. Não substitui módulos antigos.

### O que entrega

- Checklist estruturado para avaliar o sistema comercial de um cliente **antes de prometer integração**.
- Identificação do caminho: Omie, Bling, Olist, CSV assistido, API que exige adaptador ou software fechado.
- Apontamento de lacunas de escopo: produto com variações nos conectores iniciais, depósitos múltiplos, estoque fracionário, frete, descontos, pagamento misto e integração fiscal.
- Relatórios locais em texto, JSON ou Markdown, com bloqueios, evidências pendentes e parecer.
- Gate opcional por código de saída para interromper avanço ao piloto ou revisão de produção quando o perfil não cumprir os requisitos.

### Instalação no Windows

1. Faça commit/backup do projeto e não coloque perfis de clientes reais no Git.
2. Extraia o ZIP na raiz de `loja_roupas`, preservando as pastas.
3. No PowerShell, a partir da raiz:

```powershell
cd backend
node --test connectors\assessment\test\assessment.test.mjs
node connectors\assessment\cli.mjs --input connectors\assessment\example_bling.json
node connectors\assessment\cli.mjs --input connectors\assessment\example_csv.json --format json
```

Exemplo de relatório Markdown:

```powershell
New-Item -ItemType Directory -Force connectors\assessment\reports | Out-Null
node connectors\assessment\cli.mjs --input connectors\assessment\example_bling.json --format md --output connectors\assessment\reports\exemplo.md
```

O comando **não sobrescreve** relatórios existentes. Para avaliar um cliente, copie o JSON de exemplo para `backend/connectors/assessment/private/cliente.json` e preencha apenas dados **não identificáveis** e a evidência técnica real.

### Railway

- Novas variáveis backend: **nenhuma**.
- Migration: **nenhuma**.
- Deploy backend/Flutter: **não necessário** para este patch isolado.
- Contas Omie/Bling/Olist: **não necessárias** para executar a auditoria offline.
- Não habilitar integrações reais por causa deste pacote.

### Validação e riscos

Executei a suíte específica do novo módulo com Node.js 22. A CLI gera parecer e não se conecta a nenhuma API. Não altera estoque, checkout, pagamentos ou notas fiscais.

**Não significa compatibilidade universal certificada.** O relatório é declaratório e não substitui homologação real. `productionAuthorized` é sempre `false`, inclusive quando todas as evidências são marcadas como confirmadas. O suporte real dependerá dos meios de integração autorizados por cada ERP/PDV.

Para detalhes e limites consulte `docs/INTEGRACOES_FASE_5_PARTE_15.md` e `backend/connectors/assessment/README.md`.
