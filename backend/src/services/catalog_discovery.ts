const sizeOrder = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'XXG', 'XXL', 'XXXL', 'ÚNICO', 'UNICO'];

export function catalogFacets(rows: readonly { color: string | null; size: string | null }[]) {
  function unique(values: (string | null)[]): string[] {
    const result = new Map<string, string>();
    for (const raw of values) {
      const value = raw?.trim();
      if (value && !result.has(value.toLocaleLowerCase('pt-BR'))) result.set(value.toLocaleLowerCase('pt-BR'), value);
    }
    return [...result.values()];
  }
  const compare = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
  const sizes = unique(rows.map(row => row.size)).sort((a, b) => {
    const first = sizeOrder.indexOf(a.toUpperCase());
    const second = sizeOrder.indexOf(b.toUpperCase());
    if (first >= 0 && second >= 0) return first - second;
    if (first >= 0) return -1;
    if (second >= 0) return 1;
    return compare(a, b);
  });
  return { colors: unique(rows.map(row => row.color)).sort(compare), sizes };
}
