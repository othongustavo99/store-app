import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runStatusCLI} from '../shared/order_status_cli.mjs';
import {createOmieOrderApi} from './order_export_api.mjs';
import {omieOrderAdapter} from './order_export_adapter.mjs';
export async function main(){
  return runStatusCLI({provider:'omie',configKey:'F40_OMIE_ORDERS_CONFIG',verify:omieOrderAdapter.verify,
    createErp:async env=>createOmieOrderApi({token:env.OMIE_APP_TOKEN})});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error('[omie-status]',e?.code??'STATUS_RUNTIME_ERROR');process.exitCode=1;});
}
