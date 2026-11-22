# Frequência40 Store App — Fase 5.19

## Entrega

**Dossiê comercial e operacional de implantação por cliente (100% offline).**
É um complemento às Fases 5.10–5.18, não uma substituição. Consolida a
avaliação F5.15 com evidências locais dos pedidos CSV F5.16 e da conciliação
humana F5.17 (inclusive retorno auxiliar F5.18).

## Arquivos

Todos os arquivos do ZIP são **novos**; adicionar sem apagar pastas existentes.
O manifesto `MANIFESTO_FASE_5_PARTE_19.json` relaciona os caminhos exatos.

## Instalação

1. Faça commit/backup de segurança do projeto.
2. Extraia este ZIP na raiz `loja_roupas`, preservando os diretórios.
3. Abra PowerShell nessa raiz e execute:

```powershell
cd backend
node --test connectors\deployment\test\rollout.test.mjs
node connectors\deployment\cli.mjs --demo
node connectors\deployment\cli.mjs --input connectors\deployment\deployment.example.json --format md
```

Para testar todos os conectores (PowerShell):

```powershell
Get-ChildItem .\connectors -Recurse -Filter *.test.mjs |
  Where-Object { $_.DirectoryName -match '[\\/]test$' } |
  ForEach-Object { node --test $_.FullName; if ($LASTEXITCODE -ne 0) { throw "Teste falhou: $($_.FullName)" } }
```

Para trabalhar em um cliente real, consulte
`backend/connectors/deployment/README.md` e use uma pasta **fora do Git** com
os dados e evidências autorizados. Há exemplos separados para API e CSV.

## Railway

- **Novas variáveis:** nenhuma.
- **Nova migration:** nenhuma.
- **Atualização do backend principal:** nenhuma.
- **Flutter:** sem alterações.
- **Conta de fornecedor:** não é necessária para executar a demonstração.
- **Processos de produção:** permanecem desativados por padrão.

## Importante

O parecer `HUMAN_RELEASE_REVIEW_REQUIRED` não significa aprovado ou homologado:
`productionAuthorized` é sempre `false`. O dossiê não autentica retornos do
ERP, não cria pedidos, não modifica arquivos do checkout e não libera reenvios.
Mesmo com relatório de importação humana, confirme pedidos e totais diretamente
no ERP e preserve o procedimento de rollback/contingência.

A ferramenta utiliza Node.js sem dependências extras, mas depende dos módulos
F5.15–F5.18 aplicados. O teste com ERPs reais e com seu Windows permanece
necessário antes de qualquer proposta de compatibilidade específica.
