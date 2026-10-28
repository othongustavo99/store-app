import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { cartFingerprint, decimalCents, normalizeShippingRates, quotePayload } from '../services/shipping_rules.js';
const item={variantId:'bb',quantity:1,unitCents:'1999',weightKg:0.2,widthCm:11,heightCm:12,lengthCm:15};
test('cotação não usa preço arbitrário nem taxas inválidas',()=>{
  const result=normalizeShippingRates([
    {id:1,name:'PAC',company:{name:'Correios'},custom_price:'18.90',custom_delivery_time:5},
    {id:2,name:'INVALID',company:{name:'X'},error:'undeliverable',price:'1.00'},
    {id:3,name:'invalid',company:{name:'X'},price:'-1.00',delivery_time:0},
  ]);
  assert.deepEqual(result,[{id:'1',name:'PAC',carrier:'Correios',priceCents:1890,deliveryDays:5}]);
  assert.equal(decimalCents('1.999'),null);
  assert.equal(decimalCents('0'),null);
});
test('assinatura de carrinho muda com peso, preço, endereço e quantidade',()=>{
  const base=cartFingerprint('01001000','02002000',[item]);
  assert.equal(base,cartFingerprint('01001000','02002000',[item]));
  assert.notEqual(base,cartFingerprint('01001000','02002000',[{...item,quantity:2}]));
  assert.notEqual(base,cartFingerprint('01001000','02002000',[{...item,weightKg:0.3}]));
  assert.notEqual(base,cartFingerprint('01001000','02002000',[{...item,unitCents:'2000'}]));
  assert.notEqual(base,cartFingerprint('01001000','03003000',[item]));
});
test('payload exige dados físicos reais e cep',()=>{
  const request=quotePayload('01001000','02002000',[item]);
  assert.equal(request.products[0].insurance_value,19.99);
  assert.equal(request.products[0].weight,0.2);
  assert.equal(request.from.postal_code,'01001000');
});
