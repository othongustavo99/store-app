# Fase 5.4 — recuperação de senha, exclusão de conta e privacidade

## Base e objetivo

Aplicar APÓS as fases 5.1, 5.2 e 5.3. O pacote não modifica o checkout, o estoque nem as credenciais financeiras. Mantém o modo Firebase legado como estava; os novos fluxos são exclusivos do modo Railway.

## Arquivos (todos completos no ZIP)

**Novos**:
- `backend/migrations/012_account_security_privacy.sql`
- `backend/src/routes/account_security.ts`
- `backend/src/services/account_privacy.ts`
- `backend/src/scripts/process_account_deletions.ts`
- `backend/src/tests/account_privacy.test.ts`
- `backend/src/tests/account_security_routes.test.ts`
- `docs/FASE_5_4_SEGURANCA_PRIVACIDADE.md`

**Substituir**:
- `backend/src/app.ts`
- `backend/src/config.ts`
- `backend/package.json`
- `backend/.env.example` (não substitua seu `.env` real)
- `lib/features/admin/login/admin_login_screen.dart`
- `lib/features/client/account/railway_account_screen.dart`

**Remover**: nenhum.

## Preparação segura

1. Faça backup verificável do PostgreSQL antes de aplicar a migration 012. Não altere migrations antigas.
2. Extraia o ZIP preservando a pasta `loja_roupas/`, sem copiar pastas geradas como `build` ou `node_modules`.
3. Na raiz do projeto:

```powershell
cd backend
npm ci
npm run build
npm test
cd ..
flutter pub get
flutter analyze
flutter test
```

4. Após tudo passar, faça commit das alterações e `git push origin master` (ou a branch conectada ao seu serviço Railway):

```powershell
git add backend/src backend/migrations/012_account_security_privacy.sql backend/package.json backend/.env.example lib/features/admin/login/admin_login_screen.dart lib/features/client/account/railway_account_screen.dart docs/FASE_5_4_SEGURANCA_PRIVACIDADE.md
git commit -m "feat: fase 5.4 recuperação e exclusão de conta"
git push origin master
```

5. Em **store-app → Deployments → Deploy Logs**, confirme `Aplicada: 012_account_security_privacy.sql`. Verifique `/health/ready`.

## Email transacional: Resend

As mensagens de recuperação de senha e confirmação da exclusão são enviadas por **Resend**, via API HTTPS do backend. O domínio de envio precisa ser verificado antes do envio; nunca utilize a chave no aplicativo Flutter.

