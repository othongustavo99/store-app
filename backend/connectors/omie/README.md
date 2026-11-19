# Conector Omie -> Store App | Frequencia40 | Fase 5

Conector **assistido**, Node.js 22+, sem dependencias npm. Ele consulta o Omie por API oficial e consegue aplicar **produtos simples, precos e (opcionalmente) estoque fisico** ao Store App, usando as APIs das fases anteriores. **Nao envia pedidos ao Omie, nao cria cliente, nao emite nota, nao implementa refresh de token e nao e homologacao comercial.**

## Preparacao

1. Aplicar Fases 1-4, migrations 019-022 e realizar backup de banco. Deixar `ENABLE_EXTERNAL_INTEGRATIONS=true` apenas apos homologacao.
2. Um usuario OWNER cria uma integracao com `POST /v1/stores/{storeId}/integrations`, corpo:
   `{"name":"Omie Estoque e Catalogo","provider":"omie","catalogAuthority":true,"stockAuthority":true,"orderAuthority":false,"customerDataAccess":false}`.
   Para fase inicial apenas catalogo, `stockAuthority` pode ser `false`; se for usar estoque mais tarde, precisara criar uma integracao com autoridade de estoque adequadamente (so uma ativa por loja). **Nunca compartilhe os tokens**.
3. Use `GET /v1/external/catalog/categories` com `Authorization: Bearer <F40_INTEGRATION_TOKEN>` para obter o UUID da categoria ativa.
4. Copie `settings.example.json` para um arquivo local `settings.json` (nao versionar). Troque `categoryId`, `productIds` pelos IDs *internos de API* do Omie e `warehouseId` pela localizacao de estoque real. `syncStock` permanece `false` ate conferir a primeira importacao.
5. Configurar token de aplicativo Omie conforme o portal oficial. O **TOKEN DE APLICATIVO** nao e a chave `app_key` do modelo legado; o conector atual usa `Authorization: Bearer` e nao renova tokens automaticamente.

## PowerShell / Windows

Na raiz do projeto:

```powershell
cd backend\connectors\omie
$env:OMIE_APP_TOKEN="COLE_O_TOKEN_NO_TERMINAL_LOCAL_NAO_NO_CHAT"
$env:F40_OMIE_CONFIG="C:\caminho\seguro\settings.json"
node sync.mjs
```

A chamada acima faz **APENAS PREVIA**, consulta Omie e mostra IDs, SKU e valores, sem modificar o Store App.

Para aplicar num **ambiente de homologacao** primeiro:

```powershell
$env:F40_API_URL="https://sua-api-de-homologacao.up.railway.app/"
$env:F40_INTEGRATION_TOKEN="COLE_SEU_TOKEN_F40I_LOCALMENTE"
$env:F40_STATE_FILE="C:\caminho\seguro\omie-sync-state.json"
$env:F40_APPLY="CONFIRMO_SINCRONIZACAO"
node sync.mjs --apply
```

- Estado deve morar em **pasta persistente**, com backup, fora do Git e acesso limitado. O programa cria um `.lock` para impedir dois processos simultaneos. Em caso de queda abrupta, remova o `.lock` somente depois de confirmar que nenhum processo esta rodando.
- Para sincronizar saldo fisico, altere o `syncStock` para `true` **depois** de validar a categoria, os vinculos de variantes, o local de estoque no Omie e a ausencia de conflitos de reserva. O saldo de Omie `fisico` vai para o Store App `onHand`; `reserved` e administrado pelo Store App e nao e sobrescrito. Na divergencia, a API bloqueia valores inferiores as reservas.
- `productIds` e lista explicita (ate 200 por execucao). A rotina **nunca importa todo o cadastro automaticamente**; os produtos novos entram como **DRAFT** (nao publicados) ate revisao de fotos e informacoes.
- Se o Store App ja tiver o produto, estabeleca primeiro os mapeamentos por API (`/v1/external/mappings/products/{productId}` e `/v1/external/mappings/variants/{variantId}`) ou a importacao ira conflitar quando encontrar SKU/GTIN repetido. O identificador externo usado e o `codigo_produto` interno do Omie, nao o campo editavel `codigo`/SKU.
- Variações complexas do Omie, precos por tabela, unidades fracionarias, kits, produtos com varios depositos, dados invalidos e ausencia de GTIN valido devem ser tratados por mapeamento/homologacao adicionais. O conector **falha de forma explicita**, nao converte silenciosamente.
- Estado `omie-sync-state.json` guarda fingerprint, versao crescente e `eventId`. **Nao apagar / compartilhar entre lojas**. No erro temporario, usa o mesmo `eventId` ao tentar novamente. Uma nova versao local sem estado anterior pode ser rejeitada por anti-regressao no Store App.
- Token do Omie expira conforme regras do provedor. Nao existe refresh automatico neste conector. Rotina agendada ou ativacao em producao exige gestao segura e renovacao de tokens, tratamento de limites, observabilidade e homologacao com conta real.

## Testar sem Omie real

```powershell
node --test
```

Os testes usam provedores simulados e nao realizam consultas pela internet. Nao coloque segredos nos testes nem faca commit de `settings.json`, `*-state.json`, `.lock` ou arquivos `.env`.

## Fontes oficiais consultadas em 19/11/2026

- https://api.omie.com.br/docs/apis/geral/produtos
- https://api.omie.com.br/docs/apis/estoque/consulta
- https://api.omie.com.br/docs/apis/portal/autenticacao

## Estado de homologacao

- [x] Cliente HTTP estrito; rotas de consulta Omie allowlist; sem credenciais em logs.
- [x] Conversao de SKU/GTIN/preco e rejeicao de saldo invalido.
- [x] Modo preview e opt-in duplo para gravacao.
- [x] Arquivo de estado atomico, reuso do ID em replay, exclusao mutua.
- [x] Testes automatizados com mocks locais.
- [ ] Fluxo real contra conta Omie de homologacao.
- [ ] Validar autenticação/refresh com cliente real e limites de chamada.
- [ ] Testar migration 019-022 em banco PostgreSQL real e conciliacao por varios depositos.
- [ ] Pedidos Store -> Omie, devolucoes, faturamento e dados fiscais.
- [ ] Homologacao e aprovacao comercial pelo fornecedor, quando aplicavel.
