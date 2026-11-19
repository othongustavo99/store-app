// OAuth 2.0 authorization code / refresh rotativo do Bling v3, com JWT.
// Provedor local baseado em arquivo privado: nao utilizar arquivo efemero da Railway.
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {atomicJson,loadJson} from './state.mjs';
import {BlingConnectorError} from './clients.mjs';

const authUrl='https://www.bling.com.br/Api/v3/oauth/authorize';
const tokenUrl='https://api.bling.com.br/Api/v3/oauth/token';
function credentials(clientId,clientSecret) {
  if(typeof clientId!=='string'||clientId.length<8||/\s/.test(clientId)||
    typeof clientSecret!=='string'||clientSecret.length<8||/\s/.test(clientSecret))throw new BlingConnectorError('BLING_CLIENT_CREDENTIALS_REQUIRED');
  return 'Basic '+Buffer.from(`${clientId}:${clientSecret}`,'utf8').toString('base64');
}
function redirect(value) {
  let u;try{u=new URL(value);}catch{throw new BlingConnectorError('OAUTH_REDIRECT_INVALID');}
  if((u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))||u.username||u.password||u.hash||u.search)
    throw new BlingConnectorError('OAUTH_REDIRECT_INVALID');
  return u;
}
export function authorizationUrl(clientId,state) {
  if(!clientId||!state||!/^[-_a-zA-Z0-9]{20,200}$/.test(state))throw new BlingConnectorError('OAUTH_STATE_INVALID');
  const url=new URL(authUrl);url.searchParams.set('response_type','code');url.searchParams.set('client_id',clientId);url.searchParams.set('state',state);
  return url.toString();
}
export function validateCallback(callback,pending,expectedRedirect,now=Date.now()) {
  const original=redirect(expectedRedirect),received=new URL(callback);
  if(original.origin!==received.origin||original.pathname!==received.pathname)throw new BlingConnectorError('OAUTH_CALLBACK_MISMATCH');
  if(!pending||typeof pending.state!=='string'||!Number.isFinite(pending.createdAt)||now-pending.createdAt>600000||now<pending.createdAt-60000)
    throw new BlingConnectorError('OAUTH_SESSION_EXPIRED');
  const a=Buffer.from(pending.state),b=Buffer.from(received.searchParams.get('state')??'');
  if(a.length!==b.length||!timingSafeEqual(a,b))throw new BlingConnectorError('OAUTH_STATE_MISMATCH');
  if(received.searchParams.has('error'))throw new BlingConnectorError('OAUTH_PERMISSION_DENIED');
  const code=received.searchParams.get('code');
  if(!code||code.length>2048)throw new BlingConnectorError('OAUTH_CODE_MISSING');
  return code;
}
export async function tokenGrant({clientId,clientSecret,grantType,code,refreshToken,fetchImpl=fetch}) {
  const basic=credentials(clientId,clientSecret);
  if(!['authorization_code','refresh_token'].includes(grantType))throw new BlingConnectorError('OAUTH_GRANT_INVALID');
  const form=new URLSearchParams({grant_type:grantType});
  if(grantType==='authorization_code'){
    if(typeof code!=='string'||!code)throw new BlingConnectorError('OAUTH_CODE_MISSING');form.set('code',code);
  } else {
    if(typeof refreshToken!=='string'||!refreshToken)throw new BlingConnectorError('OAUTH_REFRESH_MISSING');form.set('refresh_token',refreshToken);
  }
  let response;
  try{response=await fetchImpl(tokenUrl,{method:'POST',redirect:'error',headers:{Authorization:basic,'Content-Type':'application/x-www-form-urlencoded','enable-jwt':'1',Accept:'application/json'},
    body:form.toString(),signal:AbortSignal.timeout(15000)});}catch{throw new BlingConnectorError('OAUTH_NETWORK_ERROR',true);}
  if(!response.ok)throw new BlingConnectorError(`OAUTH_HTTP_${response.status}`,response.status>=500||response.status===429);
  let body;try{body=await response.json();}catch{throw new BlingConnectorError('OAUTH_RESPONSE_INVALID');}
  if(!body||typeof body.access_token!=='string'||typeof body.refresh_token!=='string'||body.access_token.length<16||body.refresh_token.length<8||
    !Number.isFinite(Number(body.expires_in))||Number(body.expires_in)<30)throw new BlingConnectorError('OAUTH_RESPONSE_INVALID');
  return {schema:1,accessToken:body.access_token,refreshToken:body.refresh_token,expiresAt:Date.now()+Number(body.expires_in)*1000};
}
export async function startAuthorization({clientId,pendingPath}) {
  const state=randomBytes(32).toString('base64url');
  await atomicJson(pendingPath,{state,createdAt:Date.now()});
  return authorizationUrl(clientId,state);
}
export async function completeAuthorization({callback,pendingPath,tokenPath,clientId,clientSecret,redirectUri,fetchImpl=fetch}) {
  const pending=await loadJson(pendingPath);
  const code=validateCallback(callback,pending,redirectUri);
  const tokens=await tokenGrant({clientId,clientSecret,grantType:'authorization_code',code,fetchImpl});
  await atomicJson(tokenPath,tokens);
  // O codigo foi consumido; um novo fluxo precisa gerar outro state.
  await atomicJson(pendingPath,{state:'CONSUMED',createdAt:0});
  return {authorized:true};
}
export function createTokenManager({tokenPath,clientId,clientSecret,fetchImpl=fetch,now=Date.now}) {
  let current=null;
  return {async accessToken({force=false}={}) {
    if(!current){current=await loadJson(tokenPath);}
    if(current?.schema!==1||typeof current.accessToken!=='string'||typeof current.refreshToken!=='string'||
      !Number.isFinite(current.expiresAt))throw new BlingConnectorError('OAUTH_LOGIN_REQUIRED');
    if(force||current.expiresAt-now()<120000){
      const updated=await tokenGrant({clientId,clientSecret,grantType:'refresh_token',refreshToken:current.refreshToken,fetchImpl});
      // Refresh tokens rotacionam: persistir o novo antes de permitir consulta da API.
      await atomicJson(tokenPath,updated);current=updated;
    }
    return current.accessToken;
  }};
}

