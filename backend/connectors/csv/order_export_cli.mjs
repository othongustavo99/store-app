#!/usr/bin/env node
/** Exporte SOMENTE um arquivo, nunca crie ou confirme pedido no ERP. */
import {readFile} from 'node:fs/promises';
import {isAbsolute,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateOrderExportConfig,prepareOrderExport,CsvOrderExportError} from './order_export.mjs';
import {createOrderExportFiles} from './order_export_state.mjs';
import {createStoreOrderClient} from '../shared/safe_order_export.mjs';
const fail=code=>{throw new CsvOrderExportError(code);};
async function example(){
  const path=join(dirname(fileURLToPath(import.meta.url)),'orders.example.json');
  const demo=JSON.parse(await readFile(path,'utf8'));
  const plan=prepareOrderExport(demo.snapshots,demo.settings);
  console.log(JSON.stringify({...plan.summary,mode:'DEMO',networkUsed:false,filesCreated:false},null,2));
}
async function main(){
  const flags=process.argv.slice(2),mode=flags.length===0?'--preview':flags.length===1?flags[0]:null;
  if(mode==='--demo'){await example();return;}
  if(!['--preview','--write'].includes(mode))fail('CSV_ORDER_CLI_USAGE');
  const configPath=process.env.F40_CSV_ORDERS_CONFIG;
  if(!isAbsolute(configPath??''))fail('CSV_ORDER_CONFIG_ABSOLUTE_REQUIRED');
  const bytes=await readFile(configPath);
  if(bytes.length>32_768)fail('CSV_ORDER_CONFIG_TOO_LARGE');
  const config=validateOrderExportConfig(JSON.parse(bytes.toString('utf8')));
  if(mode==='--write'&&process.env.F40_CSV_ORDER_EXPORT_CONFIRM!=='CONFIRMO_GERACAO_MANUAL')fail('CSV_ORDER_WRITE_CONFIRM_REQUIRED');
  const store=createStoreOrderClient({url:process.env.F40_API_URL,token:process.env.F40_INTEGRATION_TOKEN});
  const snapshots=[];
  for(const id of config.orderIds)snapshots.push(await store.request(`/v1/external/orders/${id}`));
  const plan=prepareOrderExport(snapshots,config);
  if(mode==='--preview'){console.log(JSON.stringify(plan.summary,null,2));return;}
  const expected=process.env.F40_CSV_ORDERS_EXPECTED_SHA256;
  if(!/^[a-f0-9]{64}$/.test(expected??'')||expected!==plan.sha256)fail('CSV_ORDER_PREVIEW_CHANGED_OR_NOT_CONFIRMED');
  const outputPath=process.env.F40_CSV_ORDERS_OUTPUT,statePath=process.env.F40_CSV_ORDERS_STATE;
  if(!isAbsolute(outputPath??'')||!isAbsolute(statePath??''))fail('CSV_ORDER_ABSOLUTE_OUTPUT_REQUIRED');
  const written=await createOrderExportFiles({plan,config,outputPath,statePath});
  console.log(JSON.stringify({...written,requiresManualImport:true,erpReceived:false},null,2));
}
main().catch(e=>{
  const code=e instanceof CsvOrderExportError?e.code:e?.code==='ENOENT'?'CSV_ORDER_FILE_NOT_FOUND':
    e instanceof SyntaxError?'CSV_ORDER_CONFIG_JSON_INVALID':'CSV_ORDER_RUNTIME_ERROR';
  console.error(`F40 CSV ORDERS: ${code}`);
  process.exitCode=1;
});
