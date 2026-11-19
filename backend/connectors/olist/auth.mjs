import {randomBytes,timingSafeEqual} from 'node:crypto';
import {atomicJson,loadJson} from './state.mjs';
import {OlistConnectorError} from './clients.mjs';
const base='https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect';
const tokenUrl=`${base}/token`;
function redirect(value){let u;try{u=new URL(value);}catch{throw new OlistConnectorError('OAUTH_REDIRECT_INVALID');}
  if((u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))||u.username||u.password||u.search||u.hash)throw new OlistConnectorError('OAUTH_REDIRECT_INVALID');return u;
}
function credentials(id,secret){if(typeof id!=='string'||!id.trim()||typeof secret!=='string'||!secret.trim()||id.length>512||secret.length>512)throw new OlistConnectorError('OLIST_CLIENT_CREDENTIALS_REQUIRED');}
export function authorizationUrl(clientId,redirectUri,state){redirect(redirectUri);if(typeof clientId!=='string'||!clientId.trim()||!/^[a-zA-Z0-9_-]{30,150}$/.test(state??''))throw new OlistConnectorError('OAUTH_INPUT_INVALID');
  const u=new URL(`${base}/auth`);u.searchParams.set('client_id',clientId);u.searchParams.set('response_type','code');u.searchParams.set('redirect_uri',redirectUri);u.searchParams.set('state',state);u.searchParams.set('scope','openid');return u.toString();
}
export function validateCallback(callback,pending,redirectUri,now=Date.now()){
  const expected=redirect(redirectUri);let got;try{got=new URL(callback);}catch{throw new OlistConnectorError('OAUTH_CALLBACK_INVALID');}
  if(expected.origin!==got.origin||expected.pathname!==got.pathname)throw new OlistConnectorError('OAUTH_CALLBACK_MISMATCH');
  if(!pending||typeof pending.state!=='string'||!Number.isFinite(pending.createdAt)||now<pending.createdAt-60000||now-pending.createdAt>300000)throw new OlistConnectorError('OAUTH_SESSION_EXPIRED');
  const a=Buffer.from(pending.state),b=Buffer.from(got.searchParams.get('state')??'');if(a.length!==b.length||!timingSafeEqual(a,b))throw new OlistConnectorError('OAUTH_STATE_MISMATCH');
  if(got.searchParams.has('error'))throw new OlistConnectorError('OAUTH_PERMISSION_DENIED');const code=got.searchParams.get('code');if(!code||code.length>2048)throw new OlistConnectorError('OAUTH_CODE_MISSING');return code;
}
export async function tokenGrant({clientId,clientSecret,grantType,code,refreshToken,redirectUri,fetchImpl=fetch,now=Date.now}){
  credentials(clientId,clientSecret);if(!['authorization_code','refresh_token'].includes(grantType))throw new OlistConnectorError('OAUTH_GRANT_INVALID');
  const form=new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:grantType});
  if(grantType==='authorization_code'){redirect(redirectUri);if(!code)throw new OlistConnectorError('OAUTH_CODE_MISSING');form.set('code',code);form.set('redirect_uri',redirectUri);}
  else{if(!refreshToken)throw new OlistConnectorError('OAUTH_REFRESH_MISSING');form.set('refresh_token',refreshToken);}
  let response;try{response=await fetchImpl(tokenUrl,{method:'POST',redirect:'error',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:form.toString(),signal:AbortSignal.timeout(15000)});}catch{throw new OlistConnectorError('OAUTH_NETWORK_ERROR',true);}
  if(!response.ok)throw new OlistConnectorError(`OAUTH_HTTP_${response.status}`,[429,500,502,503,504].includes(response.status));
  let data;try{data=await response.json();}catch{throw new OlistConnectorError('OAUTH_RESPONSE_INVALID');}
  if(typeof data?.access_token!=='string'||data.access_token.length<16||typeof data?.refresh_token!=='string'||data.refresh_token.length<8||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<30)throw new OlistConnectorError('OAUTH_RESPONSE_INVALID');
  return {schema:1,accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:now()+Number(data.expires_in)*1000};
}
export async function startAuthorization({clientId,redirectUri,pendingPath,now=Date.now}){
  const state=randomBytes(32).toString('base64url');await atomicJson(pendingPath,{state,createdAt:now()});return authorizationUrl(clientId,redirectUri,state);
}
export async function completeAuthorization({callback,pendingPath,tokenPath,clientId,clientSecret,redirectUri,fetchImpl=fetch}){
  const pending=await loadJson(pendingPath),code=validateCallback(callback,pending,redirectUri);
  const tokens=await tokenGrant({clientId,clientSecret,grantType:'authorization_code',code,redirectUri,fetchImpl});
  await atomicJson(tokenPath,tokens);await atomicJson(pendingPath,{state:'USED',createdAt:0});return {authorized:true};
}
export function createTokenManager({tokenPath,clientId,clientSecret,fetchImpl=fetch,now=Date.now}){
  let current=null;
  return {async accessToken({force=false}={}){
    // A mesma pasta/estado deve ser usada por uma unica instancia do conector por loja.
    if(!current)current=await loadJson(tokenPath);
    if(current?.schema!==1||typeof current.accessToken!=='string'||typeof current.refreshToken!=='string'||!Number.isFinite(current.expiresAt))throw new OlistConnectorError('OAUTH_LOGIN_REQUIRED');
    if(force||current.expiresAt-now()<120000){const updated=await tokenGrant({clientId,clientSecret,grantType:'refresh_token',refreshToken:current.refreshToken,fetchImpl,now});await atomicJson(tokenPath,updated);current=updated;}
    return current.accessToken;
  }};
}
