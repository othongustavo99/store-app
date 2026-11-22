/** Journal de conciliacao manual conservadora. Reusa MESMO estado/lock F5.16. */
import {readFile,writeFile,open} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {CsvOrderExportError} from './order_export.mjs';
import {loadOrderExportState,lockOrderExportState,saveOrderExportState} from './order_export_state.mjs';
import {prepareManualReconciliation,createManualReconciliationReport,sha256Bytes,validateReconciliationManifest} from './order_reconcile.mjs';
const fail=code=>{throw new CsvOrderExportError(code);};
const pathOk=p=>typeof p==='string'&&isAbsolute(p);
const MAX={csv:2_000_000,manifest:32_768,receipt:32_768};
async function fileLimit(path,max,code){
  let fd;
  try{
    fd=await open(path,'r');
    const stats=await fd.stat();if(!stats.isFile()||stats.size>max||stats.size<1)fail(code);
    const bytes=await fd.readFile();if(bytes.length>max||bytes.length<1)fail(code);
    return bytes;
  }catch(e){if(e instanceof CsvOrderExportError)throw e;fail(code);}
  finally{await fd?.close();}
}
async function readJson(path,max,code){
  const bytes=await fileLimit(path,max,code);
  try{return JSON.parse(bytes.toString('utf8'));}catch{fail(code);}
}
function validatePaths({csvPath,manifestPath,receiptPath,statePath,reportPath},mode){
  const items=[csvPath,manifestPath,receiptPath,statePath,...(mode==='record'?[reportPath]:[])];
  if(items.some(x=>!pathOk(x))||new Set(items.map(x=>resolve(x))).size!==items.length||
    !csvPath.toLowerCase().endsWith('.csv')||manifestPath!==`${csvPath}.manifest.json`||
    (mode==='record'&&!reportPath.toLowerCase().endsWith('.json')))
    fail('CSV_RECONCILE_PATHS_INVALID');
}
async function loadPlan(paths,clock){
  const [manifest,receipt,csvBytes]=await Promise.all([
    readJson(paths.manifestPath,MAX.manifest,'CSV_RECONCILE_MANIFEST_FILE_INVALID'),
    readJson(paths.receiptPath,MAX.receipt,'CSV_RECONCILE_RECEIPT_FILE_INVALID'),
    fileLimit(paths.csvPath,MAX.csv,'CSV_RECONCILE_CSV_FILE_INVALID')]);
  validateReconciliationManifest(manifest);
  const state=await loadOrderExportState(paths.statePath,manifest);
  const plan=prepareManualReconciliation({manifest,csvBytes,state,receipt,now:clock()});
  return {plan,state,manifest};
}
export async function previewReconciliation(paths,{clock=()=>new Date()}={}){
  validatePaths(paths,'preview');
  const {plan}=await loadPlan(paths,clock);
  return plan.summary;
}
export async function recordReconciliation(paths,{expectedSha256,confirmed=false,clock=()=>new Date()}={}){
  validatePaths(paths,'record');
  if(!confirmed)fail('CSV_RECONCILE_CONFIRM_REQUIRED');
  if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256))fail('CSV_RECONCILE_PREVIEW_REQUIRED');
  const unlock=await lockOrderExportState(paths.statePath);
  try{
    // Nao criar/alterar estado se relatorio ja existe.
    try{const fd=await open(paths.reportPath,'r');await fd.close();fail('CSV_RECONCILE_REPORT_EXISTS');}
    catch(e){if(e?.code!=='ENOENT')throw e;}
    // Dentro do lock, revalidar CSV, manifesto, receipt e estado contra o preview.
    const {plan,state,manifest}=await loadPlan(paths,clock);
    if(expectedSha256!==plan.previewSha256)fail('CSV_RECONCILE_PREVIEW_CHANGED');
    const report=createManualReconciliationReport(plan,{recordedAt:clock().toISOString()});
    const reportBytes=JSON.stringify(report,null,2)+'\n';
    const reportSha256=sha256Bytes(reportBytes);
    // Imutavel, exclusive create. Se houver falha apos este ponto, exigir revisao manual.
    try{await writeFile(paths.reportPath,reportBytes,{flag:'wx',mode:0o600});}
    catch(e){if(e?.code==='EEXIST')fail('CSV_RECONCILE_REPORT_EXISTS');fail('CSV_RECONCILE_REPORT_WRITE_FAILED');}
    const resultById=new Map(report.decisions.map(x=>[x.orderId,x]));
    for(const id of manifest.orderIds){
      const d=resultById.get(id);
      state.orders[id].stage='MANUALLY_REVIEWED';
      state.orders[id].reconciliation={result:d.result,reasonCode:d.reasonCode??null,
        checks:d.checks??null,externalOrderId:d.externalOrderId??null,
        batchId:manifest.batchId,previewSha256:plan.previewSha256,reportSha256,verifiedAt:report.verifiedAt,
        recordedAt:report.recordedAt,evidenceRef:report.evidenceRef,
        operatorAlias:report.operatorAlias,externalApiVerified:false,reexportAuthorized:false};
    }
    try{await saveOrderExportState(paths.statePath,state);}
    catch{fail('CSV_RECONCILE_STATE_UNCERTAIN_MANUAL_REVIEW');}
    return {mode:'MANUALLY_REVIEWED',batchId:report.batchId,orders:report.decisions.length,
      previewSha256:plan.previewSha256,reportSha256,reportedImported:plan.summary.reportedImported,
      reportedRejected:plan.summary.reportedRejected,uncertain:plan.summary.uncertain,
      divergent:plan.summary.divergent,
      externalApiVerified:false,erpReceivedConfirmedByApi:false,productionApproved:false,
      reexportAuthorized:false};
  }finally{await unlock();}
}
