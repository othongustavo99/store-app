import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientConfigurationInput, clientArtifacts, type ClientConfiguration } from './client_configuration.js';

export const clientProjectRoot=fileURLToPath(new URL('../../../',import.meta.url));
export function clientArguments(args:string[],allowApply=false) {
  const files=args.filter(a=>a.startsWith('--config='));
  if(files.length!==1||files[0].length<=9||args.some(a=>!a.startsWith('--config=')&&!(allowApply&&a==='--apply')))
    throw new Error('Use --config=CAMINHO.json'+(allowApply?' [--apply]':'')+'. Sem --apply, provisionamento é somente leitura.');
  return {configPath:files[0].slice(9),apply:allowApply&&args.includes('--apply')};
}
export async function readClientConfiguration(path:string) {
  const raw=await readFile(path,'utf8');
  if(Buffer.byteLength(raw)>100000)throw new Error('Configuração maior que o limite de 100 KB.');
  const parsed=clientConfigurationInput.safeParse(JSON.parse(raw.replace(/^\uFEFF/,'')));
  if(!parsed.success)throw new Error('Configuração inválida: '+parsed.error.issues.map(i=>`${i.path.join('.')||'config'}: ${i.message}`).join('; '));
  return parsed.data;
}
export async function writeClientArtifacts(config:ClientConfiguration) {
  const artifacts=clientArtifacts(config);
  const directory=join(clientProjectRoot,'.client-builds',`${config.store.slug}-${config.app.environment}`);
  await mkdir(directory,{recursive:true});
  for(const [name,data] of [['flutter.defines.json',artifacts.defines],['android.plan.json',artifacts]] as const)
    await writeFile(join(directory,name),JSON.stringify(data,null,2)+'\n','utf8');
  return directory;
}
export async function writeResolvedConfiguration(config:ClientConfiguration,id:string) {
  const resolved={...config,store:{...config.store,id}};
  const directory=await writeClientArtifacts(resolved);
  await writeFile(join(directory,'store.resolved.json'),JSON.stringify(resolved,null,2)+'\n','utf8');
  return directory;
}
