# Frequência40 Store App — Fase 2: catálogo e preços de ERPs/PDVs

Base: Fase 1 aplicada, com migration `019_external_integrations.sql`.
Fase 2 adiciona SOMENTE `020_external_catalog_sync.sql`; não modifica migrations antigas.

> Uma API genérica não é um conector homologado. Cada ERP exige adaptador e autenticação próprios. Nenhum ERP específico foi conectado nesta entrega. Não habilitar em cliente real sem homologar no PostgreSQL de staging, carga e concorrência.

## Capacidades

- Uma integração com **`catalogAuthority:true`** por estabelecimento pode criar/atualizar produtos, variantes e preços; controle de catálogo independente de `stockAuthority`.
- IDs externos de produtos e variantes pertencem à combinação **loja + integração**. O app preserva IDs UUID internos estáveis.
- Importação de 1 produto ou lote de até 10 produtos, com até 40 variantes por produto; **transação única** por lote (falha = rollback integral).
- Código SKU normalizado para maiúsculas, GTIN opcional (8/12/13/14 dígitos, verificador GS1), preço em centavos, categoria local validada.
- Identificação idempotente por `eventId` UUID: payload idêntico retorna `idempotent:true`; evento com conteúdo diferente retorna HTTP 409.
- `sourceVersion` crescente para cada produto/integração impede sobrescrita por atualização antiga.
- O importador não altera `on_hand` nem `reserved`. Variantes novas entram com estoque **zero** até que a API de inventário receba saldo autorizado.
- A rotina de importação marca a origem dos eventos de catálogo; a integração que os gerou não recebe seus próprios eventos de volta. Outras integrações da loja podem recebê-los.
- Um ERP poderá reivindicar catálogo, estoque ou ambos; chaves de integração sempre ficam **apenas no servidor do adaptador**, nunca no Flutter.

## Criar credencial com autoridade de catálogo

Somente OWNER com token normal do Store App:

```http
POST /v1/stores/{storeId}/integrations
Authorization: Bearer <JWT_DO_PROPRIETARIO>
Content-Type: application/json

{"name":"ERP principal","provider":"generic","catalogAuthority":true,"stockAuthority":false}
```

O token secreto `f40i_...` é mostrado **apenas na criação**. Ele dá `catalog.write` além das permissões básicas. Se uma credencial foi criada na Fase 1 sem `catalogAuthority`, ela continua válida para seus escopos antigos. Para importar catálogo, crie outra integração autorizada pelo proprietário. Se já existe outra com autoridade de catálogo, revogue-a antes de criar a substituta.

## Endpoints — token da integração

| Método | Caminho | Escopo |
| --- | --- | --- |
| GET | `/v1/external/catalog/categories` | `catalog.read` |
| PUT | `/v1/external/mappings/products/{productId}` | `mapping.write` |
| POST | `/v1/external/catalog/products/upsert` | `catalog.write` |
| POST | `/v1/external/catalog/batch` | `catalog.write` |

Rotas da Fase 1 continuam funcionais (`/v1/external/events`, `/v1/external/catalog/variants`, `/v1/external/inventory/{variantId}`, `/v1/external/orders` etc.). Os endpoints de leitura do catálogo agora expõem `gtin` para variantes. Consulte `openapi_external_v1.yaml`.

### 1. Mapear categoria

```http
GET /v1/external/catalog/categories
Authorization: Bearer <TOKEN_F40I>
```

Escolha um `id` cujo status seja `ACTIVE`. O importador **não cria categorias automaticamente**; cada adaptador deve mapear as categorias do seu ERP para categorias locais válidas.

### 2. Importar produto com variantes

```http
POST /v1/external/catalog/products/upsert
Authorization: Bearer <TOKEN_F40I>
Content-Type: application/json

{
  "eventId":"cc39e71f-d65a-4fd1-8dfe-8cc870ba994a",
  "sourceVersion":1,
  "externalProductId":"ERP-PROD-140",
  "categoryId":"11111111-1111-4111-8111-111111111111",
  "name":"Camiseta premium",
  "description":"Malha de algodão",
  "images":["https://cdn.exemplo.com/camiseta.jpg"],
  "status":"PUBLISHED",
  "variants":[
    {"externalVariantId":"ERP-VAR-140-M","sku":"CAM-140-M","priceCents":"5990","gtin":"4006381333931","color":"Preto","size":"M","status":"ACTIVE"}
  ]
}
```

Substitua `categoryId` pelo UUID real da categoria desta loja. Os valores de GTIN e SKU no exemplo servem somente para demonstrar formato; use os códigos verdadeiros da loja e do ERP.

Resposta típica:

```json
{"externalProductId":"ERP-PROD-140","productId":"UUID_INTERNO","created":true,"idempotent":false}
```

Se o mesmo `eventId` for reenviado com o mesmo payload, `idempotent:true` e nenhuma segunda gravação é efetuada. Para uma alteração legítima, envie **novo `eventId`** e `sourceVersion` maior (2,3,4...). Não utilize horário de relógio local como número de versão sem garantir monotonicidade no ERP.

Para produto novo, `description` e `images` podem ser omitidos; nesse caso ele nasce `DRAFT`. Para publicar (`PUBLISHED`), é obrigatória pelo menos uma imagem HTTPS e uma variante ativa. Campos opcionais omitidos em produtos existentes mantêm seus valores, inclusive imagens e descrição. Variantes omitidas **não são excluídas**. O importador não arquiva ou apaga produtos automaticamente.

