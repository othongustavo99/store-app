// Frequencia40 | Omie -> Store App. Node 22+, sem dependencias externas.
// Segredos exclusivamente em variaveis de ambiente; resposta de erro nunca inclui PII.
export class ConnectorError extends Error {
  constructor(code, retryable = false) { super(code); this.name='ConnectorError'; this.code=code; this.retryable=retryable; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenRx = /^f40i_[A-Za-z0-9_-]{43}$/;
export function validateEndpoint(value) {
  let url;
  try { url=new URL(value); } catch { throw new ConnectorError('INVALID_STORE_URL'); }
  if (!['https:','http:'].includes(url.protocol) || (url.protocol==='http:' && !['localhost','127.0.0.1'].includes(url.hostname)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new ConnectorError('INVALID_STORE_URL');
  return url;
}
export function validateUuid(value){return typeof value==='string' && uuid.test(value);}
async function responseJson(response, code) {
  if (!response.ok) throw new ConnectorError(`${code}_${response.status}`, response.status===408||response.status===429||response.status>=500);
  try {return await response.json();} catch {throw new ConnectorError(`${code}_INVALID_JSON`);}
}
export function createStoreClient({url,token,fetchImpl=fetch}) {
  const base=validateEndpoint(url);
  if(!tokenRx.test(token))throw new ConnectorError('INVALID_STORE_TOKEN');
  return {
    async request(path, {method='GET',body}={}) {
      if(!/^\/v1\/external\/[A-Za-z0-9_/?=&.-]+$/.test(path)) throw new ConnectorError('STORE_PATH_NOT_ALLOWED');
      const destination=new URL(path,base);
      if(destination.origin!==base.origin || !destination.pathname.startsWith('/v1/external/')) throw new ConnectorError('STORE_PATH_NOT_ALLOWED');
      let response;
      try {response=await fetchImpl(destination.toString(),{method,redirect:'error',headers:{'Authorization':`Bearer ${token}`, ...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});} catch{throw new ConnectorError('STORE_NETWORK_ERROR',true);}
      return responseJson(response,'STORE_HTTP');
    },
  };
}
const OMIE_URLS={products:'https://app.omie.com.br/api/v1/geral/produtos/',inventory:'https://app.omie.com.br/api/v1/estoque/consulta/'};
const allowed={products:new Set(['ConsultarProduto']),inventory:new Set(['ListarPosEstoque'])};
export function createOmieClient({token,fetchImpl=fetch}) {
  if(typeof token!=='string'||token.trim().length<16 || /\s/.test(token))throw new ConnectorError('INVALID_OMIE_TOKEN');
  return {
    async call(section,call,param) {
      if(!allowed[section]?.has(call))throw new ConnectorError('OMIE_OPERATION_NOT_ALLOWED');
      let res;
      try {res=await fetchImpl(OMIE_URLS[section],{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({call,param:[param]}),signal:AbortSignal.timeout(20000)});} catch {throw new ConnectorError('OMIE_NETWORK_ERROR',true);}
      const data=await responseJson(res,'OMIE_HTTP');
      if(!data || typeof data!=='object'||Array.isArray(data))throw new ConnectorError('OMIE_RESPONSE_INVALID');
      if(data.faultcode!==undefined||data.faultstring!==undefined)throw new ConnectorError('OMIE_BUSINESS_ERROR');
      return data;
    },
  };
}
