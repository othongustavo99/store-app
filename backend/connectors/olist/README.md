# Frequencia40 | Olist/Tiny ERP V3 -> Store App

Conector **assistido** para produtos simples da **API V3** do Olist/Tiny. So faz consultas GET no ERP. Transforma cadastro/preco em payload para as rotas externas do Store App; opcionalmente envia saldo fisico total (inteiro) pela API de estoque da Frequencia40. A primeira execucao e sempre **PREVIEW**.

> NAO HOMOLOGADO em uma conta real. Nenhum pedido, cliente, nota fiscal, devolucao ou pagamento e exportado nesta fase. Nao ativar em producao sem testar OAuth e sincronizacao em loja piloto.

## Pre-requisitos

- Node.js 22+ (`node -v`), sem `npm install` neste conector.
- Store App com Fases 1-4, migrations `019` a `022` aplicadas e testadas, e API externa habilitada **somente em homologacao**.
- Olist/Tiny API V3: plano habilitado e extensao **Gestao de Aplicativos**. Na documentacao publicada em 15/10/2026, cada seller precisa criar seu proprio **aplicativo privado** (limite declarado de 5 aplicativos por conta), com `client_id`, `client_secret`, `redirect_url` e permissoes de leitura dos modulos **Produtos** e **Estoque** (quando necessario).
- Criar no Store App uma integracao com `provider` apropriado (ex.: `olist`) e `catalogAuthority:true`. Para sincronizar estoque, essa integracao tambem devera ter `stockAuthority:true` e ser a unica autoridade de estoque da loja. Anote o token `f40i_...` apenas em armazenamento seguro.

## Configuracao local de homologacao - PowerShell

```powershell
cd backend\connectors\olist
node --test
```

Crie uma pasta privada por cliente, **fora do Git**, por exemplo `C:\F40-Integracoes\cliente001\olist\`, com permissoes restritas e armazenamento persistente. Nunca publique `client_secret`, access/refresh token, arquivos de estado, callback URL com `code`, ou tokens `f40i_...`.

```powershell
$env:OLIST_CLIENT_ID='CLIENT_ID_DA_CONTA'
$env:OLIST_CLIENT_SECRET='CLIENT_SECRET_DA_CONTA'
$env:OLIST_REDIRECT_URI='https://exemplo.com/callback-olist'
$env:F40_OLIST_TOKENS_FILE='C:\F40-Integracoes\cliente001\olist\tokens.json'
$env:F40_OLIST_CONFIG='C:\F40-Integracoes\cliente001\olist\settings.json'
```

`OLIST_REDIRECT_URI` deve ser **exatamente** a URI ja cadastrada no aplicativo privado do Tiny. Nao pressupor que a plataforma aceite redirect HTTP local. O CLI `start` gera `state` aleatorio e URL de autorizacao; `finish` recebe a URL de callback pelo prompt interativo. Para uso comercial, criar callback HTTPS no servidor e cofre de tokens. O codigo de autorizacao e de uso unico.

```powershell
node oauth.mjs start
# Autorize no navegador e capture a URL completa no endpoint de callback cadastrado.
node oauth.mjs finish
# Cole a URL recebida no prompt. Nao use codigo OAuth em argumentos do processo.
```

A aplicacao salva access e refresh token em arquivo. `node oauth.mjs refresh` tenta renovar manualmente. `node sync.mjs` renova automaticamente quando necessario. **Tokens de refresh podem ser rotacionados**; o arquivo nao pode ser efemero. Somente um processo deve usar estes arquivos para uma loja, para evitar refresh concorrente.

## Selecionar produtos

Copie `settings.example.json` para `settings.json` na pasta privada. Preencha:

- `categoryId`: UUID de uma categoria ativa da loja. Para listar: `GET /v1/external/catalog/categories`.
- `productIds`: IDs internos numericos de produtos selecionados do Olist/Tiny, maximo 200 por execucao. Nenhuma importacao geral automatica ocorre nesta fase.
- `variants`: descricao de cor/tamanho para produto **simples**, nao faz expansao de grades.
- `syncStock`: deixe `false` inicialmente; somente apos validar uma unica autoridade de estoque e as reservas do Store App.
- `stockSource`: somente `TOTAL`, que representa o campo `saldo` da consulta `GET /estoque/{idProduto}`. Nao usar `reservado` nem `disponivel` como saldo fisico!

**Rejeicoes intencionais:** kit, fabricado, materia-prima, produto pai/variacao, SKU ausente ou invalido, GTIN incorreto, preco nao positivo ou com mais de 2 casas, estoque fracionario, estoque em varios depositos. Produtos com SKU existente sem mapeamento previo retornam conflito do Store App (409): nunca vincular por nome ou similaridade.

## Preview (sem escrita)

```powershell
node sync.mjs
```

Requer apenas OAuth e `F40_OLIST_CONFIG`; nao exige token de Store App. Consulta Olist/Tiny e mostra resumo de SKU, preco e, se `syncStock` ativado, o saldo.

## Aplicar em homologacao

Use somente apos conferir o preview, estoque e mapeamentos. Requer a integracao do Store App com permissoes de catalogo e, se aplicavel, estoque.

```powershell
$env:F40_API_URL='https://SUA-API-DE-HOMOLOGACAO.up.railway.app/'
$env:F40_INTEGRATION_TOKEN='COLE_O_TOKEN_PRIVADO_f40i'
$env:F40_STATE_FILE='C:\F40-Integracoes\cliente001\olist\sync-state.json'
$env:F40_APPLY='CONFIRMO_SINCRONIZACAO'
node sync.mjs --apply
```

As importacoes persistem `eventId`, versao e IDs externos para retentativa identica. O arquivo `sync-state.json` **nunca deve ser excluido** sem reconciliacao das versoes registradas no backend. O lock impede duas instancias simultaneas no mesmo arquivo. Produto novo entra como DRAFT e deve ser publicado manualmente quando revisado. A sincronizacao de estoque so altera `onHand` via rota especifica; as reservas do checkout permanecem sob controle do Store App. Caso o saldo informado seja menor que reservas, o backend rejeita a mudanca.

## Railway / escopo

**Sem migrations ou variaveis novas no backend** nesta entrega. Se precisar executar o conector na Railway, use **servico separado por cliente** ou armazenamento seguro isolado e persistente; arquivo efemero do container nao e adequado para tokens e estado. Este pacote e um executor manual; nao instala cron nem worker no backend.

**Limitacoes:** somente Olist/Tiny -> Store App, produtos simples por IDs informados, estoque total de no maximo um deposito, sem sincronizacao reversa de pedidos, sem NF-e/NFC-e, sem webhook, sem multi-loja nem sincronizacao automatica. Requer homologacao com ERP real e atencao ao risco de estoque duplo enquanto pedidos do Store App nao forem enviados/reservados no ERP.

## Referencias verificadas em 19/11/2026

- Oficial: https://ajuda.olist.com/pt_BR/hubs-e-plataformas-via-api/aplicativos-api-v3-configuracoes-e-utilizacao
- Swagger oficial: https://erp.tiny.com.br/public-api/v3/swagger/index.html
- Espelho consultavel de especificacao: https://skmtc.dev/olist/apis/olist-erp-api-v3 (GET `/produtos/{idProduto}` e GET `/estoque/{idProduto}`)
- Olist/Tiny OAuth endpoints para homologacao: `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth` e `.../token`. Confirmar autorizacao com conta real antes de uso comercial.
