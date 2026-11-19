import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { createIntegrationKey } from '../integrations/core.js';
import { externalIntegrationRoutes } from '../routes/external_integrations.js';
import { catalogBatch, productImport, validGtin } from '../services/external_catalog_sync.js';

const storeId='11111111-1111-4111-8111-111111111111';
const integrationId='44444444-4444-4444-8444-444444444444';
const categoryId='22222222-2222-4222-8222-222222222222';
const token=createIntegrationKey().key;
const auth={ authorization:`Bearer ${token}` };
const response=(rows:unknown[])=>({rows,rowCount:rows.length});
const item=(overrides:Record<string,unknown>={})=>({
  eventId:randomUUID(),sourceVersion:1,externalProductId:'ERP-P1',categoryId,
  name:'Camiseta de algodao',description:'Produto novo',status:'PUBLISHED',images:['https://example.com/p1.jpg'],
  variants:[{externalVariantId:'V1',sku:'CAM-01',gtin:'4006381333931',color:'Preto',size:'M',priceCents:'5990'}],
  ...overrides,
});

function dbStub(){
  const operations=new Map<string,{payload_hash:string;product_id:string}>();
  const mappings=new Map<string,string>();
  const products=new Map<string,{status:string;images:string[];description:string}>();
  const variants=new Map<string,{id:string;product_id:string;status:string;reserved:number;gtin:string|null;attributes:object}>();
  const externalVariants=new Map<string,string>();
  const versions=new Map<string,string>();
  const queries:Array<{sql:string;args:unknown[]}>=[];
  let failedCategory:string|null=null;
  let reserved=0;
  async function query(sql:string,args:unknown[]=[]){
    queries.push({sql,args});
    if(sql.includes('FROM external_integrations i JOIN stores'))return response([{
      id:integrationId,store_id:storeId,provider:'generic',stock_authority:false,
      scopes:['catalog.read','catalog.write','orders.read','events.read','mapping.write'],
    }]);
    if(sql.includes('FROM external_integrations')&&sql.includes('FOR SHARE'))return response([{}]);
    if(sql.includes("SELECT 1 FROM categories"))return response(args[0]===failedCategory?[]:[{}]);
    if(sql.includes('FROM external_catalog_operations')){
      const a=operations.get(String(args[1]));return response(a?[a]:[]);
    }
    if(sql.includes('FROM external_product_mappings')&&sql.includes('SELECT product_id')){
      const a=mappings.get(String(args[1]));return response(a?[{product_id:a}]:[]);
    }
    if(sql.includes('FROM external_catalog_positions')){
      const v=versions.get(String(args[1]));return response(v?[{source_version:v}]:[]);
    }
    if(sql.includes('SELECT status,images,description FROM products')){
      const p=products.get(String(args[0]));return response(p?[p]:[]);
    }
    if(sql.includes('FROM external_variant_mappings m')){
      const internalId=externalVariants.get(String(args[1]));
      const v=internalId?variants.get(internalId):undefined;return response(v?[v]:[]);
    }
    if(sql.includes('SELECT 1 FROM product_variants'))return response(sql.includes('LIMIT 1')?[{}]:[]);
    if(sql.includes('SELECT reserved FROM product_variants'))return response([{reserved}]);
    if(sql.includes('INSERT INTO products(')){
      products.set(String(args[0]),{status:'DRAFT',images:JSON.parse(String(args[5])),description:String(args[4])});
    }
    if(sql.includes('INSERT INTO external_product_mappings('))mappings.set(String(args[3]),String(args[2]));
    if(sql.includes('INSERT INTO product_variants')){
      variants.set(String(args[0]),{id:String(args[0]),product_id:String(args[2]),status:String(args[7]),reserved,gtin:args[6] ? String(args[6]) : null,attributes:JSON.parse(String(args[4]))});
    }
    if(sql.includes('INSERT INTO external_variant_mappings')){
      externalVariants.set(String(args[3]),String(args[2]));
    }
    if(sql.startsWith('UPDATE product_variants SET')){
      const v=variants.get(String(args[0]));
      if(v){v.status=String(args[6]);v.attributes=JSON.parse(String(args[5]));if(args[7])v.gtin=args[4] ? String(args[4]):null;}
    }
    if(sql.includes('INSERT INTO external_catalog_positions'))versions.set(String(args[2]),String(args[3]));
    if(sql.includes('INSERT INTO external_catalog_operations'))operations.set(String(args[2]),{product_id:String(args[3]),payload_hash:String(args[4])});
    if(sql.startsWith('UPDATE products SET status')){
      const p=products.get(String(args[0]));if(p)p.status=String(args[2]);
    }
    if(sql.startsWith('UPDATE products SET category_id')){
      const p=products.get(String(args[0]));if(p){p.description=String(args[4]??p.description);p.images=args[5]?JSON.parse(String(args[5])):p.images;}
    }
    return response([]);
  }
  return {query,queries,mappings,products,variants,externalVariants,versions,operations,
    failCategory(id:string){failedCategory=id;},setReserved(n:number){reserved=n;}};
}

