# Fase 4.2 — Gestão de equipe e permissões (Railway)

## Escopo

Entrega incremental sobre as Fases 0, 1, 2, 3 e 4.1 (inventário), **já aplicadas**.

- Equipe por loja: consulta de membros e funções.
- Proprietário (OWNER): convite para MANAGER ou STAFF por código de uso único válido por 72 h; revogação; troca de função; remoção de funcionário.
- Gerente (MANAGER): consulta a equipe sem permissão para convidar ou alterar funções.
- Funcionário (STAFF): acesso de leitura ao estoque e pedidos já existentes; não recebe permissão para alterar estoque/catálogo/pedidos.
- Convite só pode ser aceito pela conta cujo email é igual ao email indicado, dentro da loja correta.
- Código aleatório de 256 bits, salvo apenas como SHA-256. O texto claro é exibido **uma vez** ao criar o convite. Não o envie a canais públicos.
- Registro de auditoria para as operações da equipe e barreiras de autorização no servidor.

## Arquivos novos

- `backend/migrations/005_store_team_invites.sql`
- `backend/src/routes/team.ts`
- `backend/src/services/team_invites.ts`
- `backend/src/tests/team_invites.test.ts`
- `lib/data/repositories/railway_team_repository.dart`
- `lib/features/admin/team/railway_team_screen.dart`
- `lib/features/client/invite/railway_accept_invite_screen.dart`
- Este documento.

## Arquivos substituídos integralmente

- `backend/src/app.ts`
- `lib/providers/auth_providers.dart`
- `lib/router/app_router.dart`
- `lib/features/admin/remote_admin_home.dart`
- `lib/features/client/home/home_screen.dart`

Não remova arquivos Firebase, versões anteriores, dados ou migrations. Não substitua `backend/.env` nem as variáveis do Railway.

## Aplicação

1. Faça um commit/backup do estado funcional.
2. Extraia o ZIP e copie o conteúdo **interno** de `loja_roupas/` para a raiz do repositório local, mesclando as pastas.
3. No terminal PowerShell aberto na raiz do Flutter:

```powershell
cd backend
npm ci
npm run build
npm test
cd ..
flutter pub get
flutter analyze
```

4. Corrija quaisquer erros de compilação antes de publicar. Depois:

```powershell
git add backend/src backend/migrations/005_store_team_invites.sql lib/data/repositories/railway_team_repository.dart lib/features/admin/remote_admin_home.dart lib/features/admin/team lib/features/client/home/home_screen.dart lib/features/client/invite lib/providers/auth_providers.dart lib/router/app_router.dart docs/FASE_4_2_EQUIPE_E_PERMISSOES.md
git commit -m "feat: fase 4.2 equipe e permissoes"
git push origin master
```

5. No Railway (`store-app` → `Deployments` → `Deploy Logs`), confirme `Aplicada: 005_store_team_invites.sql` (ou `Já aplicada`, se for redeploy). O deploy pode falhar se a migration anterior 004 ainda não tiver sido aplicada. Não execute SQL manualmente antes de ler os logs.
6. Verifique `https://store-app-production-c741.up.railway.app/health/ready` — esperado: status ready.
7. Execute Flutter:

```powershell
flutter run -d windows `
  --dart-define=LOJA_BACKEND=railway `
  --dart-define=LOJA_API_BASE_URL=https://store-app-production-c741.up.railway.app `
  --dart-define=LOJA_STORE_SLUG=SEU-SLUG
```

Substitua `SEU-SLUG` pelo slug real cadastrado. Não é necessário definir novas variáveis de ambiente.

## Cenário de teste completo

1. Entre com a conta proprietária e abra `Equipe e permissões` no painel `/admin`.
2. Confira se aparece o proprietário com função OWNER.
3. Crie um convite para **outra conta de teste** (outro email) como STAFF. Copie o código exibido uma vez; não cole em logs públicos.
4. Encerre a sessão do proprietário. Crie/entre com a conta do email do convite (se ainda não tiver conta).
5. Na vitrine, clique no ícone `Tenho um convite da equipe` e cole o código. Aceite.
6. Confirme que a pessoa é direcionada para o painel administrativo e consegue **consultar** pedidos/estoque, mas não fazer ajustes. O servidor deve rejeitar operações proibidas mesmo fora da UI.
7. Entre novamente como proprietário. Mude o cargo para MANAGER. Confira permissões de alteração de estoque e produtos.
8. Remova a pessoa. Confira que as operações administrativas retornam erro de autorização ao usar o token antigo, sem precisar apagar a conta de cliente.
9. Crie outro convite e revogue antes da aceitação. Confira que o código revogado não funciona.
10. Confira que tentativa com email diferente, loja diferente, código expirado ou código repetido é rejeitada.

## Limites comerciais que permanecem abertos

- Os códigos precisam ser compartilhados manualmente por um canal privado. Envio verificado por email, fluxo de verificação de email e recuperação de senha ainda não foram implementados.
- Testes passaram com banco de testes fictício apenas para validar a compilação e helpers; **não** foram executados testes integrados no PostgreSQL do Railway nem build Flutter neste ambiente.
- Não há histórico visual de auditoria da equipe: registros estão disponíveis em `audit_logs` no servidor.
- OWNER não pode ser alterado nesta fase. Transferência de propriedade exige fluxo específico com reautenticação e trilha de auditoria.
- Não publicar a plataforma para lojistas externos ainda: pagamentos, reembolsos, frete e compliance ainda possuem pendências.

## Diagnóstico

- `401`: sessão expirada; entre novamente.
- `403`: usuário sem permissão; use OWNER para convite/remoção.
- `404`: loja não cadastrada, usuário removido ou recurso de outra loja.
- `409`: membro já existente, convite pendente duplicado ou limite de convites alcançado.
- `500`: confira se `005_store_team_invites.sql` foi aplicada e os Deploy Logs.
- **Não execute** uma operação de remoção/alteração diretamente no banco; use as rotas autenticadas para manter trilha de auditoria.
