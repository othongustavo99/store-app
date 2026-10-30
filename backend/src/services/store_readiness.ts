import type { FulfillmentSettings } from './local_fulfillment.js';

type Inputs = {
  isDemo: boolean; publicDemoLogin: boolean; publishedProducts: number; availableVariants: number;
  missingParcels: number; originConfigured: boolean; members: number;
  profile: Record<string, unknown>; fulfillment: FulfillmentSettings;
  onlineConfigured: boolean; carrierConfigured: boolean; carrierSandbox: boolean;
};
export function storeReadiness(input: Inputs) {
  const p = input.profile;
  const offline = Array.isArray(p.offlineMethods) ? p.offlineMethods.map(String) : [];
  const contacts = Boolean(p.supportPhone || p.supportEmail);
  const localPayments = offline.includes('MANUAL_PIX') || offline.includes('WHATSAPP');
  const checkout = input.isDemo || input.onlineConfigured || offline.length > 0;
  const local = !input.isDemo && input.fulfillment.localEnabled &&
    input.fulfillment.localPostalRanges.length > 0 && Boolean(input.fulfillment.localEstimate) &&
    (input.onlineConfigured || localPayments);
  const carrier = !input.isDemo && input.onlineConfigured && input.carrierConfigured &&
    !input.carrierSandbox && input.originConfigured && input.missingParcels === 0 && input.publishedProducts > 0;
  const checks = {
    identity: Boolean(p.displayName && p.logoUrl), contacts,
    legal: Boolean(p.privacyUrl && p.termsUrl && p.returnsUrl),
    catalog: input.publishedProducts > 0 && input.availableVariants > 0,
    pickup: Boolean(input.fulfillment.pickupAddress && input.fulfillment.pickupHours),
    checkoutConfigured: checkout,
    shippingOrigin: input.originConfigured,
    shippingDimensions: input.publishedProducts > 0 && input.missingParcels === 0,
    shippingPilotConnected: input.carrierConfigured,
    paymentPilotCredentialsPresent: input.onlineConfigured,
    merchantPaymentsReady: !input.isDemo && input.onlineConfigured,
    localDeliveryConfigured: local,
    carrierDeliveryConfigured: carrier,
  };
  const steps = [
    {id:'identity',title:'Identidade da loja',done:checks.identity,description:'Nome e logotipo da própria marca.',route:'/admin/store-settings'},
    {id:'contacts',title:'Atendimento',done:contacts,description:'Telefone ou email para contato com a loja.',route:'/admin/store-settings'},
    {id:'catalog',title:'Catálogo disponível',done:checks.catalog,description:'Produto publicado com pelo menos uma variante em estoque.',route:'/admin/products'},
    {id:'pickup',title:'Retirada informada',done:checks.pickup,description:'Endereço e horário para buscar o pedido.',route:'/admin/shipping'},
    {id:'checkout',title:input.isDemo?'Compra simulada':'Forma de pagamento',done:checkout,
      description:input.isDemo?'Pedidos fictícios, sem cobrança.':'Pagamento local autorizado ou integração online configurada.',route:'/admin/store-settings'},
    {id:'legal',title:'Políticas da loja',done:checks.legal,description:'Links de privacidade, termos e trocas cadastrados.',route:'/admin/store-settings'},
  ];
  return {
    mode: input.isDemo ? 'DEMO' : 'LIVE',
    publishedProducts:input.publishedProducts,availableVariants:input.availableVariants,
    members:input.members,missingParcels:input.missingParcels,checks,steps,
    progress:{completed:steps.filter(s=>s.done).length,total:steps.length},
    channels:{pickup:checkout,localDelivery:local,carrierDelivery:carrier,
      onlinePayment:!input.isDemo&&input.onlineConfigured,offlinePayment:!input.isDemo&&offline.length>0,
      demoLogin:input.isDemo&&input.publicDemoLogin},
    notice:'Configuração cadastrada não confirma integração externa nem aprova a loja automaticamente. Teste o fluxo completo antes de distribuir.',
    limitations: input.isDemo ? [
      'Modo demonstração: pedidos e pagamentos são fictícios; entrega permanece restrita à retirada.',
      'Use outra loja e identificadores próprios para operação comercial.',
    ] : [
      'Pagamento combinado permanece pendente até a conferência do responsável.',
      'Pagamento online e transportadora continuam limitados às integrações autorizadas para esta loja.',
      'Links cadastrados e presença de credenciais não atestam conteúdo ou funcionamento externo.',
    ],
  };
}
