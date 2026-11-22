/**
 * Frequência40 Store App — Fase 5.20.
 * Gerador e verificador OFFLINE de kit de implantação, antes da existência de cliente real.
 * Nunca habilita integrações, não recebe credenciais, não acessa API nem banco.
 */
import {createHash} from 'node:crypto';
import {assessProfile,reportMarkdown,EVIDENCE_KEYS,FLOW_KEYS,MATRIX} from '../assessment/assessment.mjs';

export class OnboardingError extends Error {
  constructor(code){super(code);this.code=code;this.name='OnboardingError';}
}
const fail=(code)=>{throw new OnboardingError(code);};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(o,keys,code)=>{
  if(!obj(o)||Object.keys(o).length!==keys.length||keys.some(k=>!Object.hasOwn(o,k)))fail(code);
};
export const MODES=Object.freeze(['bling','omie','olist','csv','f40-erp']);
export const FILE_NAMES=Object.freeze(['assessment.profile.json','parecer.md','handoff.json','GUIA.md']);
export const GENERATOR='F40_ONBOARDING_OFFLINE_5_20';
export const sha256=x=>createHash('sha256').update(x).digest('hex');
export const validateAlias=alias=>{
  if(typeof alias!=='string'||!/^[a-z][a-z0-9_-]{2,39}$/.test(alias))fail('ONBOARDING_ALIAS_INVALID');
  return alias;
};
const string=x=>JSON.stringify(x,null,2)+'\n';

