// F5.5 | Omie orders. Tax fields are per-client configuration (never inferred).
import {fail,positive,safeMoney,uuid} from '../shared/safe_order_export.mjs';
const validDate=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export const omieOrderAdapter={
  id:'omie',
  plan(data,settings,contactId){
    if(!positive(contactId))fail('OMIE_CLIENT_MAPPING_REQUIRED');
    if(!validDate(settings.expectedDate))fail('OMIE_DATE_REQUIRED');
    if(typeof settings.etapa!=='string'||!/^\d{2}$/.test(settings.etapa)||
      typeof settings.codigoCategoria!=='string'||!/^\d{1,3}\.\d{2}\.\d{2}$/.test(settings.codigoCategoria)||
      !positive(settings.codigoContaCorrente))fail('OMIE_FINANCIAL_CONFIG_REQUIRED');
    const det=data.lines.map((line,index)=>{
      const cfg=settings.items?.[line.variantId];
      if(!cfg||!uuid(line.variantId)||typeof cfg.descricao!=='string'||cfg.descricao.trim().length<2||cfg.descricao.length>200||
        typeof cfg.unidade!=='string'||! /^[A-Z]{2,6}$/.test(cfg.unidade)||
        typeof cfg.cfop!=='string'|| !/^\d\.\d{3}$/.test(cfg.cfop)||
        typeof cfg.ncm!=='string'|| !/^\d{4}\.\d{2}\.\d{2}$/.test(cfg.ncm))fail('OMIE_ITEM_TAX_CONFIG_REQUIRED');
      return {ide:{codigo_item_integracao:`${index+1}`},produto:{
        codigo_produto:String(line.productId),descricao:cfg.descricao,unidade:cfg.unidade,cfop:cfg.cfop,ncm:cfg.ncm,
        quantidade:line.qty,valor_unitario:safeMoney(line.price),tipo_desconto:'V',valor_desconto:0}};
    });
    const [year,month,day]=settings.expectedDate.split('-');
    const body={cabecalho:{codigo_cliente:contactId,codigo_pedido_integracao:data.reference,
      data_previsao:`${day}/${month}/${year}`,etapa:settings.etapa,quantidade_itens:det.length},
      det,frete:{modalidade:'9'},
      informacoes_adicionais:{codigo_categoria:settings.codigoCategoria,codigo_conta_corrente:settings.codigoContaCorrente,
        consumidor_final:'S',enviar_email:'N',observacao:`Pedido Store App ${data.id}. Pagamento confirmado na origem. Conferir financeiro, estoque e fiscal.`}};
    return {body,totalCents:data.totalCents};
  },
  verify(remote,reference,id){
    const r=Array.isArray(remote?.pedido_venda_produto)?remote.pedido_venda_produto[0]:remote?.pedido_venda_produto??remote;
    const cab=r?.cabecalho;
    if(!positive(id)||Number(cab?.codigo_pedido??r?.codigo_pedido)!==id||cab?.codigo_pedido_integracao!==reference)
      fail('OMIE_ORDER_IDENTITY_MISMATCH');
    return true;
  }
};
