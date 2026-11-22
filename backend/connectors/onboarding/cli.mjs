#!/usr/bin/env node
/** F5.20 — CLI puramente local. Sem endpoints, tokens, envs ou ativações. */
import {lstat,mkdir,open,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createKit,validateKitFiles,OnboardingError,MODES,FILE_NAMES} from './onboarding.mjs';

const bad=code=>{throw new OnboardingError(code);};
const MAX_SIZE=80_000;
export function parseArgs(argv){
  const mode=argv[0];
  if(mode==='--doctor'&&argv.length===1)return {action:'doctor'};
  if(mode==='--check'&&argv.length===2&&!argv[1].startsWith('--'))return {action:'check',path:argv[1]};
  if(mode==='--init'){
    let opts={};
    for(let i=1;i<argv.length;i+=2){
      const key=argv[i],val=argv[i+1];
      if(!['--mode','--alias','--output'].includes(key)||!val||val.startsWith('--')||Object.hasOwn(opts,key))bad('ONBOARDING_CLI_USAGE');
      opts[key]=val;
    }
    if(Object.keys(opts).length!==3||!MODES.includes(opts['--mode']))bad('ONBOARDING_CLI_USAGE');
    return {action:'init',mode:opts['--mode'],alias:opts['--alias'],path:opts['--output']};
  }
  bad('ONBOARDING_CLI_USAGE');
}
async function readSafe(path,max=MAX_SIZE){
  const st=await lstat(path).catch(()=>bad('ONBOARDING_FILE_MISSING'));
  if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>max)bad('ONBOARDING_FILE_INVALID');
  const file=await open(path,'r');
  try{
    const bytes=await file.readFile();
    if(!bytes.length||bytes.length>max)bad('ONBOARDING_FILE_INVALID');
    return bytes.toString('utf8');
  }finally{await file.close();}
}
export async function initKit({mode,alias,path}){
  const kit=createKit({mode,alias});
  const dir=resolve(path);
  try{await mkdir(dir,{recursive:false});}
  catch(e){if(e?.code==='EEXIST')bad('ONBOARDING_TARGET_EXISTS');bad('ONBOARDING_CREATE_FAILED');}
  try{
    for(const name of FILE_NAMES){await writeFile(join(dir,name),kit.files[name],{flag:'wx',mode:0o600});}
    await writeFile(join(dir,'manifest.json'),JSON.stringify(kit.manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    return {directory:dir,...validateKitFiles(kit.files,kit.manifest)};
  }catch(e){
    // Só removemos nosso diretório recém-criado (nenhum diretório já existente é tocado).
    await rm(dir,{recursive:true,force:true}).catch(()=>{});
    throw e;
  }
}
export async function checkKit(path){
  const dir=resolve(path);
  const dirStat=await lstat(dir).catch(()=>bad('ONBOARDING_DIR_INVALID'));
  if(!dirStat.isDirectory()||dirStat.isSymbolicLink())bad('ONBOARDING_DIR_INVALID');
  const names=await readdir(dir);
  const expected=[...FILE_NAMES,'manifest.json'];
  if(names.length!==expected.length||expected.some(n=>!names.includes(n)))bad('ONBOARDING_UNKNOWN_FILES');
  const files={};
  for(const name of FILE_NAMES)files[name]=await readSafe(join(dir,name));
  let manifest;
  try{manifest=JSON.parse(await readSafe(join(dir,'manifest.json')));}
  catch(e){if(e instanceof OnboardingError)throw e;bad('ONBOARDING_MANIFEST_JSON_INVALID');}
  return validateKitFiles(files,manifest);
}
const requirements=[
  ['migrations/019_external_integrations.sql','Migração de integrações'],
  ['migrations/020_external_catalog_sync.sql','Catálogo'],
  ['migrations/021_external_order_sync.sql','Pedidos'],
  ['migrations/022_external_event_delivery.sql','Fila de eventos'],
  ['migrations/023_external_connector_health.sql','Saúde dos conectores'],
  ['migrations/024_external_deployment_profiles.sql','Perfil de implantação'],
  ['src/routes/external_integrations.ts','API administrativa'],
  ['src/routes/external_go_live_preflight.ts','Pré-homologação'],
  ['connectors/bling/sync.mjs','Bling'],
  ['connectors/omie/sync.mjs','Omie'],
  ['connectors/olist/sync.mjs','Olist/Tiny'],
  ['connectors/csv/sync.mjs','Importação CSV'],
  ['connectors/csv/order_export_cli.mjs','Exportação CSV de pedidos'],
  ['connectors/csv/order_reconcile_cli.mjs','Conciliação manual CSV'],
  ['connectors/csv/order_ack_import_cli.mjs','Leitor de retornos CSV'],
  ['connectors/assessment/cli.mjs','Avaliação de compatibilidade'],
  ['connectors/deployment/cli.mjs','Dossiê de implantação'],
  ['connectors/reference/adapter.example.mjs','Adaptador de referência futuro'],
];
/** Inspeciona arquivos no disco, NÃO testa funcionamento remoto nem execução de migrations. */
export async function doctor({root=fileURLToPath(new URL('../../',import.meta.url))}={}){
  const checks=await Promise.all(requirements.map(async([path,label])=>{
    const stat=await lstat(join(root,path)).catch(()=>null);
    return {path,label,present:Boolean(stat?.isFile()&&!stat?.isSymbolicLink())};
  }));
  return {mode:'OFFLINE_SOURCE_AUDIT',filesPresent:checks.filter(c=>c.present).length,
    filesExpected:checks.length,allFilesPresent:checks.every(c=>c.present),
    checks,ownErpConnectorImplemented:false,liveSupplierHomologation:false,
    databaseMigrationsApplied:null,productionAuthorized:false,
    caution:'Existência de arquivos não comprova compilação, API funcional, banco migrado ou ERP homologado.'};
}
async function main(){
  try{
    const args=parseArgs(process.argv.slice(2));
    if(args.action==='init'){
      const r=await initKit(args);
      console.log(`F40 KIT CRIADO: ${r.directory}\nF40 KIT CONFERIDO: ${r.filesVerified}/${r.filesVerified} | modo=${r.mode} | produção autorizada=NÃO`);
    }else if(args.action==='check'){
      const r=await checkKit(args.path);
      console.log(`F40 KIT OK: ${r.mode} | ${r.filesVerified} arquivos verificados | cliente vinculado=NÃO | produção autorizada=NÃO`);
    }else {
      const r=await doctor();
      console.log(`F40 DOCTOR OFFLINE: ${r.filesPresent}/${r.filesExpected} arquivos presentes`);
      for(const x of r.checks)console.log(`${x.present?'OK':'FALTA'} ${x.path}`);
      console.log('ERP próprio=FUTURO | homologação real=NÃO | migrations executadas=NÃO VERIFICADO | produção autorizada=NÃO');
      if(!r.allFilesPresent)process.exitCode=3;
    }
  }catch(e){
    console.error(`F40 ONBOARDING ERROR: ${e instanceof OnboardingError?e.code:'ONBOARDING_IO_ERROR'}`);
    console.error('Uso: node connectors/onboarding/cli.mjs --doctor | --init --mode bling|omie|olist|csv|f40-erp --alias loja_demo --output ./kit_loja_demo | --check ./kit_loja_demo');
    process.exitCode=2;
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
