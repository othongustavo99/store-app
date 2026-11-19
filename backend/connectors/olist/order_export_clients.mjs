// Clientes restritos a rotas necessarias para a exportacao assistida.
import {OlistConnectorError,validUuid,positiveId} from './clients.mjs';
const fail=(code,retryable=false)=>{throw new OlistConnectorError(code,retryable);};
const integrationToken=/^f40i_[A-Za-z0-9_-]{43}$/;

export function createOrderStoreClient({url,token,fetchImpl=fetch}) {
  let base;try{base=new URL(url);}catch{fail('STORE_URL_INVALID');}
  if(!base || !['https:','http:'].includes(base.protocol)||
    (base.protocol==='http:'&&!['localhost','127.0.0.1'].includes(base.hostname))||
    base.pathname!=='/'||base.search||base.hash||base.username||base.password||!integrationToken.test(token??''))fail('STORE_URL_OR_TOKEN_INVALID');
  return {async request(path,{method='GET',body}={}){
    const re=/^\/v1\/external\/orders\/([0-9a-f-]{36})(?:\/sync)?$/i;
    const m=re.exec(path);
    if(!m||!validUuid(m[1])||!((method==='GET')||(method==='POST'&&path.endsWith('/sync'))))fail('STORE_ROUTE_FORBIDDEN');
    const endpoint=new URL(path,base);
    if(endpoint.origin!==base.origin)fail('STORE_ROUTE_FORBIDDEN');
    let response;try{response=await fetchImpl(endpoint.toString(),{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{fail('STORE_NETWORK_ERROR',true);}
    if(!response.ok)fail(`STORE_HTTP_${response.status}`,[408,425,429,500,502,503,504].includes(response.status));
    try{return await response.json();}catch{fail('STORE_INVALID_JSON');}
  }};
}
const API='https://api.tiny.com.br/public-api/v3';
export function createOlistOrderClient({accessToken,fetchImpl=fetch}) {
  if(typeof accessToken!=='function')fail('OLIST_TOKEN_PROVIDER_REQUIRED');
  return {
    async create(body){
      // Uma unica tentativa. Resposta ausente/timeout = INCERTEZA, nunca repetir POST automaticamente.
      const bearer=await accessToken({force:false});let response;
      try{response=await fetchImpl(`${API}/pedidos`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${bearer}`,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});}
      catch{fail('OLIST_CREATE_UNCERTAIN',false);}
      if(!response.ok)fail(`OLIST_CREATE_HTTP_${response.status}`,false);
      let result;try{result=await response.json();}catch{fail('OLIST_CREATE_UNCERTAIN');}
      if(!positiveId(result?.id))fail('OLIST_CREATE_RESPONSE_UNCERTAIN');
      return {id:result.id,numeroPedido:result.numeroPedido??null};
    },
    async find(id){
      if(!positiveId(id))fail('OLIST_ORDER_ID_INVALID');
      const bearer=await accessToken({force:false});let response;
      try{response=await fetchImpl(`${API}/pedidos/${id}`,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${bearer}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});}catch{fail('OLIST_LOOKUP_UNAVAILABLE',true);}
      if(!response.ok)fail(`OLIST_LOOKUP_HTTP_${response.status}`,response.status===429||response.status>=500);
      try{return await response.json();}catch{fail('OLIST_LOOKUP_INVALID');}
    },
  };
}
