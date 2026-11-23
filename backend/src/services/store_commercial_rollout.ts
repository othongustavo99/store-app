import {z} from 'zod';

const paymentProvider=z.enum(['NONE','MERCADOPAGO','OTHER']);
const carrierProvider=z.enum(['NONE','MELHOR_ENVIO','OTHER']);
const stage=z.enum(['NOT_PLANNED','PLANNED','CREDENTIALS_PENDING','HOMOLOGATION_PENDING']);
const refundStage=z.enum(['NOT_PLANNED','PLANNED']);
const environment=z.enum(['SANDBOX','PRODUCTION']);

// Nada de texto livre, CPF, OAuth, senha ou tokens no plano comercial.
export const commercialPlanInput=z.object({
  expectedRevision:z.number().int().min(0).max(2147483646),
  paymentProvider, paymentStage:stage, paymentEnvironment:environment,
  refundStage,
  carrierProvider, carrierStage:stage, carrierEnvironment:environment,
}).strict().superRefine((v,ctx)=>{
  const issue=(path:string,message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,path:[path],message});
  if((v.paymentProvider==='NONE') !== (v.paymentStage==='NOT_PLANNED')) issue('paymentStage','Plano de pagamentos inconsistente.');
  if((v.carrierProvider==='NONE') !== (v.carrierStage==='NOT_PLANNED')) issue('carrierStage','Plano de frete inconsistente.');
  if(v.refundStage==='PLANNED' && v.paymentProvider!=='MERCADOPAGO') issue('refundStage','Estorno exige planejamento do Mercado Pago.');
});
export type CommercialPlanInput=z.infer<typeof commercialPlanInput>;
export type CommercialRow={
  payment_provider:string;payment_stage:string;payment_environment:string;refund_stage:string;
  carrier_provider:string;carrier_stage:string;carrier_environment:string;
  revision:number;updated_at:Date|null;
};
export type LegacyCapabilities={paymentPilot:boolean;carrierPilot:boolean;refundPilot:boolean};

export const emptyCommercialPlan:Omit<CommercialPlanInput,'expectedRevision'>={
  paymentProvider:'NONE',paymentStage:'NOT_PLANNED',paymentEnvironment:'SANDBOX',refundStage:'NOT_PLANNED',
  carrierProvider:'NONE',carrierStage:'NOT_PLANNED',carrierEnvironment:'SANDBOX',
};

export function commercialPlanView(row?:CommercialRow,legacy:LegacyCapabilities={paymentPilot:false,carrierPilot:false,refundPilot:false}){
  const plan=row?{
    paymentProvider:row.payment_provider,paymentStage:row.payment_stage,paymentEnvironment:row.payment_environment,
    refundStage:row.refund_stage,carrierProvider:row.carrier_provider,carrierStage:row.carrier_stage,
    carrierEnvironment:row.carrier_environment,
  }:emptyCommercialPlan;
  const pending:string[]=[];
  if(plan.paymentProvider==='NONE')pending.push('Definir se a loja utilizará pagamento online.');
  else {
    if(plan.paymentProvider==='OTHER') pending.push('Pagamento de outro fornecedor exige adaptador específico.');
    if(plan.paymentStage!=='HOMOLOGATION_PENDING')pending.push('Concluir preparação de credenciais e avançar até homologação de pagamentos.');
    pending.push('Validar credenciais e webhooks isolados por loja; sem homologação automática.');
  }
  if(plan.carrierProvider==='NONE')pending.push('Definir se a loja utilizará frete por transportadora.');
  else {
    if(plan.carrierProvider==='OTHER')pending.push('Transportadora de outro fornecedor exige adaptador específico.');
    if(plan.carrierStage!=='HOMOLOGATION_PENDING')pending.push('Concluir preparação de credenciais e avançar até homologação de frete.');
    pending.push('Validar token de frete por loja, ambiente e cotação com fornecedor real.');
  }
  if(plan.refundStage==='PLANNED')pending.push('Estorno depende de autorização específica, token da loja e conciliação do gateway.');
  return {
    hasPlan:!!row,revision:Number(row?.revision??0),updatedAt:row?.updated_at??null,
    plan,legacyPilot:{...legacy},
    nextSteps:pending,
    activation:{paymentEnabledByPlan:false,carrierEnabledByPlan:false,refundEnabledByPlan:false,
      certified:false,automaticGoLive:false},
    note:'Plano declaratório por loja: não armazena credenciais e NÃO altera autorização real de checkout, frete ou estorno. Piloto legado continua isolado.',
  };
}
