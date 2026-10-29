import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductInput, productMetadataInput } from '../services/catalog_management.js';

const base = {
  name: 'Camisa Básica', description: 'Camiseta com grade',
  sizeGuide: 'M: busto 98 cm, comprimento 65 cm',
  categoryId: '00000000-0000-4000-8000-000000000001',
  priceCents: 8000, oldPriceCents: 10000,
  images: ['https://example.com/camisa.webp'], videos: [],
  isFeatured: false, isNew: true, status: 'PUBLISHED' as const,
};

test('P2: aceita grade de variantes de roupas sem repetir SKU', () => {
  const variants = ['P', 'M', 'G', 'GG'].flatMap(size => ['Preto', 'Branco'].map((color, i) => ({
    sku: `CAMISA-${size}-${i}`, color, size, initialStock: 5,
  })));
  const parsed = createProductInput.parse({...base, variants});
  assert.equal(parsed.variants.length, 8);
  assert.equal(parsed.sizeGuide, base.sizeGuide);
});

test('P2: rejeita cor/tamanho repetidos e SKU repetido', () => {
  const same = {sku:'CAMISA-P1', color:'Preto', size:'P', initialStock: 1};
  assert.equal(createProductInput.safeParse({...base, variants:[same, same]}).success, false);
});

test('P2: tamanho do guia é limitado na API', () => {
  assert.equal(productMetadataInput.safeParse({...base, sizeGuide: 'x'.repeat(3001)}).success, false);
});
