// F5.9 - telemetria sem dados de cliente, sem credenciais em logs.
// Sinaliza ultimo ciclo do worker, NAO confirma disponibilidade do ERP.
const credential=/^f40i_[A-Za-z0-9_-]{43}$/;
const code=/^[A-Z][A-Z0-9_]{2,47}$/;
const counter=(value)=>Number.isSafeInteger(value)&&value>=0&&value<=10000;
const totals=['claimed','acknowledged','review','retry','ackErrors'];

export function createConnectorHealthClient({url,token,fetchImpl=fetch}) {
  let base;
  try {base=new URL(url);} catch {throw Error('HEALTH_CONFIG_INVALID');}
  if(!['https:','http:'].includes(base.protocol)||
    (base.protocol==='http:'&&!['localhost','127.0.0.1'].includes(base.hostname))||
    base.pathname!=='/'||base.search||base.hash||base.username||base.password||
    !credential.test(token??'')) throw Error('HEALTH_CONFIG_INVALID');

  return async function reportCycle({result,errorCode,summary}) {
    if(!['OK','WARNING','ERROR'].includes(result)||
      (result==='ERROR'&&!code.test(errorCode??''))||
      (result==='OK'&&errorCode!==undefined)||
      (errorCode!==undefined&&!code.test(errorCode))||
      (summary!==undefined && (!summary||typeof summary!=='object'||
        Object.keys(summary).some(k=>!totals.includes(k))||
        totals.some(k=>!counter(summary[k]))))) throw Error('HEALTH_REPORT_INVALID');
    const body={component:'ORDERS',result};
    if(errorCode)body.errorCode=errorCode;
    if(summary)body.summary=Object.fromEntries(totals.map(k=>[k,summary[k]]));
    let response;
    try {
      response=await fetchImpl(new URL('/v1/external/health/report',base),{
        method:'POST',redirect:'error',
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify(body),signal:AbortSignal.timeout(10000),
      });
    } catch {throw Error('HEALTH_NETWORK_ERROR');}
    if(!response.ok)throw Error('HEALTH_HTTP_ERROR');
    return {recorded:true};
  };
}
