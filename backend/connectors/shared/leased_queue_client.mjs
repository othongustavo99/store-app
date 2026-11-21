// Frequencia40 F5.6 - cliente restrito a fila LEASED da API Store App.
// Nao registra URLs, cabecalhos ou respostas de terceiros nos logs.
const tokenPattern=/^f40i_[A-Za-z0-9_-]{43}$/;
const leasePattern=/^f40l_[A-Za-z0-9_-]{43}$/;
const eventPattern=/^[1-9]\d{0,17}$/;
export class QueueError extends Error {
  constructor(code,retryable=false){super(code);this.name='QueueError';this.code=code;this.retryable=retryable;}
}
const invalid=code=>{throw new QueueError(code);};
export function createLeasedQueueClient({url,token,fetchImpl=fetch}){
  let base;try{base=new URL(url);}catch{invalid('QUEUE_URL_INVALID');}
  if(base.pathname!=='/'||base.search||base.hash||base.username||base.password||
    (base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))||
    !tokenPattern.test(token??''))invalid('QUEUE_CONFIG_INVALID');
  async function send(path,body){
    let response;
    try{response=await fetchImpl(new URL(path,base),{method:'POST',redirect:'error',headers:{
      Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}
    catch{throw new QueueError('QUEUE_NETWORK_ERROR',true);}
    if(!response.ok)throw new QueueError(`QUEUE_HTTP_${response.status}`,response.status===429||response.status>=500);
    try{return await response.json();}catch{throw new QueueError('QUEUE_RESPONSE_INVALID',true);}
  }
  function eventInput(e){
    if(!e||!eventPattern.test(e.id??'')||!leasePattern.test(e.leaseToken??''))invalid('QUEUE_LEASE_INVALID');
    return `/v1/external/events/${e.id}`;
  }
  return {
    async claim(limit){
      if(!Number.isSafeInteger(limit)||limit<1||limit>10)invalid('QUEUE_BATCH_INVALID');
      const data=await send('/v1/external/events/claim',{limit,types:['order.changed']});
      if(!Array.isArray(data?.events)||data.events.length>limit||data.events.some(e=>
        !eventPattern.test(e?.id??'')||!leasePattern.test(e?.leaseToken??'')||
        e?.type!=='order.changed'||typeof e?.resourceId!=='string'))invalid('QUEUE_CLAIM_INVALID');
      return data.events;
    },
    ack(event){return send(`${eventInput(event)}/ack`,{leaseToken:event.leaseToken});},
    nack(event,code,retryable=false){
      if(!/^[A-Z][A-Z0-9_]{2,47}$/.test(code??''))invalid('QUEUE_NACK_CODE_INVALID');
      return send(`${eventInput(event)}/nack`,{leaseToken:event.leaseToken,code,retryable});
    },
  };
}
