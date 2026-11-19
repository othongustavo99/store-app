// F40 Olist/Tiny ERP API V3 - somente LEITURA do ERP; escrita somente no Store App.
export class OlistConnectorError extends Error {
  constructor(code,retryable=false){super(code);this.name='OlistConnectorError';this.code=code;this.retryable=retryable;}
}
export const validUuid=v=>typeof v==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(v);
export const positiveId=v=>Number.isSafeInteger(v)&&v>0;
const integrationToken=/^f40i_[A-Za-z0-9_-]{43}$/;
export function createStoreClient({url,token,fetchImpl=fetch}){
  let base;try{base=new URL(url);}catch{throw new OlistConnectorError('STORE_URL_INVALID');}
  if((base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))||base.pathname!=='/'||base.search||base.hash||base.username||base.password)
    throw new OlistConnectorError('STORE_URL_INVALID');
  if(!integrationToken.test(token??''))throw new OlistConnectorError('STORE_TOKEN_INVALID');
  const routes=[
    {method:'GET',re:/^\/v1\/external\/catalog\/variants\?limit=100(?:&after=[a-f\d-]{36})?$/i},
    {method:'POST',re:/^\/v1\/external\/catalog\/products\/upsert$/},
    {method:'PUT',re:/^\/v1\/external\/inventory\/[a-f\d-]{36}$/i}
  ];
  return {async request(path,{method='GET',body}={}){
    if(!routes.some(r=>r.method===method&&r.re.test(path)))throw new OlistConnectorError('STORE_ROUTE_BLOCKED');
    const endpoint=new URL(path,base);
    if(endpoint.origin!==base.origin||!endpoint.pathname.startsWith('/v1/external/'))throw new OlistConnectorError('STORE_ROUTE_BLOCKED');
    let response;try{response=await fetchImpl(endpoint.toString(),{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw new OlistConnectorError('STORE_NETWORK_ERROR',true);}
    if(!response.ok)throw new OlistConnectorError(`STORE_HTTP_${response.status}`,[408,425,429,500,502,503,504].includes(response.status));
    try{return await response.json();}catch{throw new OlistConnectorError('STORE_INVALID_JSON');}
  }};
}
const API='https://api.tiny.com.br/public-api/v3';
export function createOlistClient({accessToken,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),minGapMs=2100}){
  if(typeof accessToken!=='function')throw new OlistConnectorError('ACCESS_TOKEN_PROVIDER_REQUIRED');
  let last=0;
  async function get(path){
    for(let attempt=0;attempt<3;attempt++){
      const wait=Math.max(0,minGapMs-(Date.now()-last));if(wait)await sleep(wait);last=Date.now();
      const bearer=await accessToken({force:false});let response;
      try{response=await fetchImpl(API+path,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${bearer}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});}
      catch{if(attempt<2){await sleep(1000*(attempt+1));continue;}throw new OlistConnectorError('OLIST_NETWORK_ERROR',true);}
      if(response.status===401&&attempt===0){await accessToken({force:true});continue;}
      if([408,425,429,500,502,503,504].includes(response.status)&&attempt<2){
        const retry=Number(response.headers?.get?.('retry-after'));
        await sleep(Number.isFinite(retry)&&retry>0?Math.min(retry*1000,30000):1000*(attempt+1));continue;
      }
      if(!response.ok)throw new OlistConnectorError(`OLIST_HTTP_${response.status}`,[408,425,429,500,502,503,504].includes(response.status));
      let data;try{data=await response.json();}catch{throw new OlistConnectorError('OLIST_INVALID_JSON');}
      if(!data||typeof data!=='object'||Array.isArray(data))throw new OlistConnectorError('OLIST_RESPONSE_INVALID');
      return data;
    }
    throw new OlistConnectorError('OLIST_RETRIES_EXHAUSTED');
  }
  return {
    async product(id){if(!positiveId(id))throw new OlistConnectorError('OLIST_PRODUCT_ID_INVALID');const p=await get(`/produtos/${id}`);if(p.id!==id)throw new OlistConnectorError('OLIST_PRODUCT_MISMATCH');return p;},
    async stock(id){if(!positiveId(id))throw new OlistConnectorError('OLIST_PRODUCT_ID_INVALID');const s=await get(`/estoque/${id}`);if(s.id!==id)throw new OlistConnectorError('OLIST_STOCK_MISMATCH');return s;}
  };
}
