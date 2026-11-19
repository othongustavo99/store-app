// Assistente local de OAuth. Codigo de autorizacao deve ser informado apenas no terminal interativo.
import {createInterface} from 'node:readline/promises';
import {stdin as input,stdout as output} from 'node:process';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startAuthorization,completeAuthorization,createTokenManager} from './auth.mjs';
import {lockFile} from './state.mjs';
import {OlistConnectorError} from './clients.mjs';
export async function main(command,env=process.env){
  const tokenPath=env.F40_OLIST_TOKENS_FILE;
  if(!tokenPath||!isAbsolute(tokenPath))throw new OlistConnectorError('TOKEN_FILE_ABSOLUTE_REQUIRED');
  if(!env.OLIST_REDIRECT_URI)throw new OlistConnectorError('REDIRECT_URI_REQUIRED');
  const clientId=env.OLIST_CLIENT_ID,clientSecret=env.OLIST_CLIENT_SECRET,pendingPath=tokenPath+'.pending.json';
  const unlock=await lockFile(tokenPath);
  try{
    if(command==='start'){
      const url=await startAuthorization({clientId,redirectUri:env.OLIST_REDIRECT_URI,pendingPath});
      console.log('Abra no navegador para autorizar o Olist/Tiny (URL com state temporario):');console.log(url);
      console.log('Depois execute imediatamente: node oauth.mjs finish');return;
    }
    if(command==='finish'){
      const rl=createInterface({input,output});let callback;
      try{callback=await rl.question('Cole a URL COMPLETA recebida no redirecionamento (nunca no Git): ');}finally{rl.close();}
      await completeAuthorization({callback,pendingPath,tokenPath,clientId,clientSecret,redirectUri:env.OLIST_REDIRECT_URI});
      console.log('Conta Olist/Tiny autorizada. Tokens salvos em arquivo privado.');return;
    }
    if(command==='refresh'){
      await createTokenManager({tokenPath,clientId,clientSecret}).accessToken({force:true});console.log('Token atualizado.');return;
    }
    throw new OlistConnectorError('USE_START_FINISH_REFRESH');
  }finally{await unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv[2]).catch(e=>{console.error('[olist-oauth]',e instanceof OlistConnectorError?e.code:'OAUTH_FAILED');process.exitCode=1;});
}
