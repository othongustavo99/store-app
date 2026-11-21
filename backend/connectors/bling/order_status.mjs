import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runStatusCLI} from '../shared/order_status_cli.mjs';
import {createTokenManager} from './auth.mjs';
import {createBlingOrderApi} from './order_export_api.mjs';
import {blingOrderAdapter} from './order_export_adapter.mjs';
export async function main(){
  return runStatusCLI({provider:'bling',configKey:'F40_BLING_ORDERS_CONFIG',verify:blingOrderAdapter.verify,
    createErp:async env=>{
      if(!isAbsolute(env.F40_BLING_TOKENS_FILE??''))throw Error('BLING_TOKEN_FILE_REQUIRED');
      const manager=createTokenManager({tokenPath:env.F40_BLING_TOKENS_FILE,clientId:env.BLING_CLIENT_ID,clientSecret:env.BLING_CLIENT_SECRET});
      return createBlingOrderApi({accessToken:opts=>manager.accessToken(opts)});
    }});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error('[bling-status]',e?.code??'STATUS_RUNTIME_ERROR');process.exitCode=1;});
}
