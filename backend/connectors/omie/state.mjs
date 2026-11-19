// Estado local persistente da integracao: sem tokens. Use volume dedicado e backup.
import {randomUUID} from 'node:crypto';
import {open,readFile,rename,writeFile,unlink} from 'node:fs/promises';
import {ConnectorError} from './clients.mjs';
import {isAbsolute} from 'node:path';
const empty=()=>({schema:1,operations:{},variantIds:{}});
export async function lockState(path) {
  if(!path||!isAbsolute(path))throw new ConnectorError('ABSOLUTE_STATE_PATH_REQUIRED');
  let handle;
  try {handle=await open(`${path}.lock`,'wx',0o600); await handle.writeFile(`${process.pid}\n`);} catch{throw new ConnectorError('STATE_LOCKED');}
  return async()=>{await handle.close();await unlink(`${path}.lock`).catch(()=>{});};
}
export async function loadState(path) {
  try {
    const state=JSON.parse(await readFile(path,'utf8'));
    if(state?.schema!==1 || !state.operations || !state.variantIds || Array.isArray(state.operations))throw Error();
    return state;
  }catch(e){if(e?.code==='ENOENT')return empty();throw new ConnectorError('STATE_INVALID');}
}
export async function saveState(path,state) {
  const temp=`${path}.${process.pid}.${randomUUID()}.tmp`;
  try {await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);}catch {await unlink(temp).catch(()=>{});throw new ConnectorError('STATE_WRITE_FAILED');}
}
export function prepareOperation(state,key,hash,now=Date.now()){
  const old=state.operations[key];
  if(old?.hash===hash)return {operation:old,skip:old.done===true};
  const version=Math.max(Number(old?.version||0)+1,now);
  if(!Number.isSafeInteger(version)||version<=0)throw new ConnectorError('INVALID_SOURCE_VERSION');
  const operation={hash,version,eventId:randomUUID(),done:false};
  state.operations[key]=operation;
  return {operation,skip:false};
}
export function markDone(state,key){state.operations[key].done=true;}
