type ErrorRecord = Record<string, unknown>;

function safeMessage(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, '[URL do banco ocultada]')
    .replace(/\b(password|passwd|pwd|token|secret)\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[oculto]');
}

/** AggregateError pode ter message vazio: percorre apenas campos de diagnóstico. */
export function formatDatabaseError(error: unknown): string {
  const messages = new Set<string>();
  const codes = new Set<string>();
  const seen = new Set<object>();
  function visit(value: unknown, depth: number): void {
    if (depth > 4 || value === null || value === undefined) return;
    if (typeof value === 'string') {
      if (value.trim()) messages.add(safeMessage(value));
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const record = value as ErrorRecord;
    const code = typeof record.code === 'string' ? record.code : '';
    if (code) codes.add(code);
    const message = typeof record.message === 'string' ? record.message.trim() : '';
    if (code || message) messages.add(safeMessage([code, message].filter(Boolean).join(': ')));
    if (Array.isArray(record.errors)) {
      for (const child of record.errors.slice(0, 8)) visit(child, depth + 1);
    }
    visit(record.cause, depth + 1);
  }
  visit(error, 0);
  if (!messages.size) messages.add('Erro sem mensagem. Verifique a conexão e a configuração do PostgreSQL.');
  const hints: string[] = [];
  if (codes.has('ECONNREFUSED')) hints.push('Conexão recusada: confira host/porta e se o PostgreSQL está ativo. localhost aponta para este computador ou container.');
  if (codes.has('ENOTFOUND') || codes.has('EAI_AGAIN')) hints.push('Host não encontrado: no Windows, use a conexão pública/TCP Proxy; o endereço .railway.internal pertence à rede privada do Railway.');
  if (codes.has('ETIMEDOUT') || codes.has('CONNECT_TIMEOUT')) hints.push('Tempo de conexão esgotado: confira rede, firewall e disponibilidade do banco.');
  if (codes.has('28P01')) hints.push('Credenciais recusadas: confira usuário e senha em DATABASE_URL, sem compartilhar a URL completa.');
  if (codes.has('3D000')) hints.push('Banco não encontrado: confira o nome do banco em DATABASE_URL.');
  if (codes.has('DEPTH_ZERO_SELF_SIGNED_CERT') || codes.has('SELF_SIGNED_CERT_IN_CHAIN')) hints.push('Falha de certificado: confira a configuração TLS e a CA exigida pelo provedor.');
  return [...messages, ...hints].join('\n');
}
