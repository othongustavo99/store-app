# Frequencia40 | Bling API V3 -> Store App | Fase 5 Parte 2

Conector assistido para **produtos simples, SKU, preco e saldo fisico TOTAL**, com OAuth 2.0 Authorization Code, JWT e refresh token rotativo. **Preview e padrao**. Nunca envia pedidos ao Bling, nao gera notas e nunca publica produtos automaticamente. Nao e homologado para uso comercial ate teste com conta e operacoes reais.

## Pre-requisitos

- Fases 1-4 do Store App aplicadas, migrations 019-022 verificadas em PostgreSQL de homologacao.
- Node.js 22+ (`node --version`). O conector **nao requer npm install**.
- No Bling, criar aplicativo na Area do Integrador com escopos de leitura de produtos e estoque. Em caso de alteracao dos escopos, autorizacoes podem ser revogadas.
- Obter `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET` e cadastrar exatamente `BLING_REDIRECT_URI` nas configuracoes do aplicativo. **Nao enviar tokens no chat ou no GitHub.**
- Gerar credencial Store App pelo OWNER da loja usando `POST /v1/stores/{storeId}/integrations` com corpo:

```json
{"name":"Bling Produtos","provider":"bling","catalogAuthority":true,"stockAuthority":false,"orderAuthority":false,"customerDataAccess":false}
```

Quando for sincronizar estoque, crie/autorize uma integracao com `stockAuthority:true`, respeitando a regra de uma autoridade de estoque por loja. Nunca sincronize dois ERPs como autoridade simultanea.

## Configurar (Windows PowerShell)

Na raiz do projeto `loja_roupas`:

```powershell
cd backend\connectors\bling
node --test
```

