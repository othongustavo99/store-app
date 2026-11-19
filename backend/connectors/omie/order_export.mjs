import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {omieOrderAdapter} from './order_export_adapter.mjs';
import {createOmieOrderApi} from './order_export_api.mjs';
import {runOrderCLI} from '../shared/order_export_cli.mjs';
export async function main(){return runOrderCLI({provider:omieOrderAdapter,configKey:'F40_OMIE_ORDERS_CONFIG',
  createErp:async env=>createOmieOrderApi({token:env.OMIE_APP_TOKEN})});}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error('[omie-order-export]',e.code??'RUNTIME_ERROR');process.exitCode=1;});
}
