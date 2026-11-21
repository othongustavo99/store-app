import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {pool} from '../db/pool.js';
import {config} from '../config.js';
import {createAccessToken} from '../security/tokens.js';
import {externalDeploymentProfileRoutes} from '../routes/external_deployment_profile.js';
import {deploymentView,emptyDeploymentChecks} from '../services/external_deployment_profile.js';

const store='11111111-1111-4111-8111-111111111111';
const integration='22222222-2222-4222-8222-222222222222';
const user='33333333-3333-4333-8333-333333333333';
const uri=`/v1/stores/${store}/integrations/${integration}/deployment`;
const result=(rows:object[])=>({rows,rowCount:rows.length});
const input={expectedRevision:0,environment:'HOMOLOGATION',workerAlias:'loja-demo-01',checks:{
  credentialsSecured:true,providerAccessChecked:false,catalogChecked:false,
  ordersChecked:false,reconciliationChecked:false,
}};

test('o perfil nao e homologacao nem aciona o worker',()=>{
  const initial=deploymentView('bling',false);
  assert.equal(initial.setupStatus,'PENDING');
  assert.equal(initial.revision,0);
  assert.equal(initial.total,5);
  assert.deepEqual(initial.checks,emptyDeploymentChecks);
  const all=deploymentView('bling',false,{
    environment:'PRODUCTION',workerAlias:'loja-01',revision:3,updatedAt:new Date(),
    credentialsSecured:true,providerAccessChecked:true,catalogChecked:true,
    ordersChecked:true,reconciliationChecked:true,
  });
  assert.equal(all.setupStatus,'CHECKLIST_REPORTED');
  assert.equal(all.completed,5);
  assert.match(all.note,/nao ativa/i);
  assert.equal(deploymentView('bling',true).setupStatus,'REVOKED');
});

async function fixture(t:TestContext, options:{role?:string;exists?:boolean;revoked?:boolean;stored?:boolean;race?:boolean}={}) {
  const before=config.ENABLE_EXTERNAL_INTEGRATIONS;
  config.ENABLE_EXTERNAL_INTEGRATIONS=true;
  t.after(()=>{config.ENABLE_EXTERNAL_INTEGRATIONS=before;});
  const statements:{sql:string;args:unknown[]}[]=[];
  t.mock.method(pool,'query',async(sql:string,args:unknown[]=[])=>{
    statements.push({sql,args});
    if(sql.includes('FROM refresh_sessions'))return result([{}]);
    if(sql.includes('FROM store_memberships'))return result([{role:options.role??'OWNER',status:'ACTIVE'}]);
    if(sql.includes('FROM external_integrations'))return result(options.exists===false?[]:[{provider:'bling',revokedAt:options.revoked?new Date():null}]);
    if(sql.includes('FROM external_integration_deployments'))return result(options.stored?[{
      environment:'HOMOLOGATION',workerAlias:'worker-01',revision:2,
      credentialsSecured:true,providerAccessChecked:true,catalogChecked:false,
      ordersChecked:false,reconciliationChecked:false,updatedAt:new Date(),
    }]:[]);
    throw new Error(`SQL inesperado ${sql.slice(0,60)}`);
  });
  const txn:string[]=[];
  t.mock.method(pool,'connect',async()=>({
    async query(sql:string,args:unknown[]=[]){
      txn.push(sql);
      if(sql.includes('INSERT INTO external_integration_deployments')){
        if(options.race)return result([]);
        return result([{
          environment:args[3],workerAlias:args[4],revision:Number(args[2])+1,
          credentialsSecured:args[5],providerAccessChecked:args[6],catalogChecked:args[7],
          ordersChecked:args[8],reconciliationChecked:args[9],updatedAt:new Date(),
        }]);
      }
      return result([]);
    },
    release(){txn.push('RELEASE');},
  }));
  const app=Fastify();t.after(()=>app.close());
  await app.register(externalDeploymentProfileRoutes);
  return {app,statements,txn};
}
async function bearer(){return {authorization:`Bearer ${await createAccessToken(user,randomUUID())}`};}

test('GET exige OWNER e responde sem credenciais e com isolamento entre lojas',async t=>{
  const {app,statements}=await fixture(t);
  assert.equal((await app.inject({method:'GET',url:uri})).statusCode,401);
  const res=await app.inject({method:'GET',url:uri,headers:await bearer()});
  assert.equal(res.statusCode,200,res.body);
  assert.equal(res.json().hasProfile,false);
  assert.equal(res.json().revision,0);
  assert.ok(statements.some(s=>s.sql.includes('FROM external_integrations') &&
    s.args[0]===integration && s.args[1]===store));
  assert.ok(!('token' in res.json()) && !('secret' in res.json()));
});

test('PUT grava checklist declaratorio e trilha de auditoria sem dados sensiveis',async t=>{
  const {app,txn}=await fixture(t);
  const res=await app.inject({method:'PUT',url:uri,headers:await bearer(),payload:input});
  assert.equal(res.statusCode,200,res.body);
  assert.equal(res.json().revision,1);
  assert.equal(res.json().completed,1);
  assert.ok(txn.some(sql=>sql.includes('INSERT INTO audit_logs')));
  assert.ok(txn.includes('COMMIT'));
  assert.ok(txn.includes('RELEASE'));
});

test('PUT nao aceita segredos extras, campos livres, ambiente desconhecido ou alias suspeito',async t=>{
  const {app,txn}=await fixture(t);
  const auth=await bearer();
  for(const payload of [
    {...input,omieToken:'secret'},
    {...input,workerAlias:'http://evil.example'},
    {...input,workerAlias:'client@example.com'},
    {...input,environment:'LIVE'},
    {...input,checks:{...input.checks,cpf:'12345678900'}},
    {...input,expectedRevision:-1},
  ]){
    const res=await app.inject({method:'PUT',url:uri,headers:auth,payload});
    assert.equal(res.statusCode,400,res.body);
  }
  assert.equal(txn.length,0);
});

test('conflito de revisao retorna 409 e faz rollback sem auditoria',async t=>{
  const {app,txn}=await fixture(t,{race:true});
  const res=await app.inject({method:'PUT',url:uri,headers:await bearer(),payload:input});
  assert.equal(res.statusCode,409,res.body);
  assert.ok(txn.includes('ROLLBACK'));
  assert.ok(!txn.some(s=>s.includes('INSERT INTO audit_logs')));
});

test('somente o proprietario da loja pode editar implantacao',async t=>{
  {
    const {app}=await fixture(t,{role:'STAFF'});
    assert.equal((await app.inject({method:'PUT',url:uri,headers:await bearer(),payload:input})).statusCode,403);
  }
});

test('rejeita integracao revogada',async t=>{
  const {app,txn}=await fixture(t,{revoked:true});
  assert.equal((await app.inject({method:'PUT',url:uri,headers:await bearer(),payload:input})).statusCode,409);
  assert.equal(txn.length,0);
});
test('rejeita integracao de outra loja',async t=>{
  const {app}=await fixture(t,{exists:false});
  assert.equal((await app.inject({method:'GET',url:uri,headers:await bearer()})).statusCode,404);
});
test('flag de integracoes desabilitada bloqueia configuracao',async t=>{
  const {app}=await fixture(t);
  config.ENABLE_EXTERNAL_INTEGRATIONS=false;
  assert.equal((await app.inject({method:'GET',url:uri,headers:await bearer()})).statusCode,503);
});
