// Regra pura para validação e testes, também aplicada sob bloqueio FOR UPDATE na API.
export function stockAfterAdjustment(onHand: number, reserved: number, delta: number): number {
  if (!Number.isSafeInteger(onHand) || !Number.isSafeInteger(reserved) ||
      !Number.isSafeInteger(delta) || !delta || Math.abs(delta) > 100000) {
    throw new Error('Quantidade inválida para ajuste de estoque.');
  }
  const after = onHand + delta;
  if (!Number.isSafeInteger(after) || after > 1000000) throw new Error('Estoque excede o limite permitido.');
  if (after < reserved) throw new Error('A saída ultrapassa o estoque disponível; existem unidades reservadas.');
  if (after < 0) throw new Error('Estoque não pode ficar negativo.');
  return after;
}
