// Only GET specific order by ID and one POST creation. A failed POST is ambiguous: NEVER auto retry.
import {fail,positive} from '../shared/safe_order_export.mjs';
const BASE='https://api.bling.com.br/Api/v3/pedidos/vendas';
export function createBlingOrderApi({accessToken,fetchImpl=fetch}){
  if(typeof accessToken!=='function')fail('BLING_TOKEN_PROVIDER_REQUIRED');
  async function request(method,id,body){
    if(method==='GET'&&!positive(id))fail('BLING_ORDER_ID_INVALID');
    const token=await accessToken({force:false});if(!token)fail('BLING_TOKEN_MISSING');
    let response;
    try{response=await fetchImpl(method==='GET'?`${BASE}/${id}`:BASE,{method,redirect:'error',
      headers:{Authorization:`Bearer ${token}`,Accept:'application/json','enable-jwt':'1',...(method==='POST'?{'Content-Type':'application/json'}:{})},
      ...(method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});}
    catch{fail(method==='POST'?'BLING_CREATE_UNCERTAIN':'BLING_LOOKUP_FAILED');}
    if(!response.ok)fail(`${method==='POST'?'BLING_CREATE':'BLING_LOOKUP'}_HTTP_${response.status}`);
    let json;try{json=await response.json();}catch{fail(method==='POST'?'BLING_CREATE_UNCERTAIN':'BLING_LOOKUP_INVALID');}
    if(method==='POST'&&!positive(json?.data?.id))fail('BLING_CREATE_RESPONSE_UNCERTAIN');
    return json;
  }
  return {async create(body){const data=await request('POST',null,body);return {id:data.data.id};},async find(id){return request('GET',id);}};
}
