#!/usr/bin/env node
/** F5.17 — REGISTRO HUMANO LOCAL. Sem API, sem rede, sem liberacao de retry. */
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CsvOrderExportError,prepareOrderExport} from './order_export.mjs';
import {prepareManualReconciliation} from './order_reconcile.mjs';
import {previewReconciliation,recordReconciliation} from './order_reconcile_state.mjs';
const fail=code=>{throw new CsvOrderExportError(code);};
async function demo(){
  const sample=JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)),'orders.example.json'),'utf8'));
  const p=prepareOrderExport(sample.snapshots,sample.settings),now='2026-11-22T17:00:00.000Z';
  const batchId='99999999-9999-4999-8999-999999999999';
  const manifest={schema:1,batchId,storeId:sample.settings.storeId,integrationId:sample.settings.integrationId,
    orderIds:p.orderIds,createdAt:'2026-11-22T16:30:00.000Z',sha256:p.sha256,rows:p.summary.lines,
    erpReceived:false,erpOrderCreated:false,note:'Exemplo local'};
  const state={schema:1,provider:'csv-orders',storeId:manifest.storeId,integrationId:manifest.integrationId,
    orders:{[p.orderIds[0]]:{stage:'FILE_CREATED',batchId,sha256:p.sha256,createdAt:manifest.createdAt}}};
  const receipt={schema:1,storeId:manifest.storeId,integrationId:manifest.integrationId,batchId,
    exportSha256:p.sha256,operatorAlias:'operador_demo',verifiedAt:now,evidenceRef:'PROTOCOLO-DEMO-001',
    acknowledgement:'CONFIRMO_CONFERENCIA_NO_ERP',
    decisions:[{orderId:p.orderIds[0],result:'UNCERTAIN',reasonCode:'NO_EVIDENCE'}]};
  const v=prepareManualReconciliation({manifest,csvBytes:p.contents,state,receipt,now:new Date(now)});
  console.log(JSON.stringify({...v.summary,mode:'DEMO',networkUsed:false,filesCreated:false},null,2));
}
async function main(){
  const flags=process.argv.slice(2),mode=flags.length===1?flags[0]:null;
  if(mode==='--demo'){await demo();return;}
  if(!['--preview','--record'].includes(mode))fail('CSV_RECONCILE_CLI_USAGE');
  const paths={csvPath:process.env.F40_CSV_RECONCILE_CSV,
    manifestPath:process.env.F40_CSV_RECONCILE_MANIFEST,
    receiptPath:process.env.F40_CSV_RECONCILE_RECEIPT,
    statePath:process.env.F40_CSV_RECONCILE_STATE,
    reportPath:process.env.F40_CSV_RECONCILE_REPORT};
  if(mode==='--preview'){console.log(JSON.stringify(await previewReconciliation(paths),null,2));return;}
  const result=await recordReconciliation(paths,{confirmed:process.env.F40_CSV_RECONCILE_CONFIRM==='CONFIRMO_REGISTRO_MANUAL',
    expectedSha256:process.env.F40_CSV_RECONCILE_EXPECTED_SHA256});
  console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{
  const code=e instanceof CsvOrderExportError?e.code:'CSV_RECONCILE_RUNTIME_ERROR';
  console.error(`F40 CSV RECONCILE: ${code}`);
  process.exitCode=1;
});
