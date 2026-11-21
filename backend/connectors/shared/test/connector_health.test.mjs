import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectorHealthClient} from '../connector_health_client.mjs';
import {runOrderQueue} from '../order_queue_core.mjs';

const url='https://loja.example/';
const token='f40i_'+'a'.repeat(43);
const empty={claimed:0,acknowledged:0,review:0,retry:0,ackErrors:0};

test('telemetria publica somente codigos e contagens permitidos',async()=>{
  let capture;
  const send=createConnectorHealthClient({url,token,fetchImpl:async(input,options)=>{
    capture={input,options};return {ok:true};
  }});
  assert.deepEqual(await send({result:'OK',summary:empty}),{recorded:true});
  assert.equal(capture.input.pathname,'/v1/external/health/report');
  assert.equal(JSON.parse(capture.options.body).component,'ORDERS');
  assert.ok(capture.options.headers.Authorization.endsWith(token));
  await assert.rejects(()=>send({result:'ERROR',errorCode:'token secreto'}),/HEALTH_REPORT_INVALID/);
  await assert.rejects(()=>send({result:'OK',summary:{...empty,cpf:'123'}}),/HEALTH_REPORT_INVALID/);
  await assert.rejects(()=>send({result:'OK',summary:{...empty,claimed:-1}}),/HEALTH_REPORT_INVALID/);
});

test('configuracao impede origem insegura e credencial invalida',()=>{
  assert.throws(()=>createConnectorHealthClient({url:'http://erp.example/',token}),/HEALTH_CONFIG_INVALID/);
  assert.throws(()=>createConnectorHealthClient({url,token:'abc'}),/HEALTH_CONFIG_INVALID/);
});

test('worker reporta sucesso e falha sem transformar erro de telemetria em reenvio',async()=>{
  let batches=0;
  const reports=[];
  const logs=[];
  const logger={log:s=>logs.push(s),error:s=>logs.push(s)};
  await runOrderQueue({once:true,intervalMs:5000,logger,batch:async()=>{batches++;return empty;},
    onCycle:async r=>{reports.push(r);throw Error('sem rede');}});
  assert.equal(batches,1);
  assert.equal(reports[0].result,'OK');
  assert.ok(logs.includes('[queue] HEALTH_REPORT_FAILED'));
  await assert.rejects(()=>runOrderQueue({once:true,intervalMs:5000,logger,
    batch:async()=>{throw Object.assign(new Error('x'),{code:'QUEUE_NETWORK_ERROR'});},
    onCycle:async r=>{reports.push(r);}}),/x/);
  assert.equal(reports[1].result,'ERROR');
  assert.equal(reports[1].errorCode,'QUEUE_NETWORK_ERROR');
});

test('fila com pendencias gera alerta sem expor erro de cliente',async()=>{
  const reports=[];
  await runOrderQueue({once:true,intervalMs:5000,logger:{log(){},error(){}},
    batch:async()=>({...empty,review:1}),onCycle:async r=>{reports.push(r);}});
  assert.equal(reports[0].result,'WARNING');
});
