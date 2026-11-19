// F5.5 | Bling sales orders. Source data validated in shared/safe_order_export.mjs.
import {fail,positive,safeMoney} from '../shared/safe_order_export.mjs';

export const blingOrderAdapter={
  id:'bling',
  plan(data,settings,contactId){
    if(!positive(contactId))fail('BLING_CONTACT_MAPPING_REQUIRED');
    if(typeof settings.orderDate!=='string'||!/^\d{4}-\d\d-\d\d$/.test(settings.orderDate)||
      new Date(settings.orderDate+'T00:00:00Z').toISOString().slice(0,10)!==settings.orderDate)fail('BLING_DATE_REQUIRED');
    if(settings.storeChannelId!==undefined&&!positive(settings.storeChannelId))fail('BLING_CHANNEL_ID_INVALID');
    // Bling API v3: numeroLoja links a stable source identifier; no automatic financial/stock actions.
    return {body:{data:settings.orderDate,numeroLoja:data.reference,contato:{id:contactId},
      ...(settings.storeChannelId?{loja:{id:settings.storeChannelId}}:{}),
      observacoesInternas:`Pedido Store App ${data.id}; pagamento confirmado na origem. Conferir estoque, conciliacao e fiscal antes de faturar.`,
      itens:data.lines.map(line=>({produto:{id:line.productId},quantidade:line.qty,valor:safeMoney(line.price)}))},
      totalCents:data.totalCents};
  },
  verify(remote,reference,id){
    const r=remote?.data??remote;
    if(!positive(id)||Number(r?.id)!==id||r?.numeroLoja!==reference)fail('BLING_ORDER_IDENTITY_MISMATCH');
    return true;
  }
};
