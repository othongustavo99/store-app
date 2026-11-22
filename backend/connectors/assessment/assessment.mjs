// Frequência40 Store App - Fase 5.15. Auditoria offline e conservadora.
// Não acessa API, banco, tokens, CPF ou dados de compradores.
export const FLOW_KEYS = Object.freeze([
  'catalog_import', 'stock_import', 'order_export', 'order_status_read', 'fiscal_reference',
]);
export const EVIDENCE_KEYS = Object.freeze([
  'accessValidated', 'stableProductIds', 'stockAuthorityDefined',
  'customerDataAuthorization', 'sandboxAvailable', 'catalogSampleTested',
  'orderSampleTested', 'pilotReconciled',
]);
const EVIDENCE_VALUES = ['confirmed', 'unconfirmed', 'unsupported'];
const OPERATION_KEYS = [
  'variants', 'multipleWarehouses', 'fractionalStock', 'delivery',
  'discounts', 'splitPayments',
];
export const MATRIX = Object.freeze({
  bling: Object.freeze({
    label: 'Bling (conector inicial)', transport: 'connector',
    flows: ['catalog_import', 'stock_import', 'order_export', 'order_status_read'],
    note: 'Produtos simples; pedidos pagos de retirada, sem desconto e frete; status externo informativo. Exige homologação.',
  }),
  omie: Object.freeze({
    label: 'Omie (conector inicial)', transport: 'connector',
    flows: ['catalog_import', 'stock_import', 'order_export', 'order_status_read'],
    note: 'Produtos simples; pedidos pagos de retirada, sem desconto e frete; status externo informativo. Exige homologação.',
  }),
  olist: Object.freeze({
    label: 'Olist/Tiny (conector inicial)', transport: 'connector',
    flows: ['catalog_import', 'stock_import', 'order_export', 'order_status_read'],
    note: 'Produtos simples; pedidos pagos de retirada, sem desconto e frete; status externo informativo. Exige homologação.',
  }),
  csv: Object.freeze({
    label: 'CSV assistido', transport: 'csv',
    flows: ['catalog_import', 'stock_import'],
    note: 'CSV assistido: importa catálogo/estoque e agora gera arquivo de pedidos pagos para importação MANUAL; não envia pedidos nem confirma aceite do ERP.',
  }),
});

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value, allowed, name) {
  if (!isPlainRecord(value)) throw new Error(`${name}: OBJETO_OBRIGATORIO`);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`${name}: CAMPOS_NAO_PERMITIDOS`);
}
function enumValue(value, values, name) {
  if (!values.includes(value)) throw new Error(`${name}: VALOR_INVALIDO`);
}
export function validateProfile(p) {
  exactKeys(p, ['schemaVersion', 'storeAlias', 'provider', 'transport', 'requiredFlows',
    'vendorCapabilities', 'operation', 'evidence'], 'PERFIL');
  if (p.schemaVersion !== 1) throw new Error('PERFIL: VERSAO_INVALIDA');
  if (typeof p.storeAlias !== 'string' || !/^[a-z][a-z0-9_-]{2,39}$/.test(p.storeAlias)) {
    throw new Error('PERFIL: ALIAS_INVALIDO');
  }
  enumValue(p.provider, ['bling', 'omie', 'olist', 'other'], 'PROVEDOR');
  enumValue(p.transport, ['connector', 'api', 'csv', 'none'], 'TRANSPORTE');
  if (p.transport === 'connector' && p.provider === 'other') throw new Error('PROVEDOR: CONECTOR_NAO_EXISTE');
  if (!Array.isArray(p.requiredFlows) || p.requiredFlows.length === 0 ||
      p.requiredFlows.length > FLOW_KEYS.length ||
      p.requiredFlows.some((key) => !FLOW_KEYS.includes(key)) ||
      new Set(p.requiredFlows).size !== p.requiredFlows.length) throw new Error('FLUXOS: LISTA_INVALIDA');
  exactKeys(p.vendorCapabilities, FLOW_KEYS, 'CAPACIDADES');
  for (const key of FLOW_KEYS) enumValue(p.vendorCapabilities[key], EVIDENCE_VALUES, `CAPACIDADE_${key}`);
  exactKeys(p.operation, OPERATION_KEYS, 'OPERACAO');
  for (const key of OPERATION_KEYS) {
    if (typeof p.operation[key] !== 'boolean') throw new Error(`OPERACAO_${key}: BOOLEANO_OBRIGATORIO`);
  }
  exactKeys(p.evidence, EVIDENCE_KEYS, 'EVIDENCIAS');
  for (const key of EVIDENCE_KEYS) enumValue(p.evidence[key], EVIDENCE_VALUES, `EVIDENCIA_${key}`);
  return p;
}

