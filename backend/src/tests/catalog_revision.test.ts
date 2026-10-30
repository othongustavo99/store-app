import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {pool} from '../db/pool.js';
import {createAccessToken} from '../security/tokens.js';
import {catalogManagementRoutes} from '../routes/catalog_management.js';

const store='10000000-0000-4000-8000-000000000001';
const product='20000000-0000-4000-8000-000000000001';
const revision='2026-10-30T10:00:00.123456Z';
const body={name:'Camisa',description:'Descrição',sizeGuide:'',categoryId:product,
  priceCents:7990,oldPriceCents:null,images:['https://example.invalid/photo.jpg'],videos:[],
  isFeatured:false,isNew:false,status:'PUBLISHED'};
async function fixture(t:TestContext){
  const queries:string[]=[];
  const query=async(sql:string)=>{
    queries.push(sql);const result=(rows:unknown[])=>({rowCount:rows.length,rows});
    if(sql.includes('FROM refresh_sessions'))return result([{}]);
    if(sql.includes('FROM store_memberships'))return result([{role:'OWNER',status:'ACTIVE'}]);
    if(sql.includes('FROM categories'))return result([{}]);
    if(sql.includes('FROM products WHERE'))return result([{id:product,revision}]);
    if(sql.includes('SELECT 1 FROM product_variants'))return result([{}]);
    return result([]);
  };
  t.mock.method(pool,'query',query);t.mock.method(pool,'connect',async()=>({query,release(){}}));
  const app=Fastify();t.after(()=>app.close());await app.register(catalogManagementRoutes);
  const token=await createAccessToken(product,store);
  return{queries,patch:(extra:Record<string,unknown>)=>app.inject({method:'PATCH',
    url:`/v1/stores/${store}/catalog/manage/products/${product}`,headers:{authorization:`Bearer ${token}`},payload:{...body,...extra}})};
}
test('edição com revisão atual salva preço e preserva quantidades',async t=>{
  const f=await fixture(t);assert.equal((await f.patch({expectedRevision:revision})).statusCode,200);
  assert.ok(f.queries.some(q=>q.includes('UPDATE products SET')));
  assert.equal(f.queries.some(q=>/SET\s+(on_hand|reserved)/i.test(q)),false);
});
test('edição antiga não sobrescreve o produto alterado em outro dispositivo',async t=>{
  const f=await fixture(t);assert.equal((await f.patch({expectedRevision:'2026-10-30T10:00:00.123455Z'})).statusCode,409);
  assert.equal(f.queries.some(q=>q.includes('UPDATE products SET')||q.includes('UPDATE product_variants')),false);
  assert.ok(f.queries.includes('ROLLBACK'));
});
test('aplicativo anterior continua aceito durante implantação gradual',async t=>{
  const f=await fixture(t);assert.equal((await f.patch({})).statusCode,200);
});
test('revisão malformada e tentativa de editar saldo no catálogo são rejeitadas',async t=>{
  const f=await fixture(t);
  assert.equal((await f.patch({expectedRevision:'qualquer'})).statusCode,400);
  assert.equal((await f.patch({stock:999})).statusCode,400);
  assert.equal(f.queries.some(q=>q.includes('UPDATE products')),false);
});
