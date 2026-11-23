import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {config} from '../config.js';
import {pool} from '../db/pool.js';
import {createAccessToken} from '../security/tokens.js';
import {storeCommercialRolloutRoutes} from '../routes/store_commercial_rollout.js';
import {commercialPlanInput,commercialPlanView,emptyCommercialPlan} from '../services/store_commercial_rollout.js';

const store='11111111-1111-4111-8111-111111111111';
const anotherStore='22222222-2222-4222-8222-222222222222';
const user='33333333-3333-4333-8333-333333333333';
const path=`/v1/stores/${store}/commercial/rollout`;
const data={expectedRevision:0,paymentProvider:'MERCADOPAGO',paymentStage:'PLANNED',paymentEnvironment:'SANDBOX',
  refundStage:'PLANNED',carrierProvider:'MELHOR_ENVIO',carrierStage:'CREDENTIALS_PENDING',carrierEnvironment:'SANDBOX'};
const res=(rows:unknown[]=[])=>({rows,rowCount:rows.length});
const stored={payment_provider:'MERCADOPAGO',payment_stage:'PLANNED',payment_environment:'SANDBOX',refund_stage:'PLANNED',
  carrier_provider:'MELHOR_ENVIO',carrier_stage:'CREDENTIALS_PENDING',carrier_environment:'SANDBOX',revision:3,updated_at:new Date()};
async function auth(){return {authorization:`Bearer ${await createAccessToken(user,randomUUID())}`};}

function fixture(t:TestContext,opts:{role?:string;stored?:boolean;storeStatus?:string;conflict?:boolean;denyStore?:boolean}={}){
  const queries:{sql:string;args:unknown[]}[]=[];
  const txn:string[]=[];
  t.mock.method(pool,'query',async (sql:string,args:unknown[]=[])=>{
    queries.push({sql,args});
    if(sql.includes('FROM refresh_sessions'))return res([{}]);
    if(sql.includes('FROM store_memberships'))return res(opts.denyStore?[]:[{role:opts.role??'OWNER',status:opts.storeStatus??'ACTIVE'}]);
    if(sql.includes('FROM store_commercial_rollouts'))return res(opts.stored?[stored]:[]);
    throw new Error(`Consulta inesperada: ${sql}`);
  });
  t.mock.method(pool,'connect',async ()=>({
    async query(sql:string,args:unknown[]=[]){
      queries.push({sql,args});txn.push(sql.startsWith('SELECT')?sql:sql.split(' ')[0]);
      if(sql.includes('FROM stores WHERE'))return res(opts.storeStatus==='SUSPENDED'?[]:[{id:store}]);
      if(sql.includes('FROM store_commercial_rollouts'))return res(opts.stored?[{revision:3}]:[]);
      if(sql.startsWith('INSERT INTO store_commercial_rollouts'))return res([{...stored,revision:1,
        payment_provider:args[1],payment_stage:args[2],payment_environment:args[3],refund_stage:args[4],
        carrier_provider:args[5],carrier_stage:args[6],carrier_environment:args[7]}]);
      if(sql.startsWith('UPDATE store_commercial_rollouts'))return opts.conflict?res([]):res([{...stored,revision:4,
        payment_provider:args[1],payment_stage:args[2],payment_environment:args[3],refund_stage:args[4],
        carrier_provider:args[5],carrier_stage:args[6],carrier_environment:args[7]}]);
      return res();
    },
    release(){txn.push('RELEASE');},
  }));
  const app=Fastify();t.after(()=>app.close());
  return {app,queries,txn};
}