async function fixture(t:TestContext, db:ReturnType<typeof dbStub>, scopes?:string[]){
  const initial=config.ENABLE_EXTERNAL_INTEGRATIONS;
  config.ENABLE_EXTERNAL_INTEGRATIONS=true;
  t.after(()=>{config.ENABLE_EXTERNAL_INTEGRATIONS=initial;});
  t.mock.method(pool,'query',async(sql:string,args?:unknown[])=>{
    if(scopes && sql.includes('FROM external_integrations i JOIN stores'))return response([{
      id:integrationId,store_id:storeId,provider:'generic',stock_authority:false,scopes,
    }]);
    return db.query(sql,args);
  });
  t.mock.method(pool,'connect',async()=>({query:db.query,release(){}}));
  const app=Fastify();t.after(()=>app.close());
  await app.register(externalIntegrationRoutes);
  return app;
}

test('GTIN/EAN aceita digito verificador correto e preserva zeros a esquerda',()=>{
  assert.equal(validGtin('4006381333931'),true);
  assert.equal(validGtin('4006381333932'),false);
  assert.equal(validGtin('00000000'),true);
  assert.equal(validGtin('123'),false);
  assert.equal(productImport.safeParse(item()).success,true);
  assert.equal(productImport.safeParse(item({variants:[{externalVariantId:'V1',sku:'S1',gtin:'4006381333932',priceCents:'100'}]})).success,false);
});

test('valida duplicacao de SKU/ID externo nos lotes e valores monetarios',()=>{
  const a=item();const b=item({eventId:randomUUID(),externalProductId:'ERP-P2'});
  assert.equal(catalogBatch.safeParse({products:[a,b]}).success,false); // SKU/ID variante repetido.
  assert.equal(catalogBatch.safeParse({products:[a,{...b,variants:[{externalVariantId:'V2',sku:'CAM-02',priceCents:'1000'}]}]}).success,true);
  assert.equal(productImport.safeParse(item({variants:[{externalVariantId:'V1',sku:'SKU-01',priceCents:'12.34'}]})).success,false);
  assert.equal(productImport.safeParse(item({variants:[{externalVariantId:'V1',sku:'SKU-01',priceCents:0}]})).success,false);
});

test('cria produto DRAFT/publicado, SKU, GTIN e mapeamentos sem movimentar estoque',async t=>{
  const db=dbStub(); const app=await fixture(t,db);
  const r=await app.inject({method:'POST',url:'/v1/external/catalog/products/upsert',headers:auth,payload:item()});
  assert.equal(r.statusCode,200,r.body);
  assert.equal(r.json().created,true);
  assert.equal(db.mappings.get('ERP-P1'),r.json().productId);
  assert.equal(db.products.get(r.json().productId)?.status,'PUBLISHED');
  assert.ok(db.queries.some(q=>q.sql.includes('INSERT INTO product_variants')&&q.args[6]==='4006381333931'));
  assert.ok(db.queries.some(q=>q.sql.includes("set_config('f40.integration_id'")));
  assert.ok(db.queries.some(q=>q.sql.includes('COMMIT')));
  assert.ok(db.queries.every(q=>!q.sql.includes('INSERT INTO inventory_movements')));
  assert.ok(db.queries.filter(q=>q.sql.includes('INSERT INTO product_variants')).every(q=>q.sql.includes('0,0')));
});

test('replay idempotente nao repete gravações; evento alterado e versao antiga sao recusados',async t=>{
  const db=dbStub(); const app=await fixture(t,db);const product=item();
  const send=(p:object)=>app.inject({method:'POST',url:'/v1/external/catalog/products/upsert',headers:auth,payload:p});
  assert.equal((await send(product)).statusCode,200);
  const n=db.queries.filter(q=>q.sql.includes('INSERT INTO product_variants')).length;
  const replay=await send(product);
  assert.equal(replay.statusCode,200,replay.body);
  assert.equal(replay.json().idempotent,true);
  assert.equal(db.queries.filter(q=>q.sql.includes('INSERT INTO product_variants')).length,n);
  const changed=await send({...product,name:'Outro nome'});
  assert.equal(changed.statusCode,409,changed.body);
  const stale=await send({...product,eventId:randomUUID()});
  assert.equal(stale.statusCode,409,stale.body);
});

