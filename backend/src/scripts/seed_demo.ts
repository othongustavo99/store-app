/**
 * Carga comercial P0: somente para uma loja vazia, explicitamente autorizada.
 * Uso: npm run demo:seed -- --slug=demo-minha-loja --enable-demo [--owner-email=...]
 * Não cria credenciais fixas, não efetua cobranças e nunca apaga dados.
 */
import 'dotenv/config';
import {randomUUID, randomBytes} from 'node:crypto';
import {pool} from '../db/pool.js';
import {hashPassword} from '../security/password.js';

const args=process.argv.slice(2);
const arg=(prefix:string)=>args.find(v=>v.startsWith(prefix))?.slice(prefix.length);
const slug=arg('--slug=')??'';
const ownerEmail=arg('--owner-email=')?.trim().toLowerCase();
const enable=args.includes('--enable-demo');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length<3 || slug.length>48 || !enable) {
  console.error('Informe --slug=nome-da-loja --enable-demo. A loja deve estar vazia.');
  process.exit(2);
}
if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
  console.error('E-mail de proprietário inválido.');process.exit(2);
}

const categories=[
  {slug:'feminino',name:'Moda feminina',icon:'👗'},
  {slug:'masculino',name:'Moda masculina',icon:'👔'},
  {slug:'casual',name:'Casual',icon:'👕'},
  {slug:'fitness',name:'Fitness',icon:'🏃'},
  {slug:'acessorios',name:'Acessórios',icon:'👜'},
];
// Dados fictícios e imagens tipográficas: sem direitos de foto de terceiros.
// Troque os placeholders por fotos licenciadas antes de mostrar a demo comercial.
const inventory: Array<[string,string,number,string]>=[
  ['feminino','Vestido midi fluido',15990,'P,M,G,GG'],
  ['feminino','Blusa canelada',7990,'P,M,G,GG'],
  ['feminino','Saia plissada',11990,'P,M,G,GG'],
  ['feminino','Calça alfaiataria',18990,'P,M,G,GG'],
  ['feminino','Cardigan leve',14990,'P,M,G,GG'],
  ['feminino','Vestido envelope',17990,'P,M,G,GG'],
  ['feminino','Camisa viscose',10990,'P,M,G,GG'],
  ['masculino','Camisa Oxford',14990,'P,M,G,GG'],
  ['masculino','Camiseta premium',8990,'P,M,G,GG'],
  ['masculino','Calça chino',17990,'38,40,42,44'],
  ['masculino','Bermuda sarja',12990,'38,40,42,44'],
  ['masculino','Polo clássica',10990,'P,M,G,GG'],
  ['masculino','Jaqueta casual',27990,'P,M,G,GG'],
  ['masculino','Camisa linho',19990,'P,M,G,GG'],
  ['casual','Moletom básico',15990,'P,M,G,GG'],
  ['casual','Camiseta estampada',8990,'P,M,G,GG'],
  ['casual','Calça jeans reta',17990,'38,40,42,44'],
  ['casual','Shorts denim',10990,'P,M,G,GG'],
  ['casual','Jaqueta jeans',24990,'P,M,G,GG'],
  ['casual','Vestido t-shirt',10990,'P,M,G,GG'],
  ['fitness','Legging compressão',13990,'P,M,G,GG'],
  ['fitness','Top esportivo',8990,'P,M,G,GG'],
  ['fitness','Camiseta dry-fit',7990,'P,M,G,GG'],
  ['fitness','Shorts treino',9990,'P,M,G,GG'],
  ['fitness','Bermuda performance',10990,'P,M,G,GG'],
  ['fitness','Cropped esportivo',8990,'P,M,G,GG'],
  ['acessorios','Bolsa tiracolo',18990,'Único'],
  ['acessorios','Cinto casual',6990,'P,M,G,GG'],
  ['acessorios','Boné minimalista',7990,'Único'],
  ['acessorios','Mochila urbana',23990,'Único'],
  ['acessorios','Carteira compacta',5990,'Único'],
  ['acessorios','Ecobag algodão',4990,'Único'],
];
const productSlug=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function placeholder(name:string,idx:number) {
  const palettes=[['F5EBE0','5A4335'],['F0F0F0','262A2D'],['E8EAE3','31483D'],['ECE3ED','553E5E'],['E8F1F4','315866']];
  const [bg,fg]=palettes[idx%palettes.length];
  return `https://placehold.co/600x800/${bg}/${fg}.png?text=${encodeURIComponent(name)}`;
}
async function main() {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Serializar seeds simultâneos; não alterar bancos com produtos comerciais.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`seed-demo:${slug}`]);
    let store=await client.query<{id:string;is_demo:boolean}>(
      'SELECT id,is_demo FROM stores WHERE slug=$1 FOR UPDATE',[slug]);
    let storeId:string;
    let created=false;
    if (!store.rowCount) {
      const inserted=await client.query<{id:string}>(
        "INSERT INTO stores(name,slug,is_demo) VALUES($1,$2,true) RETURNING id",
        ['Loja Demonstração',slug]);
      storeId=inserted.rows[0].id;
      created=true;
    } else {
      storeId=store.rows[0].id;
      if(!store.rows[0].is_demo)throw new Error('Esta loja não é de demonstração. Crie outro slug; o comando não converte lojas comerciais.');
      const count=await client.query<{products:string;orders:string}>(
        `SELECT (SELECT count(*)::text FROM products WHERE store_id=$1) AS products,
         (SELECT count(*)::text FROM orders WHERE store_id=$1) AS orders`,[storeId]);
      const products=Number(count.rows[0].products);
      const orders=Number(count.rows[0].orders);
      if(products>0 || orders>0){
        if(store.rows[0].is_demo && products>=inventory.length){
          console.log('Loja demo já possui catálogo. Nenhuma alteração foi aplicada.');
          await client.query('COMMIT');return;
        }
        throw new Error('Loja não vazia. Crie outra loja com slug próprio para demo; nenhum dado foi alterado.');
      }
    }
    if(ownerEmail){
      const owner=await client.query<{id:string}>('SELECT id FROM users WHERE email=$1 AND status=$2',
        [ownerEmail,'ACTIVE']);
      if(!owner.rowCount)throw new Error('Proprietário inexistente: cadastre o e-mail no app primeiro.');
      const members=await client.query<{role:string}>(
        'SELECT role FROM store_memberships WHERE store_id=$1',[storeId]);
      if(members.rows.length && !created)throw new Error('Loja já tem equipe. Vincule o proprietário manualmente.');
      await client.query(`INSERT INTO store_memberships(store_id,user_id,role)
        VALUES($1,$2,'OWNER') ON CONFLICT (store_id,user_id) DO NOTHING`,[storeId,owner.rows[0].id]);
    }
    await client.query(`INSERT INTO store_profiles(store_id,display_name,tagline,description,primary_color,banner_url)
      VALUES($1,'Vitrine Demonstração','Coleção criada para apresentar o aplicativo',
      'Loja fictícia — não realizamos vendas nem recebemos pagamentos.','#1C1B2F',$2)
      ON CONFLICT(store_id) DO NOTHING`,
      [storeId,'https://placehold.co/1200x400/1C1B2F/FFFFFF.png?text=Vitrine+Demonstra%C3%A7%C3%A3o']);
    const categoryIds=new Map<string,string>();
    for(const c of categories){
      const result=await client.query<{id:string}>(
        `INSERT INTO categories(store_id,name,slug,status,icon)
         VALUES($1,$2,$3,'ACTIVE',$4) RETURNING id`,[storeId,c.name,c.slug,c.icon]);
      categoryIds.set(c.slug,result.rows[0].id);
    }
    const products: Array<{id:string;name:string;variantId:string;price:number;stock:number;attributes:object;sku:string}>=[];
    for (const [index,[cat,name,price,sizes]] of inventory.entries()) {
      const images=JSON.stringify([placeholder(name,index)]);
      const row=await client.query<{id:string}>(`INSERT INTO products(store_id,category_id,name,slug,description,
        status,images,is_featured,is_new,old_price_cents)
        VALUES($1,$2,$3,$4,$5,'PUBLISHED',$6::jsonb,$7,$8,$9) RETURNING id`,
      [storeId,categoryIds.get(cat),name,`demo-${productSlug(name)}`,
        `Peça demonstrativa de ${cat}. Descrição e valores fictícios para teste.`,images,
        index%5===0,index%6===0,index%7===0?Math.round(price*1.2):null]);
      const id=row.rows[0].id;
      const colors=index%2===0?['Preto','Bege']:['Azul','Branco'];
      for(const [c,color] of colors.entries())for(const size of sizes.split(',')){
        const sku=`DEMO-${index+1}-${c+1}-${size.replace(/[^A-Za-z0-9]/g,'U')}`;
        const attributes={color,size,imageUrl:placeholder(name,index)};
        const result=await client.query<{id:string}>(`INSERT INTO product_variants
           (store_id,product_id,sku,attributes,price_cents,on_hand,status)
           VALUES($1,$2,$3,$4::jsonb,$5,18,'ACTIVE') RETURNING id`,
          [storeId,id,sku,JSON.stringify(attributes),price]);
        products.push({id,name,variantId:result.rows[0].id,price,stock:18,attributes,sku});
      }
    }
    // Compras de demonstração para dashboards e tela de pedidos. Conta sem senha conhecida.
    const email=`seed-${slug}@demo.invalid`;
    const passwordHash=await hashPassword(randomBytes(48).toString('base64url'));
    const user=await client.query<{id:string}>(
      'INSERT INTO users(email,display_name,password_hash) VALUES($1,$2,$3) RETURNING id',
      [email,'Cliente fictício',passwordHash]);
    const states=['PAID','PREPARING','SHIPPED','DELIVERED','DELIVERED','PAID'];
    for(const [index,status] of states.entries()){
      const v=products[(index*4)%products.length];
      const orderId=randomUUID();
      const qty=index%2+1;
      await client.query(`INSERT INTO orders(id,store_id,customer_id,idempotency_key,status,
        subtotal_cents,shipping_cents,total_cents,shipping_address,fulfillment_method,paid_at,is_demo)
        VALUES($1,$2,$3,$4,$5,$6,0,$6,$7::jsonb,'PICKUP',now(),true)`,
        [orderId,storeId,user.rows[0].id,randomUUID(),status,v.price*qty,
          JSON.stringify({name:'Cliente fictício',phone:'0000000000',fulfillment:'PICKUP',demoPaymentMethod:index%2?'CARD':'PIX'})]);
      await client.query(`INSERT INTO order_items(order_id,store_id,product_id,variant_id,product_name,
        sku_snapshot,variant_snapshot,quantity,unit_price_cents)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [orderId,storeId,v.id,v.variantId,v.name,v.sku,JSON.stringify(v.attributes),qty,v.price]);
      await client.query(`INSERT INTO payments(order_id,store_id,provider,amount_cents,status)
        VALUES($1,$2,'demo',$3,'APPROVED')`,[orderId,storeId,v.price*qty]);
      await client.query(`UPDATE product_variants SET on_hand=on_hand-$2,updated_at=now() WHERE id=$1`,
        [v.variantId,qty]);
      await client.query(`INSERT INTO inventory_movements(store_id,variant_id,performed_by,kind,quantity_delta,reference_id,notes)
        VALUES($1,$2,$3,'SALE',$4,$5,'Venda fictícia de catálogo')`,
        [storeId,v.variantId,user.rows[0].id,-qty,orderId]);
      await client.query(`INSERT INTO order_events(order_id,store_id,actor_id,status,notes)
        VALUES($1,$2,$3,'PAID','Pagamento simulado; nenhuma cobrança')`,
        [orderId,storeId,user.rows[0].id]);
      if(status!=='PAID')await client.query(`INSERT INTO order_events(order_id,store_id,status,notes)
        VALUES($1,$2,$3,'Etapa fictícia da demonstração')`,[orderId,storeId,status]);
    }
    await client.query('COMMIT');
    console.log(`Pronto. Loja: ${slug} (${storeId}), ${categories.length} categorias, ${inventory.length} produtos, ${states.length} pedidos. DEMO=true; nenhuma cobrança feita.`);
  } catch(e){
    await client.query('ROLLBACK');
    throw e;
  } finally{client.release();}
}
main().catch(e=>{console.error('Seed demo:',e instanceof Error?e.message:String(e));process.exitCode=1;})
  .finally(async()=>{await pool.end();});
