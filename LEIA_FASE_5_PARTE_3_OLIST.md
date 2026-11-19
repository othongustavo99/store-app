# FREQUENCIA40 - STORE APP - FASE 5.3 / OLIST (TINY) ERP

## Atualizacao incremental

O patch contem apenas arquivos NOVOS na pasta `backend/connectors/olist/`, esta documentacao e o guia em `docs/`. **Nao substitui** arquivos Flutter, do backend principal, `package.json` nem migrations. Preserva as fases anteriores Omie e Bling.

## Instalacao no Windows

1. Confirme commit/backup antes de modificar o projeto.
2. Extraia este ZIP na raiz da pasta `loja_roupas`, mantendo a estrutura.
3. No terminal do VS Code, a partir da raiz:

```powershell
cd backend
npm ci
npm run build
npm test
cd connectors\olist
node --test
```

Alternativamente, se ja estiver em `backend`, basta `cd connectors\olist`.

## Railway

**Nenhuma variavel nova** no serviço backend nesta fase. **Nenhuma migration nova**. O Olist/Tiny e configurado em um **conector separado**, apenas para o cliente que usa esse ERP; as credenciais nao devem ir ao app Flutter nem ao repositorio.

## Quando houver cliente

Seguir `backend/connectors/olist/README.md` para criacao do aplicativo privado na conta Olist/Tiny (OAuth), permissao de produtos/estoque, tokens, selecao de produtos, modo PREVIEW e aplicacao em homologacao. Cuidado: `OLIST_REDIRECT_URI` precisa estar cadastrado exatamente na conta do ERP. Nao ha conta criada ou autorizada neste pacote.

## Estado real da entrega

Conector com testes HTTP simulados concluídos, NAO homologado em conta real. Este patch *nao* envia pedidos do Store App ao Olist/Tiny e *nao* equivale a integracao comercial completa. Necessita testes com produtos reais, saldo, SKU, permissoes e estado de pedidos antes de ser oferecido como integrado a clientes.
