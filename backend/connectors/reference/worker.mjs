// Frequencia40: executor de referencia para adaptadores ERP/PDV.
// Execute em processo SEPARADO do backend e somente apos implementar o adapter.
// Node.js 22+. Sem dependencias de terceiros e sem tokens no codigo.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const env = (name) => (process.env[name] ?? '').trim();
const base = env('F40_API_URL');
const token = env('F40_INTEGRATION_TOKEN');
const adapterFile = env('F40_ADAPTER_FILE');
const interval = Number(env('F40_POLL_INTERVAL_MS') || 10000);
const limit = Number(env('F40_BATCH_LIMIT') || 10);
if (!base || !token || !adapterFile) throw new Error('F40_API_URL, F40_INTEGRATION_TOKEN e F40_ADAPTER_FILE sao obrigatorias.');
if (!/^f40i_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Token de integracao invalido.');
if (!Number.isSafeInteger(interval) || interval < 2000 || interval > 60000) throw new Error('Intervalo fora de 2000..60000 ms.');
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30) throw new Error('F40_BATCH_LIMIT fora de 1..30.');
const endpoint = new URL(base);
if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost','127.0.0.1'].includes(endpoint.hostname))) {
  throw new Error('F40_API_URL precisa ser HTTPS em producao.');
}
if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('F40_API_URL nao deve incluir credenciais nem query string.');
const adapter = await import(pathToFileURL(resolve(adapterFile)).href);
// Previne ACK de eventos com adapter demonstrativo/incompleto.
if (adapter.ready !== true || typeof adapter.processEvent !== 'function') {
  throw new Error('Configure um adapter pronto (ready=true e processEvent) antes de consumir eventos.');
}

async function api(path, method='GET', body) {
  if (!/^\/v1\/external\//.test(path)) throw new Error('Acesso fora da API externa proibido.');
  const url = new URL(path, endpoint);
  if (url.origin !== endpoint.origin || !url.pathname.startsWith('/v1/external/')) {
    throw new Error('URL remota nao autorizada.');
  }
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : {'Content-Type':'application/json'}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const err = new Error(`Store API retornou HTTP ${res.status}`);
    err.code = res.status === 429 || res.status >= 500 ? 'STORE_API_TEMPORARY' : 'STORE_API_REJECTED';
    err.retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  return res.json();
}

async function once() {
  const claimed = await api('/v1/external/events/claim', 'POST', {limit});
  for (const event of claimed.events ?? []) {
    const path = `/v1/external/events/${event.id}`;
    try {
      // O adaptador DEVE persistir no ERP de forma idempotente usando event.id.
      // Nao usar apenas a conclusao de um fetch como prova de persistencia.
      const result = await adapter.processEvent({
        event: {id:event.id,type:event.type,resourceId:event.resourceId,attempts:event.attempts},
        idempotencyKey: `store-${event.id}`,
        getStoreResource: (resourcePath) => api(resourcePath),
        abortSignal: AbortSignal.timeout(240000),
      });
      if (!result || result.committed !== true) {
        const error = new Error('Adaptador nao confirmou persistencia no ERP.');
        error.code = 'ADAPTER_NOT_COMMITTED';
        throw error;
      }
      await api(`${path}/ack`,'POST',{leaseToken:event.leaseToken});
      console.log(`[f40] evento ${event.id} confirmado`);
    } catch (err) {
      // Apenas codigos padronizados, jamais mensagens com PII nem tokens nos logs.
      const code = typeof err?.code === 'string' && /^[A-Z][A-Z0-9_]{2,47}$/.test(err.code) ? err.code : 'ADAPTER_ERROR';
      try {
        await api(`${path}/nack`,'POST',{leaseToken:event.leaseToken,code,retryable:err?.retryable!==false});
      } catch {
        // NACK pode falhar ou lease pode ter expirado. Ele sera retomado automaticamente.
        console.error(`[f40] evento ${event.id}: nao foi possivel registrar NACK`);
      }
      console.error(`[f40] evento ${event.id}: ${code}`);
    }
  }
  return (claimed.events ?? []).length;
}

let stopping = false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
const pause = (ms)=>new Promise(resolve=>setTimeout(resolve,ms));
if (env('F40_ONCE') === 'true') {
  await once();
} else {
  while (!stopping) {
    try { await once(); }
    catch { console.error('[f40] falha de comunicacao com Store API; proxima tentativa no intervalo.'); }
    if (!stopping) await pause(interval);
  }
}
