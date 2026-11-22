#!/usr/bin/env node
/** Dossiê de implantação OFFLINE. Não recebe token, não acessa rede e não aprova produção. */
import {open,lstat,realpath,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRolloutConfig,verifyCsvArtifacts,evaluateCommercialRollout,
  rolloutMarkdown,CommercialRolloutError} from './rollout.mjs';

const codeError=code=>{throw new CommercialRolloutError(code);};
const MAX={config:65_536,exportCsv:2_000_000,exportManifest:32_768,
  erpReturnCsv:2_000_000,reconciliationReport:32_768};

export function parseArgs(args){
  if(args.length===1&&args[0]==='--demo')return {demo:true,format:'text'};
  const p={format:'text'},seen=new Set();
  for(let i=0;i<args.length;i++){
    const flag=args[i],value=args[i+1];
    if(!['--input','--format','--output','--gate'].includes(flag)||seen.has(flag)||
      !value||value.startsWith('--'))codeError('ROLLOUT_CLI_USAGE');
    seen.add(flag);p[flag.slice(2)]=value;i++;
  }
  if(!p.input||!['text','json','md'].includes(p.format)||
    (p.gate&&!['pilot','review'].includes(p.gate)))codeError('ROLLOUT_CLI_USAGE');
  return p;
}

async function readBounded(path,max){
  let f;
  try{
    const st=await lstat(path);
    if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>max)
      codeError('ROLLOUT_EVIDENCE_FILE_INVALID');
    f=await open(path,'r');
    const b=await f.readFile();
    if(b.length<1||b.length>max)codeError('ROLLOUT_EVIDENCE_FILE_INVALID');
    return b;
  }catch(e){if(e instanceof CommercialRolloutError)throw e;codeError('ROLLOUT_EVIDENCE_FILE_INVALID');}
  finally{await f?.close();}
}
async function readJson(path,max){
  const bytes=await readBounded(path,max);
  try{return JSON.parse(bytes.toString('utf8'));}
  catch{codeError('ROLLOUT_JSON_INVALID');}
}
async function evidencePath(root,part){
  const candidate=resolve(root,part),rel=relative(root,candidate);
  if(!rel||rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel))codeError('ROLLOUT_EVIDENCE_PATH_INVALID');
  const actual=await realpath(candidate).catch(()=>codeError('ROLLOUT_EVIDENCE_PATH_INVALID'));
  const realRoot=await realpath(root);
  const ar=relative(realRoot,actual);
  if(!ar||ar==='..'||ar.startsWith(`..${sep}`)||isAbsolute(ar))codeError('ROLLOUT_EVIDENCE_PATH_INVALID');
  return candidate;
}
export async function loadRollout(path){
  const inputPath=resolve(path),root=dirname(inputPath);
  const config=validateRolloutConfig(await readJson(inputPath,MAX.config));
  const artifacts={};
  for(const k of ['exportCsv','exportManifest','erpReturnCsv','reconciliationReport']){
    if(config.artifacts[k]){
      const f=await evidencePath(root,config.artifacts[k]);
      if(k==='exportCsv'||k==='erpReturnCsv')artifacts[k]=await readBounded(f,MAX[k]);
      else artifacts[k]=await readJson(f,MAX[k]);
    }
  }
  const verified=verifyCsvArtifacts(config,{
    ...(config.artifacts.exportCsv?{exportBytes:artifacts.exportCsv,manifest:artifacts.exportManifest}:{}),
    erpReturnBytes:artifacts.erpReturnCsv??null,
    reconciliationReport:artifacts.reconciliationReport??null,
  });
  return {config,verified};
}
function printable(r,format){
  if(format==='json')return JSON.stringify(r,null,2)+'\n';
  if(format==='md')return rolloutMarkdown(r);
  return [
    `F40 IMPLANTACAO — ${r.storeAlias} (${r.provider})`,
    `Parecer: ${r.verdict} | Produção autorizada: NÃO`,
    `Técnico: ${r.assessment.verdict} | Checklist: ${r.checklist.completed.length}/${r.checklist.total}`,
    `Evidências CSV: ${r.csvEvidence.status} | Pedidos: ${r.csvEvidence.orders}`,
    ...r.nextActions.map(x=>`PENDENTE ${x.code}: ${x.message}`),
    r.limitations,'',
  ].join('\n');
}
async function main(){
  try{
    const options=parseArgs(process.argv.slice(2));
    const input=options.demo?fileURLToPath(new URL('./deployment.example.json',import.meta.url)):options.input;
    const {config,verified}=await loadRollout(input);
    const report=evaluateCommercialRollout(config,verified);
    const output=printable(report,options.format);
    if(options.output){
      const target=resolve(options.output),src=resolve(input);
      if(target===src||Object.values(config.artifacts).some(name=>name&&target===resolve(dirname(src),name)))
        codeError('ROLLOUT_OUTPUT_CONFLICT');
      try{await writeFile(target,output,{flag:'wx',mode:0o600});}
      catch(e){if(e?.code==='EEXIST')codeError('ROLLOUT_OUTPUT_EXISTS');codeError('ROLLOUT_OUTPUT_FAILED');}
      process.stdout.write('F40 IMPLANTACAO: RELATORIO_GRAVADO (offline; sem autorização de produção)\n');
    }else process.stdout.write(output);
    if(options.gate==='pilot'&&!report.pilotEligible)process.exitCode=3;
    if(options.gate==='review'&&!report.reviewEligible)process.exitCode=3;
  }catch(e){
    const code=e instanceof CommercialRolloutError?e.code:'ROLLOUT_RUNTIME_ERROR';
    console.error(`F40 IMPLANTACAO ERROR: ${code}`);
    console.error('Uso: node connectors/deployment/cli.mjs --input plano.json [--format text|json|md] [--output relatorio.md] [--gate pilot|review] | --demo');
    process.exitCode=2;
  }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();