// Opcional para homologacao local caso o Bling aceite callback HTTP em 127.0.0.1/localhost.
// A troca do code ocorre no proprio callback, dentro do prazo curto do provedor.
export async function authorizeLoopback({clientId,clientSecret,redirectUri,pendingPath,tokenPath,fetchImpl=fetch,onUrl=console.log,timeoutMs=300000}) {
  const {createServer}=await import('node:http');
  const uri=redirect(redirectUri);
  if(uri.protocol!=='http:'||!['127.0.0.1','localhost'].includes(uri.hostname)||!uri.port)
    throw new BlingConnectorError('OAUTH_LOOPBACK_REQUIRES_LOCALHOST');
  return new Promise((resolve,reject)=>{
    let settled=false,timer=null;
    const server=createServer(async(req,res)=>{
      const requestUrl=new URL(req.url??'/',uri);
      if(req.method!=='GET'||requestUrl.origin!==uri.origin||requestUrl.pathname!==uri.pathname){
        res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');return;
      }
      if(settled){res.writeHead(409);res.end('Already processed');return;}
      try{
        await completeAuthorization({callback:requestUrl.href,pendingPath,tokenPath,clientId,clientSecret,redirectUri,fetchImpl});
        res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
        res.end('Bling conectado. Pode fechar esta pagina.');
        finish();
      }catch(e){
        res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
        res.end('Autorizacao nao concluida. Verifique o terminal.');
        finish(e);
      }
    });
    function finish(err){
      if(settled)return;settled=true;if(timer)clearTimeout(timer);server.close();
      if(err)reject(err);else resolve({authorized:true});
    }
    server.on('error',finish);
    server.listen(Number(uri.port),uri.hostname,async()=>{
      try{
        const url=await startAuthorization({clientId,pendingPath});
        timer=setTimeout(()=>finish(new BlingConnectorError('OAUTH_CALLBACK_TIMEOUT')),timeoutMs);
        onUrl(url);
      }catch(e){finish(e);}
    });
  });
}
