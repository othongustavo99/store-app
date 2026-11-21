#!/usr/bin/env node
// F5.13 — executavel offline. Nao coleta secrets e nao liga workers.
import {runOfflineSafetyAudit} from './commercial_safety.mjs';
if(process.argv.length>3||process.argv.length===3&&process.argv[2]!=='--json'){
  console.error('Uso: node connectors/shared/commercial_safety_cli.mjs [--json]');
  process.exitCode=2;
}else{
  try{
    const result=await runOfflineSafetyAudit();
    if(process.argv[2]==='--json')console.log(JSON.stringify(result,null,2));
    else {
      console.log(`F40 OFFLINE SAFETY: ${result.summary.passed}/${result.summary.total} verificacoes`);
      for(const check of result.checks)console.log(`${check.passed?'OK':'FALHA'} ${check.code}`);
      console.log('Nao e homologacao; nenhuma integracao, pagamento ou operacao fiscal foi ativada.');
    }
    if(!result.success)process.exitCode=1;
  }catch{
    console.error('F40 OFFLINE SAFETY: INTERNAL_AUDIT_ERROR');
    process.exitCode=1;
  }
}
