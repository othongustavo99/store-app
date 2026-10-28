# Fase 3 — Recuperar conta já cadastrada no PostgreSQL (sem apagar loja)

## Diagnóstico

- `POST /v1/auth/login` -> 401 `Credenciais inválidas.` quando a conta não existe, está suspensa ou a senha não coincide com o hash.
- `POST /v1/auth/register` -> 409 `Email já cadastrado.` indica que o email já existe no banco da API.
- A senha do Railway, Google ou Firebase **não** é a senha do backend próprio.
- O pacote não altera o app Flutter nem expõe uma rota de redefinição de senha.

## Aplicar a correção

1. Faça backup do PostgreSQL antes de mexer na conta.
2. Extraia este ZIP na raiz do repositório `loja_roupas`, mantendo a árvore de pastas. Apenas dois novos arquivos TS e este guia serão incluídos.
3. No PowerShell do VS Code:

```powershell
cd backend
npm install
npm run build
npm test
cd ..
git add backend/src/scripts/reset_user_password.ts backend/src/tests/password_roundtrip.test.ts docs/FASE_3_RECUPERAR_ACESSO_RAILWAY.md
git commit -m "fix: adicionar recuperacao administrativa de acesso"
git push origin master
```

4. Aguarde `store-app` ficar **Active** no Railway (mesma branch master); o Dockerfile compila `src` para `dist` automaticamente. Não é necessária migration.
5. Instale e autentique a CLI Railway (PowerShell):

```powershell
npm install -g @railway/cli
railway login
```

6. No Railway, entre em `store-app` e use a ação **Copy SSH Command** (clique com botão direito no serviço). Ou entre no projeto via CLI:

```powershell
railway link
railway ssh --service store-app --environment production
```

7. No shell **dentro** do serviço Railway (não no PowerShell do PC), execute:

```sh
cd /app
node dist/scripts/reset_user_password.js
```

8. Digite o email da conta já existente e confirme digitando `REDEFINIR <seu-email>` exatamente conforme pedido pelo script. A senha aleatória segura será mostrada uma única vez. **Guarde-a em um gerenciador de senhas e não tire print da senha.**
9. Saia do SSH (`exit`), abra o Flutter e entre com o email e a nova senha gerada.

## O que muda no PostgreSQL

- Somente o `password_hash` da conta especificada é substituído por um scrypt v1 novo, com salt aleatório.
- As sessões existentes da conta são revogadas; outras contas não são alteradas.
- Um evento administrativo sem senha é registrado na tabela `audit_logs`.
- A loja, o slug, vínculos OWNER/STAFF, produtos e pedidos ficam preservados.
- Se o usuário estiver suspenso, o script não ativa a conta.

## Boas práticas

- Acesso SSH ao Railway deve ficar restrito ao operador da plataforma.
- Não cole `DATABASE_URL`, `JWT_SECRET`, hash ou a nova senha em chats, prints, tickets ou no GitHub.
- Após recuperar o acesso, planeje a recuperação de senha por email com token de uso único, prazo curto e confirmação de identidade, além de uma tela de alteração de senha no app. A recuperação administrativa por SSH é somente um procedimento emergencial.
- Se a CLI disser que não consegue conectar por SSH, confira se você tem autorização no workspace e se sua chave SSH foi cadastrada conforme `https://docs.railway.com/cli/ssh`.

## Verificação

- `npm run build` e `npm test` devem passar antes de fazer push.
- O Railway deve mostrar **Active** após o deploy.
- Um login com a senha nova deve funcionar.
- Depois do login, a rota privada `/v1/stores/mine` deve listar a loja vinculada.
