import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runStatusCLI} from '../shared/order_status_cli.mjs';
import {createTokenManager} from './auth.mjs';
import {createOlistOrderClient} from './order_export_clients.mjs';
import {checkOlistOrderIdentity} from './order_export_rules.mjs';
export async function main(){
  return runStatusCLI({provider:'olist',configKey:'F40_OLIST_ORDERS_CONFIG',verify:checkOlistOrderIdentity,
    createErp:async env=>{
      if(!isAbsolute(env.F40_OLIST_TOKENS_FILE??''))throw Error('OLIST_TOKEN_FILE_REQUIRED');
      const manager=createTokenManager({tokenPath:env.F40_OLIST_TOKENS_FILE,clientId:env.OLIST_CLIENT_ID,clientSecret:env.OLIST_CLIENT_SECRET});
      return createOlistOrderClient({accessToken:opts=>manager.accessToken(opts)});
    }});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error('[olist-status]',e?.code??'STATUS_RUNTIME_ERROR');process.exitCode=1;});
}
