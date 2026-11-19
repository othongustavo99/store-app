// Apenas leitura no Bling; escrita somente nas rotas permitidas do Store App.
export class BlingConnectorError extends Error {
  constructor(code,retryable=false) {super(code);this.name='BlingConnectorError';this.code=code;this.retryable=retryable;}
}
const uuidPattern=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const integrationTokenPattern=/^f40i_[A-Za-z0-9_-]{43}$/;
export const validUuid=value=>typeof value==='string'&&uuidPattern.test(value);
export const positiveId=value=>Number.isSafeInteger(value)&&value>0;
function validStoreBase(url) {
  let u;try{u=new URL(url);}catch{throw new BlingConnectorError('STORE_URL_INVALID');}
  if((u.protocol!=='https:' && !(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))||
    u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw new BlingConnectorError('STORE_URL_INVALID');
  return u;
}
async function jsonResponse(response,context) {
  if(!response.ok)throw new BlingConnectorError(`${context}_HTTP_${response.status}`,[408,425,429,500,502,503,504].includes(response.status));
  try{return await response.json();}catch{throw new BlingConnectorError(`${context}_BAD_JSON`);}
}
export function createStoreClient({url,token,fetchImpl=fetch}) {
  const base=validStoreBase(url);
  if(!integrationTokenPattern.test(token??''))throw new BlingConnectorError('STORE_TOKEN_INVALID');
  const allowed=[
    {method:'GET',re:/^\/v1\/external\/catalog\/variants\?limit=100(?:&after=[0-9a-f-]{36})?$/i},
    {method:'POST',re:/^\/v1\/external\/catalog\/products\/upsert$/},
    {method:'PUT',re:/^\/v1\/external\/inventory\/[\da-f-]{36}$/i},
  ];
  return {async request(path,{method='GET',body}={}) {
    if(!allowed.some(x=>x.method===method&&x.re.test(path)))throw new BlingConnectorError('STORE_ROUTE_BLOCKED');
    const dest=new URL(path,base);
    if(dest.origin!==base.origin||!dest.pathname.startsWith('/v1/external/'))throw new BlingConnectorError('STORE_ROUTE_BLOCKED');
    let response;
    try{response=await fetchImpl(dest.toString(),{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}
    catch{throw new BlingConnectorError('STORE_NETWORK_ERROR',true);}
    return jsonResponse(response,'STORE');
  }};
}
const apiBase='https://api.bling.com.br/Api/v3';
export function createBlingClient({accessToken,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),minGapMs=370}) {
  if(typeof accessToken!=='function')throw new BlingConnectorError('ACCESS_TOKEN_PROVIDER_REQUIRED');
  let lastStart=0;
  async function get(path) {
    for(let attempt=0;attempt<3;attempt++) {
      const now=Date.now(),wait=Math.max(0,minGapMs-(now-lastStart));
      if(wait)await sleep(wait);
      lastStart=Date.now();
      const bearer=await accessToken({force:false});
      let response;
      try{response=await fetchImpl(`${apiBase}${path}`,{
        method:'GET',redirect:'error',headers:{Authorization:`Bearer ${bearer}`, 'enable-jwt':'1',Accept:'application/json'},
        signal:AbortSignal.timeout(20000),
      });}catch{if(attempt<2){await sleep((attempt+1)*1000);continue;}throw new BlingConnectorError('BLING_NETWORK_ERROR',true);}
      if(response.status===401&&attempt===0){await accessToken({force:true});continue;}
      if([429,500,502,503,504].includes(response.status)&&attempt<2) {
        const retryAfter=Number(response.headers?.get?.('retry-after'));
        const delay=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,30000):(attempt+1)*1000;
        await sleep(delay);continue;
      }
      const data=await jsonResponse(response,'BLING');
      if(!data||typeof data!=='object'||Array.isArray(data))throw new BlingConnectorError('BLING_FORMAT_INVALID');
      return data;
    }
    throw new BlingConnectorError('BLING_RETRIES_EXHAUSTED');
  }
  return {
    async product(id) {
      if(!positiveId(id))throw new BlingConnectorError('BLING_PRODUCT_ID_INVALID');
      const result=await get(`/produtos/${id}`);
      if(!result.data||Array.isArray(result.data)||result.data.id!==id)throw new BlingConnectorError('BLING_PRODUCT_RESPONSE_MISMATCH');
      return result.data;
    },
    async physicalStock(id) {
      if(!positiveId(id))throw new BlingConnectorError('BLING_PRODUCT_ID_INVALID');
      const query=new URLSearchParams();query.append('idsProdutos[]',String(id));
      return get(`/estoques/saldos?${query.toString()}`);
    },
  };
}
