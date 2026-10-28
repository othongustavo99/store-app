# Fase 4 — Administração operacional (entrega 1: inventário + indicadores)

**Base utilizada:** `loja_roupas(3).zip`, enviado em 28/10/2026. Considera as Fases 0 a 3 aplicadas.

Esta entrega não substitui a camada de pagamento. Não altera credenciais Railway e **não executa testes pagos**.

## 1. Arquivos adicionados

- `backend/migrations/004_inventory_management.sql` — tabela de idempotência dos ajustes.
- `backend/src/services/stock_rules.ts` — regra de estoque validável isoladamente.
- `backend/src/tests/stock_rules.test.ts` — testes da regra.
- `backend/src/routes/inventory.ts` — inventário, histórico, ajuste e indicadores.
- `lib/data/repositories/railway_inventory_repository.dart` — cliente das rotas novas.
- `lib/features/admin/inventory/railway_inventory_screen.dart` — pesquisa, filtros, entrada/saída e histórico.

## 2. Arquivos substituídos

- `backend/src/app.ts` — registra as rotas administrativas novas.
- `lib/features/admin/remote_admin_home.dart` — indicadores e acesso ao inventário.
- `lib/router/app_router.dart` — rota `/admin/inventory`.

**Arquivos removidos:** nenhum. **Não** remova Firebase ainda, e **não** copie `.env` de outro computador/ZIP para o servidor.

## 3. Instalação local

Extraia este ZIP na mesma pasta que contém `loja_roupas/`, substituindo os três arquivos existentes. Faça backup antes.

No PowerShell, a partir da raiz do aplicativo:

```powershell
cd backend
npm ci
npm run build
npm test
cd ..
flutter pub get
flutter analyze
```

Se tudo estiver correto:

```powershell
git add backend/src/app.ts backend/src/routes/inventory.ts backend/src/services/stock_rules.ts backend/src/tests/stock_rules.test.ts backend/migrations/004_inventory_management.sql lib/data/repositories/railway_inventory_repository.dart lib/features/admin/inventory/railway_inventory_screen.dart lib/features/admin/remote_admin_home.dart lib/router/app_router.dart docs/FASE_4_OPERACAO_ADMINISTRATIVA.md
git commit -m "feat: fase 4 inventario e painel operacional"
git push origin master
```

O repositório conectado anteriormente ao Railway utiliza a branch `master`. Se a configuração tiver mudado, ajuste o destino do push.

## 4. No Railway

1. Em `store-app → Deployments`, confirme que o novo build ficou `Active`.
2. Em **Deploy Logs**, confirme que a migration `004_inventory_management.sql` foi aplicada e que o servidor iniciou.
3. Não altere a URL do banco, o domínio, a porta nem o Dockerfile se já estiverem operando.
4. Teste `/health/ready` e verifique que retorna `status: ready`.
5. Se a migration falhar, consulte os logs e **não a edite depois de aplicada**: crie nova migration corretiva.

**Nenhuma variável de ambiente nova é necessária.** Não disponibilize credenciais na aplicação Flutter.

## 5. Abrir o app no Windows

```powershell
flutter run -d windows `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

Substitua `SEU-SLUG` pelo slug **já cadastrado** no PostgreSQL. Se o login continuar bloqueado, resolva primeiro a recuperação da conta feita na Fase 3: não crie usuário novo para contornar a autorização.

Na tela administrativa, use **Inventário e movimentações**. A busca filtra nome, SKU, cor e tamanho. O filtro de baixo estoque considera até 5 unidades **disponíveis**.

### Permissões

- `OWNER` e `MANAGER`: consultam e ajustam o estoque.
- `STAFF`: consulta inventário, histórico e indicadores; a API **não** permite ajustar.
- Cliente sem vínculo: nenhum acesso a essas rotas (verificação no servidor).
- Uma loja não pode alterar variante de outra loja nem saber seus movimentos.

### Consistência do estoque

- Estoque físico (`on_hand`) inclui as unidades que estão reservadas.
- Disponível = físico − reservado.
- A saída de estoque pode atingir **apenas** a parte disponível, nunca reservas.
- Toda entrada/saída exige um motivo, gera movimento e registra autor e data.
- Cada ajuste tem uma chave UUID única: reenvios do mesmo pedido não fazem a operação duas vezes.
- Alterações geram eventos `loja_catalog_changed`, atualizando as telas que assinam o catálogo.

**Atenção à edição de produtos:** o formulário legado ainda permite editar a quantidade junto aos dados do produto. Para movimentação diária de estoque, utilize a central de inventário; uma próxima melhoria deve separar definitivamente edição cadastral de ajuste de estoque.

## 6. Checklist de testes

Execute primeiro em uma loja de **homologação**, com produtos fictícios e sem cobrança real:

1. Faça login como proprietário e abra Inventário.
2. Registre uma entrada de 3 unidades com motivo `Recebimento de fornecedor`.
3. Confirme que físico e disponível aumentaram em 3 e que aparece no histórico.
4. Registre uma saída de 1 unidade com motivo `Avaria no produto`.
5. Confirme que somente o disponível diminui.
6. Com produto reservado por pedido, tente baixar mais unidades que o disponível; a API deve responder `409` e o banco não deve mudar.
7. Tente reenviar a mesma operação com a mesma UUID e dados; o estoque deve mudar apenas uma vez.
8. Faça login como STAFF; a consulta funciona mas a baixa é bloqueada.
9. Valide que dados de outra loja não são acessíveis.
10. Em outro dispositivo com o catálogo aberto, confirme que o estoque é atualizado após o ajuste.
11. Abra o painel e confira métricas de pedidos pagos / estoque. Não trate o total bruto como lucro.

## 7. API adicionada

Todas as rotas exigem Bearer JWT válido e participação ativa na loja:

- `GET /v1/stores/:storeId/operations/summary`
- `GET /v1/stores/:storeId/inventory?q=&onlyLow=false&threshold=5&page=1&limit=50`
- `GET /v1/stores/:storeId/inventory/movements?variantId=<UUID>&limit=60`
- `POST /v1/stores/:storeId/inventory/:variantId/adjust`

Corpo do POST:

```json
{
  "requestId": "UUID-UNICA-POR-OPERACAO",
  "delta": -2,
  "notes": "Avaria identificada na conferência"
}
```

O servidor valida o `storeId` por participação, o `variantId` por loja e bloqueia a linha do estoque em transação. Não exponha esse endpoint sem autenticação.

## 8. Escopo ainda pendente para produto pronto para venda

Esta entrega conclui a **primeira parte da Fase 4**, não a operação comercial inteira. Ainda precisamos: upload de mídia autenticado (hoje existe preset Cloudinary no aplicativo), equipe e convites, trilha de auditoria administrativa abrangente, atendimento, cancelamentos e reembolsos, entregas e logística, estoque com SKU customizado e importação em lote, filtros/paginação de pedidos, relatórios financeiros reconciliados, backup-restauração testados, testes integrados com banco real e UX. O pagamento piloto segue restrito a uma única loja. Não anunciar o sistema como pronto para venda antes dessas validações.

### Validação neste ambiente

- TypeScript compilado usando dependências presentes no ZIP de origem.
- Testes de backend: 11 passaram, usando variáveis de teste, sem conexão com produção.
- **Não foi possível executar Flutter/Windows, PostgreSQL real nem Railway deploy aqui.**
