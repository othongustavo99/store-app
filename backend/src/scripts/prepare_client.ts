import {clientArguments,readClientConfiguration,writeClientArtifacts} from '../services/client_config_files.js';

async function main(){
  const {configPath}=clientArguments(process.argv.slice(2));
  const config=await readClientConfiguration(configPath);
  const directory=await writeClientArtifacts(config);
  console.log(`Configuração de build preparada: ${directory}\nLoja: ${config.store.slug} · ${config.app.environment}\nNenhum APK foi gerado; banco e servidor não foram alterados.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Falha ao preparar configuração.');process.exitCode=1;});
