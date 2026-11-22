/** Cliente Store App com allowlist estrita de rotas e sem log de tokens. */
import {CsvIntegrationError} from './mapping.mjs';
const fail=code=>{throw new CsvIntegrationError(code);};
const token=/^f40i_[A-Za-z0-9_-]{43}$/;
const paths=[
  ['GET',/^\/v1\/external\/catalog\/variants\?limit=100(?:&after=[\da-f-]{36})?$/i],
  ['POST',/^\/v1\/external\/catalog\/products\/upsert$/],
  ['PUT',/^\/v1\/external\/inventory\/[\da-f-]{36}$/i],
];
export function createStoreClient({url,secret,fetchImpl=fetch}){
  let base;
  try{base=new URL(url);}catch{fail('CSV_STORE_URL_INVALID');}
  if(!(base.protocol==='https:'||(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))||
    base.pathname!=='/'||base.search||base.hash||base.username||base.password)fail('CSV_STORE_URL_INVALID');
  if(!token.test(secret??''))fail('CSV_STORE_TOKEN_INVALID');
  return {async request(path,{method='GET',body}={}){
    if(!paths.some(([m,re])=>m===method&&re.test(path)))fail('CSV_STORE_ROUTE_NOT_ALLOWED');
    const dest=new URL(path,base);
    if(dest.origin!==base.origin||!dest.pathname.startsWith('/v1/external/'))fail('CSV_STORE_ROUTE_NOT_ALLOWED');
    let response;
    try{response=await fetchImpl(dest.toString(),{method,redirect:'error',headers:{Authorization:`Bearer ${secret}`,...(body===undefined?{}:{'Content-Type':'application/json'})},
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{fail('CSV_STORE_NETWORK_ERROR');}
    if(!response.ok)fail(`CSV_STORE_HTTP_${response.status}`);
    try{return await response.json();}catch{fail('CSV_STORE_INVALID_JSON');}
  }};
}
