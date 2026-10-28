import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductInput, productMetadataInput, editVariantInput, signCloudinaryUpload } from '../services/catalog_management.js';
const valid = {
  name:'Camiseta Lisa',description:'Malha macia',categoryId:'f1add076-b3aa-4e19-a18d-9898ee3481bc',
  priceCents:4990,oldPriceCents:null,images:['https://example.org/camiseta.jpg'],videos:[],
  isFeatured:false,isNew:true,status:'PUBLISHED',
  variants:[{sku:'CAM-PT-M',color:'Preto',size:'M',initialStock:8}],
};
test('produto válido e mídia por HTTPS',()=>assert.equal(createProductInput.safeParse(valid).success,true));
test('não publicar sem foto',()=>assert.equal(createProductInput.safeParse({...valid,images:[]}).success,false));
test('rejeita SKU duplicado e variantes repetidas',()=>assert.equal(createProductInput.safeParse({...valid,variants:[valid.variants[0],valid.variants[0]]}).success,false));
test('metadados não aceitam estoque',()=>assert.equal(productMetadataInput.safeParse({...valid,variants:undefined,stock:100}).success,false));
test('metadata exige preço inteiro em centavos',()=>assert.equal(productMetadataInput.safeParse({...valid,variants:undefined,priceCents:1.9}).success,false));
test('variant editing rejeita quantidade',()=>assert.equal(editVariantInput.safeParse({sku:'A-01',color:'Azul',size:'P',status:'ACTIVE',imageUrl:null,initialStock:8}).success,false));
test('assinatura Cloudinary segue payload ordenado',()=>{
  assert.equal(signCloudinaryUpload('abcd','lojas/teste/produtos',1315060510).length,40);
  assert.equal(signCloudinaryUpload('abcd','lojas/teste/produtos',1315060510),signCloudinaryUpload('abcd','lojas/teste/produtos',1315060510));
});
