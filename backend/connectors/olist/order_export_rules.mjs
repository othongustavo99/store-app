// Frequencia40 - exportacao assistida de pedidos. Sem dependencia externa.
// NAO autoriza emissao fiscal, cobranca ou movimentacao de estoque no ERP.
import { OlistConnectorError, validUuid, positiveId } from './clients.mjs';

const fail = code => {throw new OlistConnectorError(code);};
const integerCents = value => {
  if(typeof value!=='string'||!/^(0|[1-9]\d{0,10})$/.test(value))fail('ORDER_AMOUNT_INVALID');
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number>1000000000)fail('ORDER_AMOUNT_OUT_OF_RANGE');
  return number;
};
const money = cents => Number((cents/100).toFixed(2));

export function validateOrderExportSettings(value){
  if(!value || typeof value!=='object' || Array.isArray(value))fail('ORDER_SETTINGS_INVALID');
  if(!validUuid(value.storeId))fail('ORDER_STORE_ID_INVALID');
  if(!Array.isArray(value.orderIds)||!value.orderIds.length||value.orderIds.length>30||
    value.orderIds.some(id=>!validUuid(id))||new Set(value.orderIds).size!==value.orderIds.length)fail('ORDER_IDS_INVALID');
  if(!value.contactIds||typeof value.contactIds!=='object'||Array.isArray(value.contactIds)||
    Object.keys(value.contactIds).some(id=>!value.orderIds.includes(id)||!positiveId(value.contactIds[id])))
    fail('ORDER_CONTACTS_INVALID');
  return value;
}

export function prepareOrderExport(input,contactId) {
  const order=input?.order;
  if(!order || !validUuid(order.id))fail('ORDER_MISSING');
  if(order.isDemo!==false)fail('ORDER_DEMO_FORBIDDEN');
  if(!['PAID','PREPARING','SHIPPED','DELIVERED'].includes(order.status)||order.paymentStatus!=='APPROVED')
    fail('ORDER_NOT_CONFIRMED_PAID');
  if(order.fulfillmentMethod!=='PICKUP')fail('ORDER_DELIVERY_REQUIRES_MAPPING');
  if(!positiveId(contactId))fail('ORDER_CONTACT_MAPPING_REQUIRED');
  if(!Array.isArray(order.items)||order.items.length<1||order.items.length>100)fail('ORDER_ITEMS_INVALID');
  const seen=new Set();let subtotal=0;
  const itens=order.items.map(item=>{
    if(!validUuid(item.variantId)||seen.has(item.variantId))fail('ORDER_VARIANT_DUPLICATE_OR_INVALID');
    seen.add(item.variantId);
    const id=Number(item.externalVariantId);
    if(!/^[1-9]\d{0,15}$/.test(String(item.externalVariantId??''))||!positiveId(id))fail('ORDER_VARIANT_NOT_MAPPED');
    if(!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>100000)fail('ORDER_QUANTITY_INVALID');
    const amount=integerCents(item.unitPriceCents);
    if(amount<=0)fail('ORDER_UNIT_PRICE_INVALID');
    subtotal+=amount*item.quantity;
    if(!Number.isSafeInteger(subtotal)||subtotal>1000000000)fail('ORDER_SUBTOTAL_OUT_OF_RANGE');
    // O contrato oficial ItemPedidoRequestModel precisa de homologacao antes de uso comercial.
    return {produto:{id},quantidade:item.quantity,valorUnitario:money(amount)};
  });
  const declaredSubtotal=integerCents(order.subtotalCents);
  const shipping=integerCents(order.shippingCents);
  const discount=integerCents(order.discountCents);
  const total=integerCents(order.totalCents);
  if(subtotal!==declaredSubtotal||subtotal+shipping-discount!==total||total<=0)
    fail('ORDER_TOTALS_MISMATCH');
  return {
    orderId:order.id,
    reference:`F40-${order.id}`,
    body:{numeroOrdemCompra:`F40-${order.id}`,idContato:contactId,situacao:0,
      valorDesconto:money(discount),valorFrete:money(shipping),
      observacoesInternas:`Pedido do Store App Frequencia40 ${order.id}. Pagamento registrado na origem; conferir lancamentos financeiros e estoque antes de concluir no ERP.`,
      itens},
    totalCents:total,
  };
}

export function checkOlistOrderIdentity(remote,reference,expectedId){
  if(!positiveId(expectedId)||!remote||remote.id!==expectedId||remote.numeroOrdemCompra!==reference)
    fail('ERP_ORDER_IDENTITY_MISMATCH');
  return true;
}