O cadastro deve informar `priceCents` positivo **em centavos**, para cada variante. Exemplos: `"5990"` representa R$59,90; nunca envie `59.90`. Não envie `onHand` nessa API: use exclusivamente a rota de inventário da Fase 1 (se houver `stockAuthority`).

As variantes sem cor/tamanho recebem, ao serem criadas, os valores padrão `Padrao` e `Unico`. Para setores diferentes de vestuário, configure um adaptador para preencher atributos de produto adequados na versão específica de cada segmento; a interface atual do Store App continua centrada em cor/tamanho.

### 3. Importar lotes

```http
POST /v1/external/catalog/batch
Authorization: Bearer <TOKEN_F40I>
Content-Type: application/json

{"products":[{...produto1...},{...produto2...}]}
```

O JSON real deve incluir os objetos completos do esquema `CatalogProductImport`, sem reticências. Máximo: 10 produtos por lote, 40 variantes por produto (há também limite HTTP atual de 64 KiB na API). **Um item inválido cancela todos**. Resposta: `results`, `applied`, `replayed`.

### 4. Associar um produto já cadastrado no aplicativo

Se a loja já possui um produto interno com mesmo SKU, **não faça importação criando outro produto**. O sistema não assume automaticamente que SKUs iguais representam o mesmo cadastro. Um operador deve confirmar a correspondência e registrar o mapeamento:

```http
PUT /v1/external/mappings/products/{productId}
Authorization: Bearer <TOKEN_F40I>
Content-Type: application/json

{"externalId":"ERP-PROD-140"}
```

Para variantes internas já existentes, utilize também o endpoint da Fase 1:

```http
PUT /v1/external/mappings/variants/{variantId}
Authorization: Bearer <TOKEN_F40I>
Content-Type: application/json

{"externalId":"ERP-VAR-140-M"}
```

Depois, uma importação com esses IDs atualiza produto/variante mapeados. Se outro produto/variante já usa o ID, SKU ou GTIN, a operação responde **409** e não altera os dados. Alterar IDs externos já mapeados exige reconciliação cuidadosa; não há ferramenta automática de remapeamento de propriedade nessa fase.

## Regras para adaptadores de fornecedores

1. Manter os tokens da Frequência40 e as credenciais do ERP apenas no servidor do conector.
2. Adaptar identificadores, categorias, valores em centavos, SKU e GTIN para os contratos da API.
3. Gravar no conector uma revisão incremental por **produto externo** e o UUID `eventId` de cada tentativa lógica.
4. Reenviar o mesmo evento com o **mesmo payload** em caso de timeout; não incrementar a revisão apenas para tentar novamente.
5. Ao receber `409`, parar a sincronização daquele produto e abrir reconciliação — **não** criar produto alternativo automaticamente.
6. Usar `/v1/external/inventory` separadamente, conforme o dono do estoque; não usar dados de preços para deduzir saldo.
7. Consumir `/v1/external/events` e confirmar ACK somente depois de aplicar a alteração; eventos de origem própria são suprimidos para evitar loops.
8. Antes de vender, testar sincronização concorrente com checkout, venda em caixa, devolução, estorno, mudança de preço, descontos, pedidos pendentes e queda de conexão.

## Limitações conhecidas

- **Sem conectores** Bling, Omie, Olist/Tiny, TOTVS ou outros prontos. Contrato é genérico.
- Interface Flutter administrativa ainda permite editar catálogo e preços; mudanças locais podem ser sobrescritas pelo ERP controlador. Será preciso política de autoria/edição conforme o estabelecimento.
- Não importa imagens binárias, apenas URLs HTTPS; cada ERP precisa oferecer mídia pública adequada ou um fluxo de upload.
- Categorias precisam existir previamente; não há importação automática de categorias nem hierarquia de departamentos.
- Não existe agendamento automático de coleta no ERP: o servidor adaptador deve chamar esta API; lote é **pull/push por conector**, não polling nativo.
- Sem importação automática de estoque; a API específica da Fase 1 continua sendo o caminho válido para saldos.
- Não há multidepósito, tabela de preço por canal, kit/BOM, variação arbitrária de atributos ou regras fiscais de produtos nesta fase.
- A compatibilidade com ERP/PDV real depende de credenciais, documentação e homologação própria do fornecedor.
- **A migration 020 não foi testada em PostgreSQL real neste ambiente.** Efetue primeiro homologação em banco de staging com backup e dados de teste.

## Testes e rollout

No PowerShell, a partir da raiz `loja_roupas`:

```powershell
cd backend
npm ci
npm run build
npm test
```

Não rodar `npm ci` na raiz do projeto Flutter. Compilação e testes unitários não exigem conexão real a um banco em execução, mas a configuração do backend exige `DATABASE_URL` e `JWT_SECRET` válidos em `.env` (ou no ambiente). `npm run db:migrate` exige PostgreSQL acessível.

No Railway: manter `ENABLE_EXTERNAL_INTEGRATIONS=false` no primeiro deploy da Fase 2; o `backend/Dockerfile` existente executa migrations no startup. Verificar log `Aplicada: 020_external_catalog_sync.sql` e `/health/ready`. **Só então** habilitar integrações em staging e testar antes de uma implantação comercial.

Em caso de falha de migration ou comportamento inesperado, não apague tabelas nem altere o histórico de migrations manualmente. Suspenda as integrações (`ENABLE_EXTERNAL_INTEGRATIONS=false`), preserve logs, restaure backup se necessário e volte ao deploy anterior mediante procedimento de recuperação.
