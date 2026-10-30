import {clientArguments,readClientConfiguration,writeResolvedConfiguration} from '../services/client_config_files.js';
import {provisionStore} from '../services/store_provisioning.js';

async function main(){
  const {configPath,apply}=clientArguments(process.argv.slice(2),true);
  const config=await readClientConfiguration(configPath);
  const {pool}=await import('../db/pool.js');
  try{
    const result=await provisionStore(pool,config,apply);
    console.log(JSON.stringify(result,null,2));
    if(result.storeId){
      const directory=await writeResolvedConfiguration(config,result.storeId);
      console.log(`Arquivo resolvido e parâmetros de build: ${directory}`);
    }
  }finally{await pool.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Falha no provisionamento.');process.exitCode=1;});