Crie uma pasta protegida FORA do Git, por exemplo `C:\F40-Integracoes\cliente001\bling\` (nao publique seu conteudo). Defina no seu terminal:

```powershell
$env:BLING_CLIENT_ID="CLIENT_ID_DO_APP"
$env:BLING_CLIENT_SECRET="CLIENT_SECRET_DO_APP"
$env:BLING_REDIRECT_URI="http://127.0.0.1:8788/callback"
$env:F40_BLING_TOKENS_FILE="C:\F40-Integracoes\cliente001\bling\tokens.json"
$env:F40_BLING_CONFIG="C:\F40-Integracoes\cliente001\bling\settings.json"
```

O `BLING_REDIRECT_URI` acima e apenas **exemplo**; o Bling precisa aceitar e ter cadastrada exatamente essa URL. O conector nao registra callback por voce.

### Autenticar pelo navegador

**Opcao recomendada para homologacao local:** se o Bling permitir URL loopback HTTP cadastrada:

```powershell
node oauth.mjs listen
```

O comando abre listener local, mostra URL para autorizar, recebe o callback e troca o code antes que expire. Ele fecha ao terminar ou apos 5 minutos. O servidor escuta apenas `127.0.0.1`/`localhost` na porta definida.

**Opcao manual alternativa** para callback HTTPS ja cadastrado:

```powershell
node oauth.mjs start
node oauth.mjs finish
```

Autorize no navegador imediatamente apos `start`. Na etapa `finish`, cole a **URL completa recebida do Bling** no prompt, nao no argumento do processo. O codigo OAuth dura cerca de **30 segundos**: se expirar, reinicie o fluxo. Em producao, substitua esta etapa manual por um callback HTTPS hospedado e validado.

`oauth.mjs refresh` renova manualmente se necessario; `sync.mjs` ja renova o access token automaticamente antes de expirar e apos um 401. O `refresh_token` rotaciona, portanto precisa de **arquivo persistente, com backup e acesso restrito**, nunca variavel de ambiente estatica sem mecanismo de atualizacao. No Windows, restrinja as ACLs NTFS da pasta. Em ambiente de producao, prefira cofre de segredos/armazenamento criptografado e uma instancia unica de renovacao por loja.

## Selecionar produtos

Copie `settings.example.json` para `settings.json` na pasta protegida e preencha:

- `categoryId`: UUID de uma categoria ATIVA da loja. Consulte `GET /v1/external/catalog/categories` com o token de integracao.
- `productIds`: lista explicita dos IDs internos numericos de produtos do Bling (max. 200 por execucao). **Nunca importa todo o cadastro automaticamente**.
- `syncStock`: `false` inicialmente.
- `stockSource`: somente `TOTAL` (saldo fisico total, nao saldo virtual). Para varias lojas/depositos, exige mapeamento separado e nao pode ser usado indiscriminadamente.
- `variants`: cor e tamanho padrao para produtos simples; **nao** e parser de grades do Bling.

Produto com `tipo` diferente de `P` ou `formato` diferente de `S` (variacoes/composicao) e recusado, assim como GTIN invalido, SKU invalido, preco com mais de duas casas ou estoque fracionario. Produtos criados no Store App permanecem em **DRAFT** ate revisao e publicacao manual; itens ja publicados permanecem no seu status atual.

Produtos com SKU/GTIN que ja existam no Store App exigem **mapeamento previo**, caso contrario o backend retornara conflito 409. A associacao usa `externalProductId` e `externalVariantId` baseados no **ID interno do Bling**, nao em nome ou SKU alteravel.

## Teste seguro: PREVIEW

```powershell
node sync.mjs
```

Consulta os dados do Bling e mostra IDs, SKU, preco em centavos e, se solicitado, estoque. **Nao altera o Store App**. O preview funciona sem token do Store App.

## Aplicacao controlada (somente homologacao inicialmente)

Configurar adicionalmente:

```powershell
$env:F40_API_URL="https://SUA-API-DE-HOMOLOGACAO.up.railway.app/"
$env:F40_INTEGRATION_TOKEN="F40I_GERADO_PELA_LOJA"
$env:F40_STATE_FILE="C:\F40-Integracoes\cliente001\bling\sync-state.json"
$env:F40_APPLY="CONFIRMO_SINCRONIZACAO"
node sync.mjs --apply
```

**Importante:** o token da integracao segue formato `f40i_...` (43 caracteres base64url apos prefixo); a linha acima e somente placeholder. Configure `ENABLE_EXTERNAL_INTEGRATIONS=true` no backend **somente apos migracoes e testes de homologacao**.

Se depois for sincronizar estoque, ative `syncStock:true` e crie uma credencial com autoridade de estoque. A API respeita reservas (`reserved`) e rejeita snapshots que causem estoque fisico menor que as reservas. Uma operacao rejeitada aparece na lista de erros, **nao** pode ser ignorada nem retrabalhada manualmente como se tivesse dado certo.

O estado `sync-state.json` preserva IDs e versoes para replays. O arquivo nao pode ser apagado sem reconciliar as versoes atuais do banco. Existe `.lock` para bloquear duas execucoes simultaneas; remova um lock orfao somente depois de verificar que nao ha outro processo em execucao.

## Limites e homologacao

- Apenas Bling -> Store App; **sem** integracao de pedidos, clientes, faturamento, NFe/NFCe ou conciliacao de pagamentos.
- Apenas produtos simples e estoque fisico total inteiro (nao multi-deposito).
- Sem webhook receptor nesta entrega; sincronizacao e pontual por IDs informados. Agendamento, fila de eventos e reconciliacao automatica ainda sao etapas futuras.
- A API Bling tem limite documentado de ate 3 requisicoes/segundo. O cliente respeita intervalo minimo e retenta `429/5xx` em consultas GET.
- Sem API real/conta de cliente/testes de homologacao ate aqui. Testes automatizados com HTTP e arquivos simulados, sem gravacao real na Railway.
- **Nunca ativar em cliente pagante sem testar OAuth, SKU/GTIN, saldo, conflitos e rollback em ambiente de homologacao e confirmar as condicoes de uso/homologacao do Bling.**

## Documentacao oficial (consultada em 19/11/2026)

- https://developer.bling.com.br/aplicativos
- https://developer.bling.com.br/migracao-jwt
- https://developer.bling.com.br/bling-api
- https://developer.bling.com.br/referencia
- https://developer.bling.com.br/limites
- https://developer.bling.com.br/webhooks
