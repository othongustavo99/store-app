import { z } from 'zod';
import { storeProfileInput } from './store_profile.js';
import { fulfillmentInput } from './local_fulfillment.js';

const https = z.string().url().refine(value => {
  try {
    const uri = new URL(value);
    return uri.protocol === 'https:' && !uri.username && !uri.password && !uri.search && !uri.hash;
  } catch { return false; }
}, 'Use uma URL HTTPS sem credenciais, consulta ou fragmento.');
const media = z.union([z.literal(''),z.string().url().max(2048).startsWith('https://')]).default('');
export const clientConfigurationInput = z.object({
  schemaVersion:z.literal(1),
  store:z.object({id:z.string().uuid().transform(v=>v.toLowerCase()).optional(),name:z.string().trim().min(2).max(100),
    slug:z.string().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    mode:z.enum(['DEMO','LIVE']),ownerEmail:z.string().trim().email().max(254).transform(v=>v.toLowerCase())}).strict(),
  app:z.object({apiBaseUrl:https,applicationId:z.string().max(160).regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){1,}$/),
    displayName:z.string().trim().min(2).max(60).regex(/^[^\u0000-\u001f\u007f]+$/),environment:z.enum(['demo','homologacao','producao']),
    pushEnabled:z.boolean().default(false),publicStorefrontUrl:z.union([z.literal(''),https]).default('')}).strict(),
  brand:z.object({tagline:z.string().max(140).default(''),description:z.string().max(1200).default(''),
    logoUrl:media,bannerUrl:media,primaryColor:z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#145B55'),
    secondaryColor:z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#E9BB76'),
    supportEmail:z.union([z.literal(''),z.string().email()]).default(''),
    supportPhone:z.union([z.literal(''),z.string().regex(/^\d{10,15}$/)]).default(''),
    instagramUrl:media,privacyUrl:media,termsUrl:media,returnsUrl:media,
    offlineMethods:z.array(z.enum(['PAY_ON_PICKUP','MANUAL_PIX','WHATSAPP'])).max(3).default([]),
  }).strict().default({}),
  fulfillment:fulfillmentInput.default({pickupAddress:'',pickupHours:'',localEnabled:false,
    localFeeCents:0,localEstimate:'',localPostalRanges:[]}),
}).strict().superRefine((value,ctx)=>{
  if ((value.store.mode==='DEMO') !== (value.app.environment==='demo'))
    ctx.addIssue({code:'custom',path:['app','environment'],message:'DEMO exige ambiente demo; LIVE exige homologacao ou producao.'});
  if(value.store.mode==='DEMO'&&(value.brand.offlineMethods.length>0||value.fulfillment.localEnabled))
    ctx.addIssue({code:'custom',message:'Demonstração usa pagamentos simulados e retirada.'});
  const suffix=value.app.applicationId.split('.').at(-1);
  if((value.app.environment==='demo'&&suffix!=='demo')||
      (value.app.environment==='homologacao'&&!['hml','homologacao'].includes(suffix!))||
      (value.app.environment==='producao'&&['demo','hml','homologacao'].includes(suffix!)))
    ctx.addIssue({code:'custom',path:['app','applicationId'],message:'Separe os identificadores: .demo para demo, .hml para homologação e ID próprio sem esses sufixos para produção.'});
});
export type ClientConfiguration = z.infer<typeof clientConfigurationInput>;
export function profileForClient(config:ClientConfiguration) {
  return storeProfileInput.parse({expectedVersion:1,displayName:config.store.name,...config.brand});
}
export function clientArtifacts(config:ClientConfiguration) {
  if(!config.store.id)throw new Error('Informe store.id com o UUID da loja ou use o arquivo resolvido pelo provisionamento.');
  const label=config.app.displayName;
  const defines:Record<string,string>={
    LOJA_BACKEND:'railway',LOJA_API_BASE_URL:config.app.apiBaseUrl.replace(/\/$/,''),
    LOJA_STORE_SLUG:config.store.slug,LOJA_APP_NAME:label,
    LOJA_EXPECTED_STORE_ID:config.store.id,LOJA_EXPECTED_STORE_MODE:config.store.mode,
    LOJA_ENVIRONMENT:config.app.environment,LOJA_PUSH_ENABLED:String(config.app.pushEnabled),
    ...(config.app.publicStorefrontUrl?{LOJA_PUBLIC_STOREFRONT_URL:config.app.publicStorefrontUrl}:{}),
  };
  return {defines,android:{applicationId:config.app.applicationId,displayName:label,
    useFirebase:config.app.pushEnabled,requireReleaseSigning:config.app.environment==='producao'},
    store:{id:config.store.id,slug:config.store.slug,mode:config.store.mode,environment:config.app.environment}};
}
