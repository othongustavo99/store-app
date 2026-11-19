// Omie official /api/v1/produtos/pedido/: IncluirPedido + ConsultarPedido only.
// No blind retries, even for HTTP 4xx, because the provider's transaction outcome can be uncertain.
import {fail,positive} from '../shared/safe_order_export.mjs';
const URL='https://app.omie.com.br/api/v1/produtos/pedido/';
export function createOmieOrderApi({token,fetchImpl=fetch}){
  if(typeof token!=='string'||token.length<16||/\s/.test(token))fail('OMIE_TOKEN_REQUIRED');
  async function call(method,param){
    let res;
    try{res=await fetchImpl(URL,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({call:method,param:[param]}),signal:AbortSignal.timeout(25000)});}
    catch{fail(method==='IncluirPedido'?'OMIE_CREATE_UNCERTAIN':'OMIE_LOOKUP_FAILED');}
    if(!res.ok)fail(`${method==='IncluirPedido'?'OMIE_CREATE':'OMIE_LOOKUP'}_HTTP_${res.status}`);
    let data;try{data=await res.json();}catch{fail(method==='IncluirPedido'?'OMIE_CREATE_UNCERTAIN':'OMIE_LOOKUP_INVALID');}
    if(!data||typeof data!=='object'||Array.isArray(data)||data.faultcode||data.faultstring)
      fail(method==='IncluirPedido'?'OMIE_CREATE_NOT_CONFIRMED':'OMIE_LOOKUP_ERROR');
    return data;
  }
  return {async create(body){const result=await call('IncluirPedido',body);
    if(!positive(Number(result.codigo_pedido)))fail('OMIE_CREATE_RESPONSE_UNCERTAIN');
    return {id:Number(result.codigo_pedido)};},
    async find(id){if(!positive(id))fail('OMIE_ORDER_ID_INVALID');return call('ConsultarPedido',{codigo_pedido:id});}};
}
