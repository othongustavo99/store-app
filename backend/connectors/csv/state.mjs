/** Registro de operacoes CSV por loja. Nao armazenar credenciais neste arquivo. */
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {CsvIntegrationError} from './mapping.mjs';
const fail=code=>{throw new CsvIntegrationError(code);};
const own=(v)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export async function lockState(path){
  if(!isAbsolute(path??''))fail('CSV_STATE_ABSOLUTE_REQUIRED');
  let handle;
  try {handle=await open(`${path}.lock`,'wx',0o600);}catch{fail('CSV_STATE_LOCKED');}
  return async()=>{await handle.close();await unlink(`${path}.lock`).catch(()=>{});};
}
export async function loadState(path,storeId,integrationId){
  if(!isAbsolute(path??''))fail('CSV_STATE_ABSOLUTE_REQUIRED');
  let data;
  try {data=JSON.parse(await readFile(path,'utf8'));}
  catch(e){if(e?.code==='ENOENT')return {schema:1,provider:'csv',storeId,integrationId,operations:Object.create(null),variantIds:Object.create(null)};fail('CSV_STATE_INVALID');}
  if(data.schema!==1||data.provider!=='csv'||data.storeId!==storeId||data.integrationId!==integrationId||!own(data.operations)||!own(data.variantIds))fail('CSV_STATE_TENANT_MISMATCH');
  // Chaves externas podem ser 'constructor' ou '__proto__'; evitar acesso a prototipo.
  data.operations=Object.assign(Object.create(null),data.operations);
  data.variantIds=Object.assign(Object.create(null),data.variantIds);
  return data;
}
export async function saveState(path,state){
  const temp=`${path}.${process.pid}.${randomUUID()}.tmp`;
  try{await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);}
  catch{await unlink(temp).catch(()=>{});fail('CSV_STATE_WRITE_FAILED');}
}
export function operationFor(state,key,hash,now=Date.now()){
  const prior=state.operations[key];
  if(prior?.hash===hash)return {operation:prior,skip:prior.done===true};
  // Sem reconciliar uma operacao incerta, NAO sobrescrever eventId/sourceVersion pendente.
  if(prior && !prior.done)fail('CSV_PREVIOUS_OPERATION_PENDING');
  const version=Math.max(now,Number(prior?.version||0)+1);
  if(!Number.isSafeInteger(version)||version<1)fail('CSV_SOURCE_VERSION_INVALID');
  const operation={eventId:randomUUID(),version,hash,done:false};
  state.operations[key]=operation;
  return {operation,skip:false};
}
export function markDone(state,key){state.operations[key].done=true;}