const LABELS = Object.freeze({
  catalog_import: 'Produtos e preços para Store App',
  stock_import: 'Estoque físico para Store App',
  order_export: 'Pedidos Store App para ERP',
  order_status_read: 'Consulta de status externo',
  fiscal_reference: 'Conciliação fiscal automatizada',
});
const EVIDENCE_LABELS = Object.freeze({
  accessValidated: 'Acesso autorizado e documentação/importação verificados',
  stableProductIds: 'Identificadores de produtos/variantes estáveis',
  stockAuthorityDefined: 'Fonte oficial e política de estoque definidas',
  customerDataAuthorization: 'Base legal e autorização de acesso a dados do comprador verificadas',
  sandboxAvailable: 'Ambiente de homologação disponível',
  catalogSampleTested: 'Amostra real de catálogo conferida',
  orderSampleTested: 'Pedido de homologação reconciliado',
  pilotReconciled: 'Piloto assistido com dados conciliados',
});
function item(code, message, category) { return {code, message, category}; }

export function assessProfile(input) {
  const p = validateProfile(input);
  const hard = [], pending = [], notices = [];
  const pushHard = (code, message) => hard.push(item(code, message, 'scope'));
  const pushPending = (code, message) => pending.push(item(code, message, 'evidence'));
  const pushNotice = (code, message) => notices.push(item(code, message, 'notice'));

  const target = p.transport === 'csv' ? MATRIX.csv : p.transport === 'connector' ? MATRIX[p.provider] : null;
  let approach;
  if (p.transport === 'none') {
    approach = 'SEM_INTERFACE_CONFIRMADA';
    pushHard('NO_INTERFACE', 'Não há canal autorizado de importação/exportação confirmado.');
  } else if (p.transport === 'api') {
    approach = 'CONECTOR_API_SOB_MEDIDA';
    pushHard('API_CUSTOM_CONNECTOR', 'API disponível não significa conector implementado: desenvolver e testar adaptador específico.');
  } else if (p.transport === 'connector') {
    approach = 'CONECTOR_EXISTENTE_INICIAL';
    pushNotice('INITIAL_CONNECTOR', 'Adaptador inicial existente; não homologado com uma conta real do cliente.');
  } else {
    approach = 'CSV_ASSISTIDO';
    pushNotice('CSV_NOT_REALTIME', 'Arquivos CSV são assistidos. A exportação de pedidos gera arquivo para importação manual, não envio automático nem aceite confirmado pelo ERP.');
  }

  for (const flow of p.requiredFlows) {
    if (p.transport === 'connector' || p.transport === 'csv') {
      if (!target.flows.includes(flow)) {
        pushHard(`UNSUPPORTED_${flow.toUpperCase()}`, `${LABELS[flow]}: não implementado neste conector.`);
      }
    }
    if (p.vendorCapabilities[flow] === 'unsupported') {
      pushHard(`PROVIDER_UNSUPPORTED_${flow.toUpperCase()}`, `${LABELS[flow]}: fornecedor informou que não oferece este fluxo.`);
    } else if (p.vendorCapabilities[flow] === 'unconfirmed') {
      pushPending(`VERIFY_${flow.toUpperCase()}`, `${LABELS[flow]}: confirmar com documentação, exportação ou homologação real.`);
    }
  }
  const needsCatalog = p.requiredFlows.includes('catalog_import');
  const needsStock = p.requiredFlows.includes('stock_import');
  const needsOrders = p.requiredFlows.includes('order_export');
  const needsFiscal = p.requiredFlows.includes('fiscal_reference');
  if (p.transport === 'connector' && p.operation.variants && needsCatalog) {
    pushHard('VARIANTS_VENDOR_CONNECTOR', 'Conector do fornecedor atual só trata produtos simples; grades precisam de implementação específica.');
  }
  if ((p.transport === 'connector' || p.transport === 'csv') && needsStock &&
      p.operation.multipleWarehouses) {
    pushHard('MULTI_WAREHOUSE_STOCK', 'Estoque por vários depósitos não está mapeado neste conector.');
  }
  if ((p.transport === 'connector' || p.transport === 'csv') && needsStock &&
      p.operation.fractionalStock) {
    pushHard('FRACTIONAL_STOCK', 'Saldo fracionário não é suportado pela importação atual.');
  }
  if (p.transport === 'connector' && needsOrders) {
    if (p.operation.delivery) pushHard('ORDER_DELIVERY', 'Exportação de pedidos com entrega não está homologada nesta versão.');
    if (p.operation.discounts) pushHard('ORDER_DISCOUNTS', 'Exportação de pedidos com desconto não está suportada nesta versão.');
    if (p.operation.splitPayments) pushHard('ORDER_SPLIT_PAYMENTS', 'Exportação de pagamento misto não está suportada nesta versão.');
  }
  if (p.requiredFlows.includes('order_status_read')) {
    pushNotice('EXTERNAL_STATUS_ONLY', 'Consulta de status grava apenas metadados externos; não altera pagamento, entrega ou estoque.');
  }
  if (needsFiscal) pushHard('FISCAL_NOT_IMPLEMENTED', 'Sem emissão nem validação fiscal integrada; referências armazenadas não equivalem a NF-e/NFC-e emitida.');

  const requiredEvidence = ['accessValidated'];
  if (needsCatalog || needsStock || needsOrders) requiredEvidence.push('stableProductIds');
  if (needsStock) requiredEvidence.push('stockAuthorityDefined');
  if (needsOrders) requiredEvidence.push('customerDataAuthorization');
  if (p.transport !== 'csv') requiredEvidence.push('sandboxAvailable');
  if (needsCatalog || needsStock) requiredEvidence.push('catalogSampleTested');
  if (needsOrders) requiredEvidence.push('orderSampleTested');
  // A conciliação piloto é pré-condição para revisão comercial, não para iniciar homologação.
  for (const key of requiredEvidence) {
    if (p.evidence[key] === 'unsupported') {
      pushHard(`EVIDENCE_UNAVAILABLE_${key.toUpperCase()}`, `${EVIDENCE_LABELS[key]}: indisponível.`);
    } else if (p.evidence[key] !== 'confirmed') {
      pushPending(`EVIDENCE_PENDING_${key.toUpperCase()}`, `${EVIDENCE_LABELS[key]}: pendente.`);
    }
  }
  if (p.evidence.pilotReconciled === 'unsupported') {
    pushHard('PILOT_FAILED_OR_UNAVAILABLE', 'Piloto assistido reprovado ou indisponível; não liberar produção.');
  } else if (p.evidence.pilotReconciled !== 'confirmed') {
    pushPending('PILOT_NOT_RECONCILED', 'Piloto assistido ainda não foi reconciliado; não liberar produção.');
  }
  let verdict;
  if (hard.length) verdict = 'REQUIRES_SCOPE_CHANGE';
  else if (pending.some(x => x.code !== 'PILOT_NOT_RECONCILED')) verdict = 'DISCOVERY_PENDING';
  else if (p.evidence.pilotReconciled !== 'confirmed') verdict = 'READY_FOR_ASSISTED_PILOT';
  else verdict = 'MANUAL_PRODUCTION_REVIEW';

  return {
    schemaVersion: 1,
    storeAlias: p.storeAlias,
    provider: p.provider,
    transport: p.transport,
    approach,
    verdict,
    productionAuthorized: false,
    note: 'Relatório offline declaratório; não testa APIs nem autoriza produção. Exige homologação e aprovação humana.',
    requiredFlows: p.requiredFlows.map(key => ({code:key, label:LABELS[key]})),
    implementation: target ? {name:target.label, note:target.note} : null,
    summary: {hardBlockers:hard.length, pendingChecks:pending.length, notices:notices.length},
    hardBlockers: hard,
    pendingChecks: pending,
    notices,
  };
}

export function reportMarkdown(report) {
  const lines = [
    '# Frequência40 — Avaliação de compatibilidade ERP/PDV',
    '',
    `- Loja (apelido técnico): \`${report.storeAlias}\``,
    `- Provedor: ${report.provider}`,
    `- Caminho: ${report.approach}`,
    `- Parecer: **${report.verdict}**`,
    '- Produção autorizada: **NÃO** (sempre exige aprovação manual)',
    '',
    '## Fluxos solicitados',
    ...report.requiredFlows.map(f => `- ${f.label}`),
    '',
    '## Pendências de escopo',
    ...(report.hardBlockers.length ? report.hardBlockers.map(x=>`- **${x.code}** — ${x.message}`) : ['- Nenhuma identificada no questionário']),
    '',
    '## Evidências pendentes',
    ...(report.pendingChecks.length ? report.pendingChecks.map(x=>`- **${x.code}** — ${x.message}`) : ['- Nenhuma informada']),
    '',
    '## Observações',
    ...report.notices.map(x=>`- ${x.code}: ${x.message}`),
    '',
    `**Limite:** ${report.note}`,
    '',
  ];
  return lines.join('\n');
}
