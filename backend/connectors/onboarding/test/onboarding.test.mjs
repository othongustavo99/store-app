import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,symlink,rm,mkdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createKit,createProfile,validateKitFiles,validateAlias,MODES,FILE_NAMES,sha256,OnboardingError}
  from '../onboarding.mjs';
import {checkKit,initKit,doctor,parseArgs} from '../cli.mjs';
import {assessProfile} from '../../assessment/assessment.mjs';

const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
const run=args=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:10_000});
const error=code=>e=>e instanceof OnboardingError&&e.code===code;
const clone=x=>structuredClone(x);
const temp=async fn=>{const d=await mkdtemp(join(tmpdir(),'f40-kit-'));
  try{return await fn(d);}finally{await rm(d,{recursive:true,force:true});}};
const base=()=>createKit({mode:'bling',alias:'loja_teste'});

test('01 cinco modalidades conhecidas, ERP proprio separado',()=>{
  assert.deepEqual(MODES,['bling','omie','olist','csv','f40-erp']);
});
test('02 nenhum kit declara produção autorizada',()=>{
  for(const mode of MODES){const {manifest,files}=createKit({mode,alias:'loja_teste'});
    assert.equal(manifest.productionAuthorized,false);
    assert.equal(JSON.parse(files['handoff.json']).productionAuthorized,false);
  }
});
test('03 fornecedor externo aproveita fluxos da auditoria existente',()=>{
  for(const m of ['bling','omie','olist']){
    const profile=createProfile({mode:m,alias:'loja_teste'});
    assert.equal(profile.provider,m);assert.equal(profile.transport,'connector');
    assert.equal(profile.requiredFlows.length,4);
    assert.equal(assessProfile(profile).productionAuthorized,false);
  }
});
test('04 CSV não inventa envio automático nem emissão fiscal',()=>{
  const profile=createProfile({mode:'csv',alias:'loja_teste'});
  assert.deepEqual(profile.requiredFlows,['catalog_import','stock_import']);
  assert.equal(profile.provider,'other');assert.equal(profile.transport,'csv');
  assert.match(createKit({mode:'csv',alias:'loja_teste'}).files['GUIA.md'],/exportação manual/);
});
test('05 ERP próprio é plano futuro, nunca conector operacional',()=>{
  const kit=createKit({mode:'f40-erp',alias:'loja_teste'});
  assert.equal(kit.manifest.mode,'f40-erp');
  assert.equal(JSON.parse(kit.files['handoff.json']).implementation,'FUTURE_CONNECTOR_NOT_IMPLEMENTED');
  assert.equal(createProfile({mode:'f40-erp',alias:'loja_teste'}).transport,'api');
  assert.ok(assessProfile(createProfile({mode:'f40-erp',alias:'loja_teste'})).summary.hardBlockers>0);
});
test('06 todas as evidências começam não confirmadas',()=>{
  for(const mode of MODES){const p=createProfile({mode,alias:'loja_teste'});
    assert.ok(Object.values(p.evidence).every(v=>v==='unconfirmed'));
    assert.ok(Object.values(p.vendorCapabilities).every(v=>v==='unconfirmed'));
  }
});
test('07 nunca gera IDs fictícios que se confundam com credenciais',()=>{
  for(const mode of MODES){const h=JSON.parse(createKit({mode,alias:'loja_teste'}).files['handoff.json']);
    assert.equal(h.storeId,null);assert.equal(h.integrationId,null);
    assert.equal(h.credentialsIncluded,false);assert.equal(h.clientBound,false);
  }
});
test('08 não gera chave secreta ou endereço privado',()=>{
  for(const mode of MODES){const files=createKit({mode,alias:'loja_teste'}).files;
    const raw=Object.values(files).join('\n');
    assert.doesNotMatch(raw,/f40i_[A-Za-z0-9_-]{43}|BEGIN PRIVATE KEY|postgres:\/\//);
  }
});
test('09 aliases com caracteres inválidos são rejeitados',()=>{
  for(const alias of ['ABC','A','a','1abc','ab c','abc/def','abc\\def','abc@def','abc.dev','ábc','a'.repeat(41),'../abc','ab\n']){
    assert.throws(()=>validateAlias(alias),error('ONBOARDING_ALIAS_INVALID'));
  }
});
test('10 alias seguro e convencional funciona',()=>{
  assert.equal(validateAlias('loja_01-abc'),'loja_01-abc');
});
test('11 modalidade inventada é rejeitada',()=>{
  assert.throws(()=>createKit({mode:'erp_random',alias:'loja_teste'}),error('ONBOARDING_MODE_INVALID'));
});
test('12 hashes dos quatro arquivos batem com o manifesto',()=>{
  const kit=base();for(const name of FILE_NAMES)assert.equal(kit.manifest.files[name],sha256(kit.files[name]));
});
test('13 verificação de kit íntegro devolve status conservador',()=>{
  const kit=base();const r=validateKitFiles(kit.files,kit.manifest);
  assert.equal(r.ok,true);assert.equal(r.filesVerified,4);assert.equal(r.productionAuthorized,false);
});
test('14 todos os modos são verificáveis',()=>{
  for(const mode of MODES){const kit=createKit({mode,alias:'loja_teste'});
    assert.equal(validateKitFiles(kit.files,kit.manifest).ok,true);
  }
});
test('15 alteração de conteúdo sem trocar hash é recusada',()=>{
  const kit=base();kit.files['GUIA.md']+='alteração';
  assert.throws(()=>validateKitFiles(kit.files,kit.manifest),error('ONBOARDING_FILE_HASH_MISMATCH'));
});
test('16 alteração com novo hash também é recusada',()=>{
  const kit=base();kit.files['GUIA.md']+='aprovo produção';kit.manifest.files['GUIA.md']=sha256(kit.files['GUIA.md']);
  assert.throws(()=>validateKitFiles(kit.files,kit.manifest),error('ONBOARDING_CONTENT_CHANGED'));
});
test('17 troca de loja sem regenerar é recusada',()=>{
  const kit=base();kit.manifest.storeAlias='outra_loja';
  assert.throws(()=>validateKitFiles(kit.files,kit.manifest),error('ONBOARDING_CONTENT_CHANGED'));
});
test('18 campo token extra no manifesto é recusado',()=>{
  const kit=base();kit.manifest.token='xxxx';
  assert.throws(()=>validateKitFiles(kit.files,kit.manifest),error('ONBOARDING_MANIFEST_INVALID'));
});
test('19 campo extra no conjunto de arquivos é recusado',()=>{
  const kit=base();kit.files['secret.txt']='segredo';
  assert.throws(()=>validateKitFiles(kit.files,kit.manifest),error('ONBOARDING_FILES_INVALID'));
});
test('20 arquivo em falta no manifesto é recusado',()=>{
  const kit=base();delete kit.manifest.files['parecer.md'];
  assert.throws(()=>validateKitFiles(kit.files,kit.manifest),error('ONBOARDING_MANIFEST_FILES_INVALID'));
});
test('21 falso status de produção é recusado',()=>{
  const kit=base();kit.manifest.productionAuthorized=true;
  assert.throws(()=>validateKitFiles(kit.files,kit.manifest),error('ONBOARDING_MANIFEST_INVALID'));
});
test('22 hash de formato inválido é recusado',()=>{
  const kit=base();kit.manifest.files['parecer.md']='a';
  assert.throws(()=>validateKitFiles(kit.files,kit.manifest),error('ONBOARDING_FILE_HASH_MISMATCH'));
});
test('23 parse não aceita parâmetros extras',()=>{
  assert.throws(()=>parseArgs(['--doctor','extra']),error('ONBOARDING_CLI_USAGE'));
});
test('24 parse aceita argumentos sem depender da ordem',()=>{
  assert.deepEqual(parseArgs(['--init','--output','caminho','--alias','loja_teste','--mode','csv']),
    {action:'init',mode:'csv',alias:'loja_teste',path:'caminho'});
});
test('25 parse não aceita flag duplicada',()=>{
  assert.throws(()=>parseArgs(['--init','--mode','csv','--mode','csv','--alias','loja_teste','--output','k']),
    error('ONBOARDING_CLI_USAGE'));
});
test('26 --init cria apenas diretório novo e arquivos esperados',async()=>temp(async dir=>{
  const d=join(dir,'novo');const r=await initKit({mode:'bling',alias:'loja_teste',path:d});
  assert.equal(r.filesVerified,4);assert.equal((await checkKit(d)).ok,true);
}));
test('27 init não sobrescreve pasta existente',async()=>temp(async dir=>{
  const d=join(dir,'existente');await mkdir(d);await writeFile(join(d,'arquivo.txt'),'original');
  await assert.rejects(initKit({mode:'csv',alias:'loja_teste',path:d}),error('ONBOARDING_TARGET_EXISTS'));
  assert.equal(await readFile(join(d,'arquivo.txt'),'utf8'),'original');
}));
test('28 check rejeita arquivo desconhecido ou credencial adicionada',async()=>temp(async dir=>{
  const d=join(dir,'novo');await initKit({mode:'csv',alias:'loja_teste',path:d});
  await writeFile(join(d,'tokens.json'),'{}');
  await assert.rejects(checkKit(d),error('ONBOARDING_UNKNOWN_FILES'));
}));
test('29 check rejeita arquivo de kit adulterado',async()=>temp(async dir=>{
  const d=join(dir,'novo');await initKit({mode:'csv',alias:'loja_teste',path:d});
  await writeFile(join(d,'parecer.md'),'MODIFICADO');
  await assert.rejects(checkKit(d),error('ONBOARDING_FILE_HASH_MISMATCH'));
}));
test('30 check rejeita manifesto malformado',async()=>temp(async dir=>{
  const d=join(dir,'novo');await initKit({mode:'csv',alias:'loja_teste',path:d});
  await writeFile(join(d,'manifest.json'),'{não-é-json');
  await assert.rejects(checkKit(d),error('ONBOARDING_MANIFEST_JSON_INVALID'));
}));
test('31 check rejeita links simbólicos dentro do kit',async()=>temp(async dir=>{
  const d=join(dir,'novo');await initKit({mode:'csv',alias:'loja_teste',path:d});
  const outside=join(dir,'externo');await copyFile(join(d,'parecer.md'),outside);
  await rm(join(d,'parecer.md'));
  await symlink(outside,join(d,'parecer.md'));
  await assert.rejects(checkKit(d),error('ONBOARDING_FILE_INVALID'));
}));
test('32 check rejeita diretório simbólico',async()=>temp(async dir=>{
  const d=join(dir,'novo');await initKit({mode:'csv',alias:'loja_teste',path:d});
  const link=join(dir,'atalho');await symlink(d,link,'dir');
  await assert.rejects(checkKit(link),error('ONBOARDING_DIR_INVALID'));
}));
test('33 check rejeita arquivo imenso (>80 KB)',async()=>temp(async dir=>{
  const d=join(dir,'novo');await initKit({mode:'csv',alias:'loja_teste',path:d});
  await writeFile(join(d,'GUIA.md'),'a'.repeat(100000));
  await assert.rejects(checkKit(d),error('ONBOARDING_FILE_INVALID'));
}));
test('34 check de diretório inexistente falha fechado',async()=>temp(async dir=>{
  await assert.rejects(checkKit(join(dir,'inexistente')),error('ONBOARDING_DIR_INVALID'));
}));
test('35 doctor identifica arquivos já presentes na base sem ativar nada',async()=>{
  const r=await doctor();assert.equal(r.allFilesPresent,true);
  assert.equal(r.filesPresent,r.filesExpected);
  assert.equal(r.databaseMigrationsApplied,null);
  assert.equal(r.liveSupplierHomologation,false);
  assert.equal(r.productionAuthorized,false);
  assert.equal(r.ownErpConnectorImplemented,false);
});
test('36 doctor acusa falta de arquivo sem afirmar que foi homologado',async()=>temp(async dir=>{
  const r=await doctor({root:dir});assert.equal(r.allFilesPresent,false);
  assert.equal(r.filesPresent,0);assert.equal(r.productionAuthorized,false);
}));
test('37 CLI --doctor termina com sucesso apenas na estrutura completa',()=>{
  const r=run(['--doctor']);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/OFFLINE/);
  assert.match(r.stdout,/produção autorizada=NÃO/);
});
test('38 CLI cria kit com caminhos absolutos usando fileURLToPath (Windows seguro)',async()=>temp(async dir=>{
  const target=join(dir,'kit');const a=run(['--init','--mode','f40-erp','--alias','loja_teste','--output',target]);
  assert.equal(a.status,0,a.stderr);
  const b=run(['--check',target]);assert.equal(b.status,0,b.stderr);
  assert.match(b.stdout,/produção autorizada=NÃO/);
}));
test('39 CLI rejeita argumento desconhecido',()=>{
  const r=run(['--foobar']);assert.equal(r.status,2);assert.match(r.stderr,/ONBOARDING_CLI_USAGE/);
});
test('40 CLI não sobrescreve um kit no segundo uso',async()=>temp(async dir=>{
  const target=join(dir,'kit');let r=run(['--init','--mode','csv','--alias','loja_teste','--output',target]);
  assert.equal(r.status,0,r.stderr);
  r=run(['--init','--mode','csv','--alias','loja_teste','--output',target]);
  assert.equal(r.status,2);assert.match(r.stderr,/ONBOARDING_TARGET_EXISTS/);
}));
test('41 manifesto é determinístico para o mesmo perfil',()=>{
  assert.deepEqual(createKit({mode:'omie',alias:'loja_teste'}),createKit({mode:'omie',alias:'loja_teste'}));
});
test('42 README do modo F40 ERP não apresenta modelo como implementado',()=>{
  const f=createKit({mode:'f40-erp',alias:'loja_teste'}).files['GUIA.md'];
  assert.match(f,/ainda não existe como integração operacional/);
  assert.match(f,/ready=false/);
});

test('43 flags operacionais no modelo são explicitamente não verificadas',()=>{
  const h=JSON.parse(createKit({mode:'bling',alias:'loja_teste'}).files['handoff.json']);
  assert.equal(h.operationAssumptionsUnverified,true);
  assert.match(createKit({mode:'bling',alias:'loja_teste'}).files['GUIA.md'],/significam requisitos confirmados/);
});
