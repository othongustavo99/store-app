#!/usr/bin/env node
// Avaliação 100% offline. Nenhum token, endpoint ou dado pessoal necessário.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assessProfile, reportMarkdown } from './assessment.mjs';

function argsOf(argv) {
  const params = {format:'text'};
  const seen = new Set();
  for (let i=0;i<argv.length;i++) {
    const flag=argv[i];
    if (!['--input','--format','--output','--gate'].includes(flag) || !argv[i+1] || argv[i+1].startsWith('--') || seen.has(flag))
      throw new Error('ARGUMENTOS_INVALIDOS');
    seen.add(flag);
    params[flag.slice(2)]=argv[++i];
  }
  if (!params.input || !['text','json','md'].includes(params.format) ||
      (params.gate && !['pilot','review'].includes(params.gate))) throw new Error('ARGUMENTOS_INVALIDOS');
  if (params.output && resolve(params.output) === resolve(params.input)) throw new Error('ARQUIVO_SAIDA_IGUAL_ENTRADA');
  return params;
}
function printable(report, format) {
  if (format === 'json') return JSON.stringify(report,null,2)+'\n';
  if (format === 'md') return reportMarkdown(report);
  return [
    `F40 ASSESSMENT — ${report.storeAlias}`,
    `Provedor: ${report.provider} | Caminho: ${report.approach}`,
    `Parecer: ${report.verdict} | Produção autorizada: NÃO`,
    `Bloqueios de escopo: ${report.summary.hardBlockers} | Evidências pendentes: ${report.summary.pendingChecks}`,
    ...report.hardBlockers.map(x=>`BLOQUEIO ${x.code}: ${x.message}`),
    ...report.pendingChecks.map(x=>`PENDENTE ${x.code}: ${x.message}`),
    report.note,
    '',
  ].join('\n');
}
async function main() {
  try {
    const options=argsOf(process.argv.slice(2));
    const stat=await readFile(resolve(options.input),'utf8');
    if (Buffer.byteLength(stat,'utf8')>64*1024) throw new Error('PERFIL_MUITO_GRANDE');
    const profile=JSON.parse(stat);
    const report=assessProfile(profile);
    const output=printable(report,options.format);
    if (options.output) {
      await writeFile(resolve(options.output),output,{flag:'wx',mode:0o600});
      console.log('F40 ASSESSMENT: RELATORIO_GRAVADO (não houve contato com ERP ou banco)');
    } else process.stdout.write(output);
    // Gate opcional para automação de conferência; nunca autoriza produção sozinho.
    if (options.gate === 'pilot' && !['READY_FOR_ASSISTED_PILOT','MANUAL_PRODUCTION_REVIEW'].includes(report.verdict)) process.exitCode=3;
    if (options.gate === 'review' && report.verdict !== 'MANUAL_PRODUCTION_REVIEW') process.exitCode=3;
    // Sem --gate, gerar parecer com pendências continua sendo operação válida.
  }catch(error){
    const code=error?.code==='EEXIST'?'ARQUIVO_SAIDA_JA_EXISTE':
      error instanceof SyntaxError?'JSON_INVALIDO':
      typeof error?.message==='string' && /^[A-Z_]+(?:: [A-Z_]+)?$/.test(error.message)?error.message:'ENTRADA_OU_SAIDA_INVALIDA';
    console.error(`F40 ASSESSMENT ERROR: ${code}`);
    console.error('Uso: node connectors/assessment/cli.mjs --input arquivo.json [--format text|json|md] [--output relatorio.md] [--gate pilot|review]');
    process.exitCode=2;
  }
}
await main();
