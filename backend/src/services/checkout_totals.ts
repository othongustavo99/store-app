import { ApiError } from '../security/errors.js';

export type CheckoutLine = { product_name: string; quantity: number; unit_price_cents: string };
export type CheckoutTotals = { subtotalCents: string; discountCents: string; shippingCents: string; totalCents: string };
export type GatewayItem = { title: string; description?: string; quantity: number; unit_price: number; currency_id: 'BRL' };

function cents(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new ApiError(409, 'Valores do pedido inconsistentes. Contate a loja.');
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new ApiError(409, 'Valor do pedido acima do permitido.');
  return parsed;
}

/** Aritmética inteira até o último passo. A soma cobrada deve ser igual ao pedido. */
export function buildCheckoutItems(lines: readonly CheckoutLine[], totals: CheckoutTotals): GatewayItem[] {
  if (!lines.length) throw new ApiError(409, 'Pedido sem itens para pagamento.');
  const amounts = lines.map(line => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) throw new ApiError(409, 'Quantidade inválida no pedido.');
    const unit = cents(line.unit_price_cents);
    if (unit < 1n) throw new ApiError(409, 'Preço inválido no pedido.');
    return unit * BigInt(line.quantity);
  });
  const subtotal = amounts.reduce((sum, amount) => sum + amount, 0n);
  const discount = cents(totals.discountCents);
  const shipping = cents(totals.shippingCents);
  const total = cents(totals.totalCents);
  if (subtotal !== cents(totals.subtotalCents) || discount >= subtotal || total !== subtotal - discount + shipping || total < 1n) {
    throw new ApiError(409, 'Totais do pedido inconsistentes. Contate a loja antes de pagar.');
  }

  // Rateio proporcional por linha; os maiores restos recebem os centavos restantes.
  const allocated = amounts.map(amount => discount * amount / subtotal);
  let rest = discount - allocated.reduce((sum, amount) => sum + amount, 0n);
  const priority = amounts.map((amount, index) => ({ index, rest: discount * amount % subtotal }))
    .sort((a, b) => a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1);
  for (const { index } of priority) {
    if (rest === 0n) break;
    allocated[index] += 1n;
    rest -= 1n;
  }
  const net = amounts.map((amount, index) => amount - allocated[index]);
  const items: GatewayItem[] = [];
  if (net.some((amount, index) => amount < BigInt(lines[index].quantity))) {
    // Desconto extremo: unidades a zero não são enviadas ao gateway.
    // O detalhamento das peças permanece no pedido; a cobrança agrega os produtos.
    items.push({ title: 'Produtos do pedido com desconto',
      description: lines.map(line => `${line.quantity}x ${line.product_name}`).join('; ').slice(0, 1000),
      quantity: 1, unit_price: Number(subtotal - discount) / 100, currency_id: 'BRL' });
  } else {
    lines.forEach((line, index) => {
      const quantity = BigInt(line.quantity);
      const unit = net[index] / quantity;
      const remainder = Number(net[index] % quantity);
      // Divide uma linha em no máximo dois preços para preservar cada centavo.
      if (line.quantity > remainder) items.push({ title: line.product_name,
        quantity: line.quantity - remainder, unit_price: Number(unit) / 100, currency_id: 'BRL' });
      if (remainder) items.push({ title: line.product_name,
        quantity: remainder, unit_price: Number(unit + 1n) / 100, currency_id: 'BRL' });
    });
  }
  if (shipping > 0n) items.push({ title: 'Frete', quantity: 1, unit_price: Number(shipping) / 100, currency_id: 'BRL' });
  if (gatewayItemsTotal(items) !== total) throw new ApiError(409, 'Não foi possível conferir o valor da cobrança.');
  return items;
}

function gatewayItemsTotal(value: unknown): bigint | null {
  if (!Array.isArray(value) || !value.length) return null;
  let total = 0n;
  for (const item of value) {
    if (!item || typeof item !== 'object' || item.currency_id !== 'BRL' ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1) return null;
    const price = String(item.unit_price);
    if (!/^\d+(?:\.\d{1,2}0*)?$/.test(price)) return null;
    const [whole, fraction = ''] = price.split('.');
    const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
    if (amount < 1n) return null;
    total += amount * BigInt(item.quantity);
  }
  return total;
}

export function preferenceMatchesOrder(preference: Record<string, unknown>, orderId: string, totalCents: string): boolean {
  return preference.external_reference === orderId && gatewayItemsTotal(preference.items) === cents(totalCents);
}
