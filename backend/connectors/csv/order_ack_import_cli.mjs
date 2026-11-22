#!/usr/bin/env node
/** F5.18 - evidencia auxiliar CSV offline. Nenhum registro de conciliacao F5.17. */
import {readFile,open,writeFile} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {CsvOrderExportError,prepareOrderExport} from './order_export.mjs';
import {loadOrderExportState} from './order_export_state.mjs';
import {assessErpReturn} from './order_ack_import.mjs';
const fail=code=>{throw new CsvOrderExportError(code);};
const MAX={erp:2_000_000,export:2_000_000,settings:32768,manifest:32768};
async function readSafe(path,max,code){
  let fd;
  try{
    fd=await open(path,'r');
    const st=await fd.stat();if(!st.isFile()||st.size<1||st.size>max)fail(code);
    const bytes=await fd.readFile();if(bytes.length<1||bytes.length>max)fail(code);
    return bytes;
  }catch(e){if(e instanceof CsvOrderExportError)throw e;fail(code);}
  finally{await fd?.close();}
}
async function jsonSafe(path,max,code){
  try{return JSON.parse((await readSafe(path,max,code)).toString('utf8'));}
  catch(e){if(e instanceof CsvOrderExportError)throw e;fail(code);}
}
function getPaths(mode){
  const paths={erpPath:process.env.F40_CSV_ACK_ERP_FILE,settingsPath:process.env.F40_CSV_ACK_SETTINGS,
    csvPath:process.env.F40_CSV_ACK_EXPORT_CSV,exportSettingsPath:process.env.F40_CSV_ACK_EXPORT_SETTINGS,
    manifestPath:process.env.F40_CSV_ACK_EXPORT_MANIFEST,statePath:process.env.F40_CSV_ACK_STATE,
    draftPath:process.env.F40_CSV_ACK_DRAFT};
  const inputs=[paths.erpPath,paths.settingsPath,paths.csvPath,paths.exportSettingsPath,paths.manifestPath,paths.statePath];
  const all=[...inputs,...(mode==='--draft'?[paths.draftPath]:[])];
  if(all.some(x=>typeof x!=='string'||!isAbsolute(x))||new Set(all.map(x=>resolve(x))).size!==all.length||
    !paths.erpPath.toLowerCase().endsWith('.csv')||!paths.csvPath.toLowerCase().endsWith('.csv')||
    paths.manifestPath!==`${paths.csvPath}.manifest.json`||
    (mode==='--draft'&&!paths.draftPath.toLowerCase().endsWith('.json')))fail('CSV_ACK_PATHS_INVALID');
  return paths;
}
async function load(paths){
  const [erpCsv,settings,exportCsv,exportSettings,manifest]=await Promise.all([
    readSafe(paths.erpPath,MAX.erp,'CSV_ACK_ERP_FILE_INVALID'),
    jsonSafe(paths.settingsPath,MAX.settings,'CSV_ACK_SETTINGS_FILE_INVALID'),
    readSafe(paths.csvPath,MAX.export,'CSV_ACK_EXPORT_FILE_INVALID'),
    jsonSafe(paths.exportSettingsPath,MAX.settings,'CSV_ACK_EXPORT_SETTINGS_FILE_INVALID'),
    jsonSafe(paths.manifestPath,MAX.manifest,'CSV_ACK_MANIFEST_FILE_INVALID')]);
  const state=await loadOrderExportState(paths.statePath,manifest);
  return assessErpReturn({manifest,exportCsv,exportSettings,erpCsv,settings,state});
}
async function demo(){
  const sample=JSON.parse(await readFile(new URL('./orders.example.json',import.meta.url),'utf8'));
  const settings=JSON.parse(await readFile(new URL('./ack.settings.example.json',import.meta.url),'utf8'));
  const p=prepareOrderExport(sample.snapshots,sample.settings);
  const batchId='99999999-9999-4999-8999-999999999999',createdAt='2026-11-22T18:00:00.000Z';
  const manifest={schema:1,batchId,storeId:sample.settings.storeId,integrationId:sample.settings.integrationId,
    orderIds:p.orderIds,createdAt,sha256:p.sha256,rows:p.summary.lines,
    erpReceived:false,erpOrderCreated:false,note:'Demonstracao ficticia'};
  const state={schema:1,provider:'csv-orders',storeId:manifest.storeId,integrationId:manifest.integrationId,
    orders:Object.fromEntries(p.orderIds.map(id=>[id,{stage:'FILE_CREATED',batchId,sha256:p.sha256,createdAt}]))};
  const total=Number(sample.snapshots[0].order.totalCents);
  const amt=`${Math.floor(total/100)},${String(total%100).padStart(2,'0')}`;
  const erpCsv=Buffer.from(`"referencia";"codigo_erp";"situacao";"total";"linhas"\r\n"F40-${p.orderIds[0]}";"ERP-EXEMPLO-001";"IMPORTADO";"${amt}";"${p.summary.lines}"\r\n`);
  const r=assessErpReturn({manifest,exportCsv:Buffer.from(p.contents),exportSettings:sample.settings,erpCsv,settings,state});
  console.log(JSON.stringify({...r.summary,mode:'DEMO',networkUsed:false,filesCreated:false,
    draftRemainsUnconfirmed:true},null,2));
}
async function main(){
  const mode=process.argv.length===3?process.argv[2]:'';
  if(mode==='--demo'){await demo();return;}
  if(!['--preview','--draft'].includes(mode))fail('CSV_ACK_CLI_USAGE');
  const paths=getPaths(mode);
  if(mode==='--draft'){
    if(process.env.F40_CSV_ACK_CONFIRM!=='CONFIRMO_APENAS_RASCUNHO')fail('CSV_ACK_CONFIRM_REQUIRED');
    if(!/^[a-f0-9]{64}$/.test(process.env.F40_CSV_ACK_EXPECTED_SHA256??''))fail('CSV_ACK_PREVIEW_REQUIRED');
  }
  const x=await load(paths);
  if(mode==='--preview'){
    console.log(JSON.stringify({summary:x.summary,results:x.results},null,2));return;
  }
  if(x.previewSha256!==process.env.F40_CSV_ACK_EXPECTED_SHA256)fail('CSV_ACK_PREVIEW_CHANGED');
  // Arquivo de rascunho deliberadamente nao contem a confirmacao da F5.17.
  try{await writeFile(paths.draftPath,JSON.stringify(x.draft,null,2)+'\n',{flag:'wx',mode:0o600});}
  catch(e){if(e?.code==='EEXIST')fail('CSV_ACK_DRAFT_EXISTS');fail('CSV_ACK_DRAFT_WRITE_FAILED');}
  console.log(JSON.stringify({mode:'DRAFT_WRITTEN',orders:x.draft.decisions.length,draftSha256:x.previewSha256,
    manualVerificationRequired:true,externalApiVerified:false,reexportAuthorized:false},null,2));
}
main().catch(e=>{const code=e instanceof CsvOrderExportError?e.code:'CSV_ACK_RUNTIME_ERROR';
  console.error(`F40 CSV ACK: ${code}`);process.exitCode=1;});
