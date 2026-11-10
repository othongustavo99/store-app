import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { removeCategory, withCategoryTransaction } from '../services/catalog_categories.js';

type SampleProduct = {
  code: string;
  name: string;
  description: string;
  price: number;
  color: string;
  sizes: string[];
};

const apparelSizes = ['P', 'M', 'G'];
const pantsSizes = ['38', '40', '42'];
const collection: {
  name: string;
  icon: string;
  palette: string;
  products: SampleProduct[];
}[] = [
  {
    name: 'Camisas', icon: '👔', palette: 'E4EBF0/2C4252',
    products: [
      {code: 'oxford', name: 'Camisa Oxford Azul', description: 'Algodão com gola de botões e corte reto.',
        price: 14990, color: 'Azul-claro', sizes: apparelSizes},
      {code: 'linho', name: 'Camisa de Linho Areia', description: 'Tecido leve e punhos ajustáveis.',
        price: 18990, color: 'Areia', sizes: apparelSizes},
    ],
  },
  {
    name: 'Calças', icon: '👖', palette: 'DFE4EE/29364C',
    products: [
      {code: 'jeans', name: 'Calça Jeans Reta', description: 'Jeans escuro de cintura média e cinco bolsos.',
        price: 16990, color: 'Índigo', sizes: pantsSizes},
      {code: 'sarja', name: 'Calça de Sarja Oliva', description: 'Sarja macia com modelagem afunilada.',
        price: 15990, color: 'Verde-oliva', sizes: pantsSizes},
    ],
  },
  {
    name: 'Vestidos', icon: '👗', palette: 'F3E5E3/653C43',
    products: [
      {code: 'midi', name: 'Vestido Midi Terracota', description: 'Saia fluida com cintura marcada e alças reguláveis.',
        price: 17990, color: 'Terracota', sizes: apparelSizes},
      {code: 'envelope', name: 'Vestido Envelope Floral', description: 'Viscose estampada com amarração lateral.',
        price: 19990, color: 'Floral marfim', sizes: apparelSizes},
    ],
  },
  {
    name: 'Fitness', icon: '🏃', palette: 'E3EBE2/355344',
    products: [
      {code: 'legging', name: 'Legging Cintura Alta', description: 'Malha elástica com cós largo e bolso lateral.',
        price: 11990, color: 'Preto', sizes: apparelSizes},
      {code: 'top', name: 'Top Esportivo Violeta', description: 'Top de média sustentação com costas nadador.',
        price: 7990, color: 'Violeta', sizes: apparelSizes},
    ],
  },
  {
    name: 'Acessórios', icon: '👜', palette: 'F0E9DC/5D4530',
    products: [
      {code: 'bolsa', name: 'Bolsa Tiracolo Caramelo', description: 'Bolsa compacta com alça ajustável.',
        price: 13990, color: 'Caramelo', sizes: ['Único']},
      {code: 'bone', name: 'Boné de Sarja Natural', description: 'Aba curva e fecho regulável.',
        price: 5990, color: 'Cru', sizes: ['Único']},
    ],
  },
];

async function seed(client: PoolClient, storeId: string, isDemo: boolean) {
  const status = isDemo ? 'PUBLISHED' : 'DRAFT';
  const stock = isDemo ? 12 : 0;
  const slugs = collection.flatMap((category) => category.products.map((p) => `amostra-${p.code}`));
  const existing = await client.query<{ slug: string }>(
    'SELECT slug FROM products WHERE store_id=$1 AND slug=ANY($2::text[])', [storeId, slugs]);
  const registered = new Set(existing.rows.map((row) => row.slug));
  let inserted = 0;

  for (const category of collection) {
    const pending = category.products.filter((p) => !registered.has(`amostra-${p.code}`));
    if (!pending.length) continue;

    const result = await client.query<{ id: string }>(`SELECT id FROM categories
      WHERE store_id=$1 AND status='ACTIVE' AND lower(btrim(name))=lower($2)
      ORDER BY created_at,id LIMIT 1 FOR SHARE`, [storeId, category.name]);
    const categoryId = result.rows[0]?.id ?? randomUUID();
    if (!result.rowCount) {
      await client.query(`INSERT INTO categories (id,store_id,name,slug,icon)
        VALUES ($1,$2,$3,$4,$5)`, [categoryId, storeId, category.name, categoryId, category.icon]);
    }

    for (const product of pending) {
      const id = randomUUID();
      const slug = `amostra-${product.code}`;
      const image = `https://placehold.co/600x800/${category.palette}.png?text=${encodeURIComponent(product.name)}`;
      const featured = product === category.products[0];
      await client.query(`INSERT INTO products
        (id,store_id,category_id,name,slug,description,status,images,is_featured,is_new)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,true)`,
        [id, storeId, categoryId, product.name, slug, `${product.description} Produto fictício de demonstração.`,
          status, JSON.stringify([image]), featured]);
      for (const [index, size] of product.sizes.entries()) {
        const variantId = randomUUID();
        const sku = `AMOSTRA-${product.code.toUpperCase()}-${index + 1}`;
        await client.query(`INSERT INTO product_variants
          (id,store_id,product_id,sku,attributes,price_cents,on_hand)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
          [variantId, storeId, id, sku, JSON.stringify({ color: product.color, size }), product.price, stock]);
        if (stock > 0) {
          await client.query(`INSERT INTO inventory_movements (store_id,variant_id,kind,quantity_delta,notes)
            VALUES ($1,$2,'RECEIPT',$3,'Estoque inicial de demonstração')`, [storeId, variantId, stock]);
        }
      }
      inserted++;
    }
  }
  return `${inserted} produto(s) adicionado(s). Estado dos novos produtos: ${isDemo ? 'Publicado' : 'Rascunho'}.`;
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((arg) => arg.startsWith('--slug='))?.slice(7) ?? '';
  const action = args.find((arg) => arg === '--seed' || arg === '--remove-camisetas');
  if (args.length !== 2 || !action || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length < 3 || slug.length > 48) {
    throw new Error('Use --slug=nome-da-loja e uma opção: --seed ou --remove-camisetas.');
  }
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM stores WHERE slug=$1 AND status='ACTIVE'", [slug]);
  if (!result.rowCount) throw new Error('Loja ativa não encontrada para o slug informado.');
  const storeId = result.rows[0].id;

  const message = await withCategoryTransaction(storeId, async (client) => {
    const store = await client.query<{ is_demo: boolean }>(
      "SELECT is_demo FROM stores WHERE id=$1 AND slug=$2 AND status='ACTIVE' FOR SHARE", [storeId, slug]);
    if (!store.rowCount) throw new Error('A loja selecionada não está mais ativa.');
    if (action === '--seed') return seed(client, storeId, store.rows[0].is_demo);

    const matches = await client.query<{ id: string }>(`SELECT id FROM categories
      WHERE store_id=$1 AND status='ACTIVE' AND btrim(name) COLLATE "C"='camisetas'`, [storeId]);
    if (!matches.rowCount) return 'Nenhuma categoria ativa com o nome exato “camisetas”.';
    if (matches.rows.length > 1) throw new Error('Mais de uma categoria “camisetas”. Use o painel para escolher qual remover.');
    await removeCategory(client, storeId, matches.rows[0].id, null);
    return 'Categoria “camisetas” removida da vitrine.';
  });
  console.log(`[${slug}] ${message}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => pool.end());
