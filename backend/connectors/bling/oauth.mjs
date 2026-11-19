// CLI de homologacao. Nunca passe o codigo OAuth como argumento de processo.
import {createInterface} from 'node:readline/promises';
import {stdin as input,stdout as output} from 'node:process';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startAuthorization,completeAuthorization,createTokenManager,authorizeLoopback} from './auth.mjs';
import {BlingConnectorError} from './clients.mjs';
import {lockFile} from './state.mjs';

export async function main(command,env=process.env) {
  const tokenPath=env.F40_BLING_TOKENS_FILE;
  if(!tokenPath||!isAbsolute(tokenPath))throw new BlingConnectorError('TOKEN_FILE_ABSOLUTE_REQUIRED');
  const clientId=env.BLING_CLIENT_ID,clientSecret=env.BLING_CLIENT_SECRET;
  const pendingPath=`${tokenPath}.pending.json`;
  const unlock=await lockFile(tokenPath);
  try {
    if(command==='listen'){
      if(!env.BLING_REDIRECT_URI)throw new BlingConnectorError('REDIRECT_URI_REQUIRED');
      await authorizeLoopback({clientId,clientSecret,redirectUri:env.BLING_REDIRECT_URI,pendingPath,tokenPath,
        onUrl:url=>{console.log('Abra esta URL no navegador para autorizar a conta Bling:');console.log(url);}});
      console.log('Autorizacao concluida. Tokens salvos no arquivo privado.');
      return;
    }
    if(command==='start'){
      const url=await startAuthorization({clientId,pendingPath});
      console.log('Abra a URL abaixo no navegador para autorizar a conta Bling:');
      console.log(url);
      console.log('Depois execute: node oauth.mjs finish');
      return;
    }
    if(command==='finish'){
      if(!env.BLING_REDIRECT_URI)throw new BlingConnectorError('REDIRECT_URI_REQUIRED');
      const rl=createInterface({input,output});let callback;
      try{callback=await rl.question('Cole a URL COMPLETA do redirecionamento (nao salve no Git): ');}finally{rl.close();}
      await completeAuthorization({callback,pendingPath,tokenPath,clientId,clientSecret,redirectUri:env.BLING_REDIRECT_URI});
      console.log('Autorizacao concluida. Tokens salvos no arquivo privado.');
      return;
    }
    if(command==='refresh'){
      await createTokenManager({tokenPath,clientId,clientSecret}).accessToken({force:true});
      console.log('Token renovado e salvo.');return;
    }
    throw new BlingConnectorError('USAGE_LISTEN_OR_START_FINISH_REFRESH');
  }finally{await unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(e=>{console.error('[bling-oauth]',e instanceof BlingConnectorError?e.code:'AUTH_FAILED');process.exitCode=1;});
}
