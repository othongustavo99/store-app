import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ApiError } from '../security/errors.js';
import { requireIdentity } from '../security/identity.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { hashToken } from '../security/tokens.js';
import { emailField, passwordField, validated } from '../security/validation.js';
import { accountEmailConfigured, finalizeOrQueueDeletion, isValidActionToken, newActionToken, sendAccountEmail, type AccountAction } from '../services/account_privacy.js';

const emailBody = z.object({email:emailField}).strict();
const tokenBody = z.object({token:z.string().max(100),newPassword:passwordField}).strict();
const deleteTokenBody = z.object({token:z.string().max(100)}).strict();
const deleteBody = z.object({password:z.string().min(1).max(128)}).strict();
const ack = {message:'Se existir uma conta ativa com esse email, você receberá as instruções.'};

async function issueToken(email: string, action: AccountAction): Promise<void> {
  if (!accountEmailConfigured()) throw new ApiError(503,'Envio de emails não configurado para esta loja.');
  const user = await pool.query<{id:string,email:string}>(
    'SELECT id,email FROM users WHERE email=$1 AND status=$2',[email,'ACTIVE']);
  if (!user.rowCount) return; // não revelar existência do cadastro
  const id = user.rows[0].id;
  const prior = await pool.query(`SELECT 1 FROM account_action_tokens WHERE user_id=$1 AND purpose=$2
    AND created_at > now() - interval '2 minutes' LIMIT 1`,[id,action]);
  if (prior.rowCount) return;
  const token = newActionToken();
  const inserted = await pool.query<{id:string}>(`INSERT INTO account_action_tokens(user_id,purpose,token_hash,expires_at)
    VALUES($1,$2,$3,now() + interval '30 minutes') RETURNING id`, [id,action,hashToken(token)]);
  try { await sendAccountEmail(user.rows[0].email,action,token); }
  catch {
    await pool.query('DELETE FROM account_action_tokens WHERE id=$1',[inserted.rows[0].id]);
    // Resposta pública idêntica para emails existentes e inexistentes.
    // Monitore falhas de envio via infraestrutura, sem registrar email ou token.
    console.error('Falha no envio de email de segurança da conta.');
  }
}