test('catálogo sem autoridade de escrita retorna 403',async t=>{
  const db=dbStub();const app=await fixture(t,db,['catalog.read']);
  const res=await app.inject({method:'POST',url:'/v1/external/catalog/products/upsert',headers:auth,payload:item()});
  assert.equal(res.statusCode,403,res.body);
  assert.ok(!db.queries.some(q=>q.sql.includes('INSERT INTO products')));
});

test('produto nao pode ser publicado sem imagem e lote e revertido por inteiro',async t=>{
  const db=dbStub();const app=await fixture(t,db);
  const good=item({status:'DRAFT'});const bad=item({eventId:randomUUID(),externalProductId:'ERP-P2',status:'PUBLISHED',images:[],variants:[{externalVariantId:'V2',sku:'CAM-02',priceCents:'1000'}]});
  const res=await app.inject({method:'POST',url:'/v1/external/catalog/batch',headers:auth,payload:{products:[good,bad]}});
  assert.equal(res.statusCode,409,res.body);
  assert.ok(db.queries.some(q=>q.sql.includes('ROLLBACK')));
  assert.ok(!db.queries.some(q=>q.sql.includes('COMMIT')));
});

test('categoria inexistente nao pode ser usada na importacao',async t=>{
  const db=dbStub();db.failCategory(categoryId);const app=await fixture(t,db);
  const res=await app.inject({method:'POST',url:'/v1/external/catalog/products/upsert',headers:auth,payload:item()});
  assert.equal(res.statusCode,409,res.body);
  assert.ok(db.queries.some(q=>q.sql.includes('ROLLBACK')));
});

test('GET categorias obedece ao tenant do token',async t=>{
  const db=dbStub();const app=await fixture(t,db);
  const res=await app.inject({method:'GET',url:'/v1/external/catalog/categories',headers:auth});
  assert.equal(res.statusCode,200,res.body);
  assert.ok(db.queries.some(q=>q.sql.includes('FROM categories')&&q.args[0]===storeId));
});

test('rejeita request JSON invalido antes de abrir transacao',async t=>{
  const db=dbStub();const app=await fixture(t,db);
  const res=await app.inject({method:'POST',url:'/v1/external/catalog/products/upsert',headers:auth,payload:{...item(),variants:[]}});
  assert.equal(res.statusCode,400,res.body);
  assert.ok(!db.queries.some(q=>q.sql.includes('BEGIN')));
});


test('atualiza variantes mapeadas, sem tocar on_hand/reserved e permite limpar GTIN',async t=>{
  const db=dbStub();const app=await fixture(t,db);
  const initial=item();
  const url='/v1/external/catalog/products/upsert';
  const post=(payload:object)=>app.inject({method:'POST',url,headers:auth,payload});
  const first=await post(initial);
  assert.equal(first.statusCode,200,first.body);
  const id=db.externalVariants.get('V1');assert.ok(id);
  assert.equal(db.variants.get(id)?.gtin,'4006381333931');
  const updated=await post({...initial,eventId:randomUUID(),sourceVersion:2,
    variants:[{externalVariantId:'V1',sku:'CAM-01',color:'Preto',size:'M',gtin:null,priceCents:'6990'}]});
  assert.equal(updated.statusCode,200,updated.body);
  assert.equal(updated.json().created,false);
  assert.equal(db.variants.get(id)?.gtin,null);
  const q=db.queries.find(q=>q.sql.startsWith('UPDATE product_variants SET'));
  assert.ok(q);
  assert.equal(q.args[3],6990);
  assert.ok(!/SET[^;]*(?:on_hand|reserved)\s*=/.test(q.sql));
});

test('nao desativa variantes com reservas de pedidos pendentes',async t=>{
  const db=dbStub();db.setReserved(2);const app=await fixture(t,db);
  const initial=item();const url='/v1/external/catalog/products/upsert';
  const post=(payload:object)=>app.inject({method:'POST',url,headers:auth,payload});
  assert.equal((await post(initial)).statusCode,200);
  const updated=await post({...initial,eventId:randomUUID(),sourceVersion:2,
    variants:[{externalVariantId:'V1',sku:'CAM-01',status:'INACTIVE',priceCents:5990}]});
  assert.equal(updated.statusCode,409,updated.body);
  assert.equal(db.queries.some(q=>q.sql.includes('ROLLBACK')),true);
});