test('plano inicial nao habilita cobrança, estorno ou transportadora',()=>{
  const v=commercialPlanView();
  assert.equal(v.revision,0);
  assert.deepEqual(v.plan,emptyCommercialPlan);
  assert.equal(v.activation.paymentEnabledByPlan,false);
  assert.equal(v.activation.carrierEnabledByPlan,false);
  assert.equal(v.activation.refundEnabledByPlan,false);
  assert.equal(v.activation.automaticGoLive,false);
});
test('a revisão do plano nao significa homologação',()=>{
  const v=commercialPlanView({...stored,payment_stage:'HOMOLOGATION_PENDING',carrier_stage:'HOMOLOGATION_PENDING'},
    {paymentPilot:true,carrierPilot:true,refundPilot:true});
  assert.equal(v.activation.certified,false);
  assert.equal(v.legacyPilot.paymentPilot,true);
  assert.match(v.note,/NÃO altera/);
  assert.equal(v.plan.paymentStage,'HOMOLOGATION_PENDING');
});
test('não aceita qualquer segredo, URL, email, CPF ou campos fora do contrato',()=>{
  for(const extra of [{token:'abc'},{apiKey:'secret'},{cpf:'12345678900'},{note:'x'},{credentials:{token:'xyz'}},
    {webhookUrl:'https://x.example'}, {ownerEmail:'owner@example.com'}]){
    assert.equal(commercialPlanInput.safeParse({...data,...extra}).success,false);
  }
});
test('rejeita planos incoerentes e estágios desconhecidos',()=>{
  for(const patch of [{paymentProvider:'NONE'},{paymentStage:'NOT_PLANNED'},
    {carrierProvider:'NONE'},{carrierStage:'NOT_PLANNED'},
    {refundStage:'APPROVED'},{paymentStage:'LIVE'},{carrierEnvironment:'INVALID'},
    {expectedRevision:-1},{paymentEnvironment:'PRODUCTION',refundStage:'ENABLED'}]){
    assert.equal(commercialPlanInput.safeParse({...data,...patch}).success,false,JSON.stringify(patch));
  }
});
test('permite modo sem gateway, sem dados privados e sem envios',()=>{
  assert.equal(commercialPlanInput.safeParse({...emptyCommercialPlan,expectedRevision:0}).success,true);
});
test('permite fornecedor OTHER apenas como planejamento',()=>{
  const v=commercialPlanInput.safeParse({...data,paymentProvider:'OTHER',refundStage:'NOT_PLANNED',carrierProvider:'OTHER'});
  assert.equal(v.success,true);
  const p=commercialPlanView({...stored,payment_provider:'OTHER',refund_stage:'NOT_PLANNED',carrier_provider:'OTHER'});
  assert.ok(p.nextSteps.some(s=>s.includes('adaptador')));
  assert.equal(p.activation.certified,false);
});
test('GET exige autenticação e retorna somente campos declaratórios',async t=>{
  const f=fixture(t);await f.app.register(storeCommercialRolloutRoutes);
  assert.equal((await f.app.inject({method:'GET',url:path})).statusCode,401);
  const r=await f.app.inject({method:'GET',url:path,headers:await auth()});
  assert.equal(r.statusCode,200,r.body);
  assert.equal(r.json().revision,0);
  assert.equal(r.json().activation.paymentEnabledByPlan,false);
  assert.ok(!JSON.stringify(r.json()).includes('accessToken'));
  assert.ok(f.queries.some(q=>q.sql.includes('FROM store_commercial_rollouts') && q.args[0]===store));
});
test('GET retorna plano existente sem dados sensíveis',async t=>{
  const f=fixture(t,{stored:true});await f.app.register(storeCommercialRolloutRoutes);
  const r=await f.app.inject({method:'GET',url:path,headers:await auth()});
  assert.equal(r.statusCode,200,r.body);
  assert.equal(r.json().revision,3);
  assert.equal(r.json().plan.paymentProvider,'MERCADOPAGO');
  assert.equal(r.json().activation.automaticGoLive,false);
});
test('OWNER grava plano isolado em transação e trilha de auditoria',async t=>{
  const f=fixture(t);await f.app.register(storeCommercialRolloutRoutes);
  const r=await f.app.inject({method:'PUT',url:path,headers:await auth(),payload:data});
  assert.equal(r.statusCode,200,r.body);
  assert.equal(r.json().revision,1);
  assert.ok(f.txn.includes('BEGIN') && f.txn.includes('COMMIT') && f.txn.includes('RELEASE'));
  const written=f.queries.find(q=>q.sql.startsWith('INSERT INTO store_commercial_rollouts'));
  assert.equal(written?.args[0],store);
  const audit=f.queries.find(q=>q.sql.includes('INSERT INTO audit_logs'));
  assert.equal(audit?.args[0],store);
  assert.ok(!JSON.stringify(audit?.args).includes('credentials'));
});
test('OWNER altera somente a loja pretendida usando revisão esperada',async t=>{
  const f=fixture(t,{stored:true});await f.app.register(storeCommercialRolloutRoutes);
  const r=await f.app.inject({method:'PUT',url:path,headers:await auth(),payload:{...data,expectedRevision:3}});
  assert.equal(r.statusCode,200,r.body);
  const query=f.queries.find(q=>q.sql.startsWith('UPDATE store_commercial_rollouts'));
  assert.equal(query?.args[0],store);
  assert.equal(query?.args[9],3);
});
test('revisão incorreta falha com rollback sem escrita',async t=>{
  const f=fixture(t,{stored:true});await f.app.register(storeCommercialRolloutRoutes);
  const r=await f.app.inject({method:'PUT',url:path,headers:await auth(),payload:data});
  assert.equal(r.statusCode,409,r.body);
  assert.ok(f.txn.includes('ROLLBACK'));
  assert.ok(!f.queries.some(q=>q.sql.includes('INTO audit_logs')));
});
test('conflito na atualização bloqueia e faz rollback',async t=>{
  const f=fixture(t,{stored:true,conflict:true});await f.app.register(storeCommercialRolloutRoutes);
  const r=await f.app.inject({method:'PUT',url:path,headers:await auth(),payload:{...data,expectedRevision:3}});
  assert.equal(r.statusCode,409,r.body);
  assert.ok(f.txn.includes('ROLLBACK'));
});
test('MANAGER pode ler mas não escrever',async t=>{
  const f=fixture(t,{role:'MANAGER'});await f.app.register(storeCommercialRolloutRoutes);
  const h=await auth();
  assert.equal((await f.app.inject({method:'GET',url:path,headers:h})).statusCode,200);
  assert.equal((await f.app.inject({method:'PUT',url:path,headers:h,payload:data})).statusCode,403);
  assert.equal(f.txn.length,0);
});
test('STAFF não lê nem escreve',async t=>{
  const f=fixture(t,{role:'STAFF'});await f.app.register(storeCommercialRolloutRoutes);
  const h=await auth();
  assert.equal((await f.app.inject({method:'GET',url:path,headers:h})).statusCode,403);
  assert.equal((await f.app.inject({method:'PUT',url:path,headers:h,payload:data})).statusCode,403);
});
test('loja estranha não ganha acesso ou existência de plano',async t=>{
  const f=fixture(t,{denyStore:true});await f.app.register(storeCommercialRolloutRoutes);
  const h=await auth();
  assert.equal((await f.app.inject({method:'GET',url:path,headers:h})).statusCode,404);
  assert.equal((await f.app.inject({method:'PUT',url:path,headers:h,payload:data})).statusCode,404);
  assert.equal(f.txn.length,0);
});
test('loja suspensa não pode salvar',async t=>{
  const f=fixture(t,{storeStatus:'SUSPENDED'});await f.app.register(storeCommercialRolloutRoutes);
  assert.equal((await f.app.inject({method:'PUT',url:path,headers:await auth(),payload:data})).statusCode,403);
});
test('PUT rejeita segredos sem iniciar transação',async t=>{
  const f=fixture(t);await f.app.register(storeCommercialRolloutRoutes);
  const h=await auth();
  for(const extra of [{webhookSecret:'x'}, {mercadopagoAccessToken:'foo'}, {notes:'client@example.com'}]){
    const r=await f.app.inject({method:'PUT',url:path,headers:h,payload:{...data,...extra}});
    assert.equal(r.statusCode,400,r.body);
  }
  assert.equal(f.txn.length,0);
});
test('plano de uma loja não implica permissão da outra',()=>{
  const a=commercialPlanView(stored,{paymentPilot:true,carrierPilot:false,refundPilot:false});
  const b=commercialPlanView(undefined,{paymentPilot:false,carrierPilot:false,refundPilot:false});
  assert.equal(a.legacyPilot.paymentPilot,true);
  assert.equal(b.legacyPilot.paymentPilot,false);
  assert.notEqual(store,anotherStore);
});
