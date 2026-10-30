/// Valores monetários são convertidos em centavos sem arredondar frações ocultas.
int? adminPriceCents(String input) {
  var value = input.trim().replaceFirst(RegExp(r'^R\$\s*'), '');
  if (value.contains(',')) {
    if (!RegExp(r'^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$').hasMatch(value)) {
      return null;
    }
    value = value.replaceAll('.', '').replaceAll(',', '.');
  } else if (RegExp(r'^\d{1,3}(?:\.\d{3})+$').hasMatch(value)) {
    value = value.replaceAll('.', '');
  }
  if (!RegExp(r'^\d{1,7}(?:\.\d{1,2})?$').hasMatch(value)) return null;
  final pieces = value.split('.');
  final cents = int.parse(pieces.first) * 100 +
      int.parse((pieces.length > 1 ? pieces.last : '').padRight(2, '0'));
  return cents > 0 && cents <= 100000000 ? cents : null;
}

List<String> catalogOptions(String text) {
  final found = <String>{};
  return text
      .split(',')
      .map((part) => part.trim())
      .where((part) => part.isNotEmpty && found.add(part.toLowerCase()))
      .toList();
}

int activeCatalogStock(Iterable<dynamic> variants) => variants
    .whereType<Map>()
    .where((v) => v['status'] == 'ACTIVE')
    .fold(0, (sum, v) => sum + (int.tryParse('${v['available']}') ?? 0));
