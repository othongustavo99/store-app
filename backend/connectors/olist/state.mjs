// Operacoes duraveis de importacao. Nenhum segredo OAuth e salvo aqui.
import { randomUUID } from 'node:crypto';
import { readFile, open, writeFile, rename, unlink } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { OlistConnectorError } from './clients.mjs';

export const newState=()=>({schema:1,operations:{},variantIds:{}});
export async function lockFile(file) {
  if(typeof file!=='string'||!isAbsolute(file))throw new OlistConnectorError('ABSOLUTE_PATH_REQUIRED');
  let h;
  try {h=await open(`${file}.lock`,'wx',0o600);await h.writeFile(`${process.pid}\n`);}catch{throw new OlistConnectorError('STATE_LOCKED');}
  return async()=>{await h.close();await unlink(`${file}.lock`).catch(()=>{});};
}
export async function atomicJson(file,data) {
  if(typeof file!=='string'||!isAbsolute(file))throw new OlistConnectorError('ABSOLUTE_PATH_REQUIRED');
  const tmp=`${file}.${process.pid}.${randomUUID()}.tmp`;
  try {await writeFile(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(tmp,file);}catch{await unlink(tmp).catch(()=>{});throw new OlistConnectorError('STATE_WRITE_FAILED');}
}
export async function loadJson(file,{optional=false}={}) {
  try {return JSON.parse(await readFile(file,'utf8'));}
  catch(e){if(optional && e?.code==='ENOENT')return null;throw new OlistConnectorError('STATE_READ_FAILED');}
}
export async function loadState(file) {
  const obj=await loadJson(file,{optional:true});
  if(obj===null)return newState();
  if(obj?.schema!==1||!obj.operations||typeof obj.operations!=='object'||Array.isArray(obj.operations)||
    !obj.variantIds||typeof obj.variantIds!=='object'||Array.isArray(obj.variantIds))throw new OlistConnectorError('INVALID_STATE');
  return obj;
}
export function operationFor(state,key,hash,now=Date.now()) {
  const old=state.operations[key];
  if(old?.hash===hash)return {operation:old,skip:old.done===true};
  const version=Math.max(now,Number(old?.version||0)+1);
  if(!Number.isSafeInteger(version))throw new OlistConnectorError('SOURCE_VERSION_INVALID');
  const op={hash,version,eventId:randomUUID(),done:false};state.operations[key]=op;
  return {operation:op,skip:false};
}
export function markDone(state,key) {state.operations[key].done=true;}