// F40 ERP é INTENCIONALMENTE uma trilha futura, não um conector implementado.
const matrix={
  bling:{provider:'bling',transport:'connector',requiredFlows:[...MATRIX.bling.flows],implementation:'INITIAL_CONNECTOR_NEEDS_HOMOLOGATION'},
  omie:{provider:'omie',transport:'connector',requiredFlows:[...MATRIX.omie.flows],implementation:'INITIAL_CONNECTOR_NEEDS_HOMOLOGATION'},
  olist:{provider:'olist',transport:'connector',requiredFlows:[...MATRIX.olist.flows],implementation:'INITIAL_CONNECTOR_NEEDS_HOMOLOGATION'},
  csv:{provider:'other',transport:'csv',requiredFlows:[...MATRIX.csv.flows],implementation:'MANUAL_FILE_WORKFLOW'},
  'f40-erp':{provider:'other',transport:'api',requiredFlows:['catalog_import','stock_import','order_export','order_status_read'],implementation:'FUTURE_CONNECTOR_NOT_IMPLEMENTED'},
};
export function createProfile({mode,alias}){
  validateAlias(alias);
  if(!MODES.includes(mode))fail('ONBOARDING_MODE_INVALID');
  const option=matrix[mode];
  return {
    schemaVersion:1,storeAlias:alias,provider:option.provider,transport:option.transport,
    requiredFlows:[...option.requiredFlows],
    vendorCapabilities:Object.fromEntries(FLOW_KEYS.map(k=>[k,'unconfirmed'])),
    operation:{variants:false,multipleWarehouses:false,fractionalStock:false,
      delivery:false,discounts:false,splitPayments:false},
    evidence:Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,'unconfirmed'])),
  };
}
function buildHandoff({mode,alias,report}){
  const current=matrix[mode];
  return {
    schemaVersion:1,generator:GENERATOR,storeAlias:alias,mode,
    implementation:current.implementation,
    operationsEnabled:false,productionAuthorized:false,clientBound:false,
    storeId:null,integrationId:null,credentialsIncluded:false,
    databaseMigrationExecuted:false,externalErpHomologated:false,
    needsClientDecision:true,operationAssumptionsUnverified:true,
    requiredBeforeActivation:[
      'Identificar loja e ERP/PDV contratado; criar IDs e credenciais reais isolados por loja',
      'Conferir contratos, autorização, responsabilidades e fluxos suportados',
      mode==='f40-erp'
        ? 'Implementar ERP/PDV Frequência40 e seu adaptador; realizar testes de integração e idempotência'
        : 'Configurar e testar o fluxo escolhido em ambiente de homologação do fornecedor',
      'Executar teste assistido de ponta a ponta, com conciliação e plano de recuperação',
      'Realizar aprovação humana de produção, sem ativação automática',
    ],
    assessmentVerdict:report.verdict,
    note:'Modelo offline. Nada neste kit comprova que um ERP externo ou próprio está integrado ou pronto em produção.',
  };
}
function guide({mode,alias,report}){
  return [
    '# Frequência40 — Kit offline de preparação ERP/PDV','',
    `- Identificador de exemplo: \`${alias}\``,
    `- Modalidade: **${mode}**`,
    `- Auditoria inicial: **${report.verdict}**`,
    '- Cliente real vinculado: **NÃO**',
    '- Credenciais, tokens e dados pessoais: **NÃO INCLUÍDOS**',
    '- Integração em produção: **DESATIVADA**','',
    '## Arquivos','',
    '- `assessment.profile.json`: questionário técnico conservador para futura descoberta com cliente.',
    '- Os `false` em `operation` são somente valores de modelo; NÃO significam requisitos confirmados do cliente.',
    '- `parecer.md`: resultado inicial da auditoria da Fase 5.15.',
    '- `handoff.json`: limites, dependências e próximos passos da modalidade.',
    '- `manifest.json`: hashes SHA-256 dos arquivos gerados; verificador detecta qualquer modificação.','',
    '## Quando surgir um cliente','',
    '1. Descobrir o fornecedor e os requisitos reais; não reaproveitar IDs fictícios.',
    '2. Fazer a avaliação técnica das fases 5.15 e 5.19 com perfil próprio e dados autorizados.',
    '3. Configurar credenciais reais exclusivamente no armazenamento seguro por loja, nunca neste kit.',
    '4. Homologar todos os fluxos necessários e conciliar pedidos, estoques e exceções.',
    '5. Solicitar aprovação humana documentada para habilitar o conector.',
    '',
    ...(mode==='f40-erp'?[
      '## ERP/PDV da Frequência40 — escopo futuro','',
      '**O ERP próprio ainda não existe como integração operacional.** Este modo é apenas um planejamento de interface.',
      'Ao desenvolvê-lo, usar a API autenticada por loja e os eventos existentes, mantendo idempotência, reconciliação, persistência e fiscal independentes.',
      'O arquivo `backend/connectors/reference/adapter.example.mjs` continua com `ready=false` por segurança.','',
    ]:[]),
    ...(mode==='csv'?[
      '## Particularidade do CSV','',
      'Catálogo/estoque: importação assistida; pedidos: exportação manual e conciliação por arquivos.',
      'Nenhum arquivo gerado demonstra aceitação por ERP ou PDV externo.','',
    ]:[]),
    '## Conferir integridade do kit','',
    'Na raiz do projeto, executar:',
    '```powershell',
    `node backend\\connectors\\onboarding\\cli.mjs --check "CAMINHO_DA_PASTA_DO_KIT"`,
    '```','',
    'A conferência NÃO testa APIs, não confere banco Railway e não substitui a homologação real.','',
  ].join('\n');
}
export function createKit({mode,alias}){
  const profile=createProfile({mode,alias});
  const report=assessProfile(profile);
  const handoff=buildHandoff({mode,alias,report});
  const files={
    'assessment.profile.json':string(profile),
    'parecer.md':reportMarkdown(report),
    'handoff.json':string(handoff),
    'GUIA.md':guide({mode,alias,report}),
  };
  const manifest={schemaVersion:1,generator:GENERATOR,mode,storeAlias:alias,
    productionAuthorized:false,files:Object.fromEntries(FILE_NAMES.map(k=>[k,sha256(files[k])]))};
  return {files,manifest};
}
export function validateKitFiles(files,manifest){
  exact(manifest,['schemaVersion','generator','mode','storeAlias','productionAuthorized','files'],'ONBOARDING_MANIFEST_INVALID');
  if(manifest.schemaVersion!==1||manifest.generator!==GENERATOR||manifest.productionAuthorized!==false)
    fail('ONBOARDING_MANIFEST_INVALID');
  exact(manifest.files,FILE_NAMES,'ONBOARDING_MANIFEST_FILES_INVALID');
  if(!MODES.includes(manifest.mode))fail('ONBOARDING_MODE_INVALID');
  validateAlias(manifest.storeAlias);
  exact(files,FILE_NAMES,'ONBOARDING_FILES_INVALID');
  // Exact reconstruction prohibits hidden secrets and false approvals in the file set.
  const expected=createKit({mode:manifest.mode,alias:manifest.storeAlias});
  for(const name of FILE_NAMES){
    if(typeof files[name]!=='string'||Buffer.byteLength(files[name])>65_536||
      !/^[0-9a-f]{64}$/.test(manifest.files[name])||
      manifest.files[name]!==sha256(files[name]))fail('ONBOARDING_FILE_HASH_MISMATCH');
    if(files[name]!==expected.files[name])fail('ONBOARDING_CONTENT_CHANGED');
  }
  if(JSON.stringify(manifest)!==JSON.stringify(expected.manifest))fail('ONBOARDING_MANIFEST_CHANGED');
  return {
    ok:true,mode:manifest.mode,storeAlias:manifest.storeAlias,
    offline:true,clientBound:false,productionAuthorized:false,
    filesVerified:FILE_NAMES.length,assessmentVerdict:assessProfile(createProfile({mode:manifest.mode,alias:manifest.storeAlias})).verdict,
  };
}
