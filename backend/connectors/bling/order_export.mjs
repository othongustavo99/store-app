import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createTokenManager} from './auth.mjs';
import {blingOrderAdapter} from './order_export_adapter.mjs';
import {createBlingOrderApi} from './order_export_api.mjs';
import {runOrderCLI} from '../shared/order_export_cli.mjs';

export async function main(){return runOrderCLI({provider:blingOrderAdapter,configKey:'F40_BLING_ORDERS_CONFIG',
  createErp:async env=>{
    if(!isAbsolute(env.F40_BLING_TOKENS_FILE??''))throw Error('BLING_TOKEN_FILE_ABSOLUTE_REQUIRED');
    const manager=createTokenManager({tokenPath:env.F40_BLING_TOKENS_FILE,clientId:env.BLING_CLIENT_ID,clientSecret:env.BLING_CLIENT_SECRET});
    return createBlingOrderApi({accessToken:opts=>manager.accessToken(opts)});
  }});}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{console.error('[bling-order-export]',e.code??'RUNTIME_ERROR');process.exitCode=1;});
}
