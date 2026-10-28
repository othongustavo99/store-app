import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { accountSecurityRoutes } from '../routes/account_security.js';

test('recuperação de senha mostra formulário sem token embutido na URL',async()=>{
  const app=Fastify();
  try {
    await app.register(accountSecurityRoutes);
    const res=await app.inject({method:'GET',url:'/account/redefinir-senha'});
    assert.equal(res.statusCode,200);
    assert.match(res.body,/data-kind="reset"/);
    assert.match(res.headers['cache-control']??'',/no-store/);
    assert.equal(res.headers['referrer-policy'],'no-referrer');
  } finally {await app.close();}
});
test('pedido de exclusão acessível pelo navegador externo',async()=>{
  const app=Fastify();
  try {
    await app.register(accountSecurityRoutes);
    const res=await app.inject({method:'GET',url:'/account/excluir-conta'});
    assert.equal(res.statusCode,200);
    assert.match(res.body,/data-kind="deletion"/);
    const js=await app.inject({method:'GET',url:'/account/account.js'});
    assert.equal(js.statusCode,200);
    assert.match(js.body,/history.replaceState/);
  } finally {await app.close();}
});