1. Crie uma conta no [Resend](https://resend.com/), adicione um domínio próprio e configure os registros DNS de acordo com o painel (SPF/DKIM e, quando aplicável, DMARC).
2. Crie uma chave de API de envio de email.
3. No serviço Railway `store-app`, adicione:

```env
RESEND_API_KEY=<sua-chave-privada>
ACCOUNT_EMAIL_FROM=Loja <contas@dominio-verificado.com.br>
PUBLIC_BASE_URL=https://seu-dominio.up.railway.app
```

Use o domínio que você **de fato verificou**. `PUBLIC_BASE_URL` deve corresponder à API acessível publicamente por HTTPS, sem barra final; se já existir, mantenha-a. Essas três variáveis precisam estar presentes para que a rota de recuperação aceite solicitações. Sem elas, retorna 503 e nenhuma mensagem é anunciada como enviada.

4. Aplique as variáveis e faça deploy. Teste com uma **conta de homologação** que tenha endereço de email controlado por você. Não exponha tokens dos links em prints.

**URLs públicas criadas** (substitua o domínio):
- `https://SEU-DOMINIO/account/recuperar-senha` — para quem esqueceu a senha.
- `https://SEU-DOMINIO/account/excluir-conta` — solicitação fora do aplicativo (campo Data safety do Google Play).
- `https://SEU-DOMINIO/account/redefinir-senha#token=...` — link de recuperação enviado por email.
- `https://SEU-DOMINIO/account/confirmar-exclusao#token=...` — link enviado para confirmar a exclusão.

Os tokens expiram em 30 minutos, são armazenados como hash no banco e consumidos uma única vez. O segredo fica no fragmento de URL (`#`), que não é transmitido ao servidor em navegações GET. O script da página remove o fragmento do histórico antes de enviar o token pelo corpo HTTPS. Não há rastreamento nem scripts externos nas páginas.

## Fluxos para validar

**Recuperação**:
1. No Windows, entre na página de login da loja em modo Railway, clique em **Esqueci minha senha**.
2. Informe um email cadastrado e confira a chegada da mensagem.
3. Acesse o link; informe uma nova senha (mínimo 12 caracteres).
4. Confira que a senha antiga não funciona, que a nova funciona e que sessões prévias foram revogadas.
5. Tente reutilizar o mesmo link e confirme a recusa.
6. Informe email não cadastrado: a API fornece resposta genérica, sem revelar a existência da conta.

**Exclusão** (somente com contas de teste, pois é irreversível):
1. Entre em **Minha conta → Excluir minha conta** e confirme com sua senha.
2. Com uma conta sem lojas, pedidos ou chamados pendentes, confira retorno `COMPLETED`, revogação da sessão e bloqueio do login.
3. Com um proprietário de loja, o pedido fica em `PENDING` por haver responsabilidades comerciais; **não exclua sua conta de proprietário para experimentar**.
4. Abra a página externa `/account/excluir-conta` em navegador sem sessão, peça a confirmação por email e valide o link.
5. Certifique-se de que a URL é acessível publicamente sem depender do aplicativo.

**Solicitações pendentes**:
- A conta permanece ativa enquanto existirem pedidos em andamento, vínculos de equipe, atendimentos abertos ou pós-venda pendente.
- Após resolver essas pendências, use em produção, com supervisão e acesso autorizado ao container:

```bash
cd /app
node dist/scripts/process_account_deletions.js
```

Esse comando processa até 100 solicitações pendentes por execução, mas **não ignora bloqueios**. Instale uma rotina operacional com responsável, prazos e acompanhamento das solicitações; não deixe pedidos `PENDING` indefinidamente.

## Obrigações legais e limitações importantes

A exclusão concluída substitui a identidade por um perfil pseudonimizado, revoga sessões e remove endereços, carrinho, cotações e conteúdo de atendimentos. O vínculo relacional é preservado para pedidos e trilhas de auditoria. Alguns históricos de transações (como `orders.shipping_address`, notificações, notas e outros registros legais) podem permanecer: é preciso determinar as bases legais e o prazo de retenção com assessoria jurídica e publicar essas informações na política de privacidade. Uma conta pseudonimizada **não equivale automaticamente à eliminação de todos os dados pessoais**.

Antes das lojas de aplicativos, também serão necessários:
- Política de privacidade pública e correta, com identificação do controlador e encarregado/canal de contato;
- Revisão de todos os dados do backend, armazenamento de mídias e do Firebase legado para exclusão e retenção;
- Procedimento de exclusão de avaliações/imagens e outros dados gerados pelos usuários;
- Prazo operacional de atendimento de solicitações pendentes, com notificações e registro de conclusão;
- Testes de integração reais de email, sessão, pedidos, integridade do banco e acessibilidade em Android e iOS.

Apple: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/
Google: https://support.google.com/googleplay/android-developer/answer/13327111?hl=pt-BR

## Rollback

Guarde backup do banco. Para reverter código, use `git revert` do commit desta fase e redeploy. **Não remova** a migration 012 depois que ela for aplicada; para mudanças de esquema futuras, crie outra migration. Desligue o envio de novos emails removendo ou desabilitando `RESEND_API_KEY` caso haja incidente (isso não exclui mensagens já enviadas). Revogue chaves comprometidas no Resend.