async function verifyAccountToken(token: string, purpose: AccountAction, onVerified: (client: import('pg').PoolClient,userId:string)=>Promise<unknown>) {
  if (!isValidActionToken(token)) throw new ApiError(400,'Link inválido ou expirado.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{id:string;user_id:string}>(`SELECT t.id,t.user_id FROM account_action_tokens t
      JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.purpose=$2
      AND t.consumed_at IS NULL AND t.expires_at>now() AND u.status='ACTIVE' FOR UPDATE OF t`,[hashToken(token),purpose]);
    if (!result.rowCount) throw new ApiError(400,'Link inválido ou expirado.');
    const {id,user_id} = result.rows[0];
    const lock = await client.query('SELECT id FROM users WHERE id=$1 AND status=$2 FOR UPDATE',[user_id,'ACTIVE']);
    if (!lock.rowCount) throw new ApiError(400,'Link inválido ou expirado.');
    await client.query('UPDATE account_action_tokens SET consumed_at=now() WHERE id=$1',[id]);
    const output = await onVerified(client,user_id);
    await client.query('COMMIT');
    return output;
  } catch (e) { await client.query('ROLLBACK');throw e; }
  finally { client.release(); }
}

const staticHeaders = {'Cache-Control':'no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
function htmlPage(title:string, kind:'forgot'|'reset'|'deletion'|'confirm') {
  // Conteúdo estático: o token nunca é interpolado nem enviado ao servidor via GET.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
  body{background:#f5f6f9;color:#182332;font:16px system-ui,sans-serif;margin:0;padding:24px}main{max-width:440px;margin:8vh auto;background:white;padding:30px;border-radius:16px;box-shadow:0 5px 30px #16223812}
  label{display:block;margin:12px 0 6px}input,button{box-sizing:border-box;width:100%;padding:13px;border-radius:8px;font:inherit}input{border:1px solid #9ba3b4}button{margin-top:16px;color:white;background:#1b3674;border:0;cursor:pointer}
  button:disabled{opacity:.5}p{line-height:1.5}small{color:#48576e}#result{white-space:pre-wrap}</style></head><body><main data-kind="${kind}"><h1>${title}</h1><p id="description"></p>
  <form id="account-form"><label id="field-label" for="field"></label><input id="field" required autocomplete="off"><button id="submit" type="submit">Continuar</button></form>
  <p id="result" role="status" aria-live="polite"></p><small>Por segurança, nenhum link é armazenado neste navegador. Links expiram após 30 minutos.</small></main>
  <script src="/account/account.js" defer></script></body></html>`;
}
const webScript = `(() => {
  const kind=document.querySelector('main').dataset.kind,form=document.getElementById('account-form');
  const input=document.getElementById('field'),label=document.getElementById('field-label'),button=document.getElementById('submit'),result=document.getElementById('result');
  const description=document.getElementById('description');
  let token='';
  if(kind==='reset'||kind==='confirm') {
    const p=new URLSearchParams(location.hash.slice(1));token=p.get('token')||'';
    history.replaceState(null,'',location.pathname); // não deixar o token no histórico
    if(!token){form.hidden=true;result.textContent='Link ausente ou inválido.';return;}
  }
  if(kind==='forgot'){description.textContent='Informe o email cadastrado para receber um link de recuperação.';label.textContent='Email';input.type='email';input.autocomplete='email';}
  if(kind==='deletion'){description.textContent='Informe seu email. Você receberá um link para confirmar a exclusão. Pedidos ou obrigações comerciais pendentes podem exigir conclusão posterior.';label.textContent='Email';input.type='email';input.autocomplete='email';}
  if(kind==='reset'){description.textContent='Defina uma senha nova com pelo menos 12 caracteres.';label.textContent='Nova senha';input.type='password';input.autocomplete='new-password';input.minLength=12;}
  if(kind==='confirm'){description.textContent='A exclusão é irreversível. Dados necessários para obrigações legais podem ser retidos. Confirme abaixo.';form.hidden=true;
    const go=document.createElement('button');go.textContent='Confirmar exclusão da conta';go.type='button';go.onclick=()=>submitRequest('/v1/auth/deletion/confirm',{token},go);form.after(go);}
  async function submitRequest(path,body,control){control.disabled=true;result.textContent='Processando...';
    try {const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
      const data=await response.json();result.textContent=data.message||'Não foi possível concluir.';
      if(response.ok){form.hidden=true;control.hidden=true;}
    }catch{result.textContent='Falha de conexão. Tente novamente.';}finally{control.disabled=false;}}
  form.onsubmit=e=>{e.preventDefault();const value=input.value.trim();
    if(kind==='forgot')submitRequest('/v1/auth/password/forgot',{email:value},button);
    if(kind==='deletion')submitRequest('/v1/auth/deletion/request',{email:value},button);
    if(kind==='reset')submitRequest('/v1/auth/password/reset',{token,newPassword:value},button);
  };
})();`;

export async function accountSecurityRoutes(app: FastifyInstance) {
  app.get('/account/recuperar-senha',async(_req,reply)=>reply.headers(staticHeaders).type('text/html; charset=utf-8').send(htmlPage('Recuperar senha','forgot')));
  app.get('/account/redefinir-senha',async(_req,reply)=>reply.headers(staticHeaders).type('text/html; charset=utf-8').send(htmlPage('Redefinir senha','reset')));
  app.get('/account/confirmar-exclusao',async(_req,reply)=>reply.headers(staticHeaders).type('text/html; charset=utf-8').send(htmlPage('Confirmar exclusão','confirm')));
  app.get('/account/excluir-conta',async(_req,reply)=>reply.headers(staticHeaders).type('text/html; charset=utf-8').send(htmlPage('Excluir minha conta','deletion')));
  app.get('/account/account.js',async(_req,reply)=>reply.headers(staticHeaders).type('application/javascript; charset=utf-8').send(webScript));
  app.post('/v1/auth/password/forgot',{config:{rateLimit:{max:3,timeWindow:'15 minutes'}}}, async (request)=>{
    const {email}=validated(emailBody,request.body);await issueToken(email,'PASSWORD_RESET');return ack;
  });
  app.post('/v1/auth/password/reset',{config:{rateLimit:{max:5,timeWindow:'15 minutes'}}}, async(request)=>{
    const body=validated(tokenBody,request.body);
    const hash=await hashPassword(body.newPassword);
    await verifyAccountToken(body.token,'PASSWORD_RESET',async(client,userId)=>{
      await client.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[hash,userId]);
      await client.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[userId]);
      await client.query("DELETE FROM account_action_tokens WHERE user_id=$1 AND purpose='PASSWORD_RESET'",[userId]);
      return null;
    });
    return {message:'Senha redefinida. Entre novamente com sua nova senha.'};
  });
  app.post('/v1/auth/deletion/request',{config:{rateLimit:{max:3,timeWindow:'15 minutes'}}}, async request=>{
    const {email}=validated(emailBody,request.body);await issueToken(email,'ACCOUNT_DELETE');return ack;
  });
  app.post('/v1/auth/deletion/confirm',{config:{rateLimit:{max:5,timeWindow:'15 minutes'}}}, async request=>{
    const {token}=validated(deleteTokenBody,request.body);
    return verifyAccountToken(token,'ACCOUNT_DELETE',async(client,userId)=>finalizeOrQueueDeletion(client,userId));
  });
  app.get('/v1/me/deletion',async request=>{
    const {userId}=await requireIdentity(request);
    const result=await pool.query<{status:string;reason:string|null;requested_at:Date}>(
      'SELECT status,reason,requested_at FROM account_deletion_requests WHERE user_id=$1',[userId]);
    return {request:result.rows[0]??null};
  });
  app.post('/v1/me/deletion',{config:{rateLimit:{max:3,timeWindow:'15 minutes'}}},async request=>{
    const {userId}=await requireIdentity(request);
    const {password}=validated(deleteBody,request.body);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const user=await client.query<{password_hash:string}>(
        'SELECT password_hash FROM users WHERE id=$1 AND status=$2 FOR UPDATE',[userId,'ACTIVE']);
      if(!user.rowCount || !(await verifyPassword(password,user.rows[0].password_hash)))
        throw new ApiError(401,'Senha incorreta. A exclusão não foi solicitada.');
      const output=await finalizeOrQueueDeletion(client,userId);
      await client.query('COMMIT');return output;
    }catch(e){await client.query('ROLLBACK');throw e;}
    finally{client.release();}
  });
}
