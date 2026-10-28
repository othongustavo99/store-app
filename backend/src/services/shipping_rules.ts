import { createHash } from 'node:crypto';

export type ParcelItem = {
  variantId: string; quantity: number; unitCents: string;
  weightKg: number; widthCm: number; heightCm: number; lengthCm: number;
};

export type ShippingService = {
  id: string; carrier: string; name: string; priceCents: number; deliveryDays: number;
};

export function cartFingerprint(origin: string, destination: string, items: ParcelItem[]): string {
  const content = items.map(i => [i.variantId,i.quantity,i.unitCents,i.weightKg,i.widthCm,i.heightCm,i.lengthCm])
    .sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  return createHash('sha256').update(JSON.stringify([origin,destination,content])).digest('hex');
}

export function decimalCents(value:unknown):number|null {
  const s=String(value??'');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(s)) return null;
  const [whole,frac=''] = s.split('.');
  const cents=Number(whole)*100+Number(frac.padEnd(2,'0'));
  return Number.isSafeInteger(cents)&&cents>0?cents:null;
}

export function normalizeShippingRates(response:unknown):ShippingService[] {
  if (!Array.isArray(response)) return [];
  const seen=new Set<string>();
  const rates:ShippingService[]=[];
  for (const candidate of response) {
    if (!candidate || typeof candidate!=='object') continue;
    const r=candidate as Record<string,unknown>;
    if (r.error || r.id==null) continue;
    const id=String(r.id);
    if (!/^\d{1,10}$/.test(id) || seen.has(id)) continue;
    const cost=decimalCents(r.custom_price ?? r.price);
    const days=Number(r.custom_delivery_time ?? r.delivery_time);
    if (cost==null || !Number.isInteger(days) || days<0 || days>120) continue;
    const company=(r.company && typeof r.company==='object')
      ? (r.company as Record<string,unknown>).name : '';
    const carrier=String(company??'').trim().slice(0,80);
    const name=String(r.name??'').trim().slice(0,80);
    if (!carrier || !name) continue;
    seen.add(id);
    rates.push({id,carrier,name,priceCents:cost,deliveryDays:days});
  }
  return rates.sort((a,b)=>a.priceCents-b.priceCents).slice(0,15);
}

export function quotePayload(origin:string,destination:string,items:ParcelItem[]) {
  return {
    from:{postal_code:origin},to:{postal_code:destination},
    products:items.map(i=>({id:i.variantId,quantity:i.quantity,
      width:i.widthCm,height:i.heightCm,length:i.lengthCm,weight:i.weightKg,
      insurance_value:Number(i.unitCents)/100})),
    options:{receipt:false,own_hand:false}
  };
}
