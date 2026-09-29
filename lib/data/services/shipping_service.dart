import 'dart:convert';
import 'package:http/http.dart' as http;

class ShippingOption {
  final String name;
  final double price;
  final int days;
  final String code;

  const ShippingOption({
    required this.name,
    required this.price,
    required this.days,
    required this.code,
  });
}

class ShippingService {
  /// Consulta CEP via ViaCEP (valida e retorna cidade/UF)
  Future<Map<String, dynamic>?> fetchCep(String cep) async {
    final clean = cep.replaceAll(RegExp(r'[^0-9]'), '');
    if (clean.length != 8) return null;

    final res =
        await http.get(Uri.parse('https://viacep.com.br/ws/$clean/json/'));
    if (res.statusCode != 200) return null;

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (data['erro'] == true) return null;
    return data;
  }

  /// Tabela simples de frete (substitua depois por Correios / Melhor Envio)
  List<ShippingOption> calculate(String uf, double productPrice) {
    // Frete grátis acima de R$ 199
    if (productPrice >= 199) {
      return const [
        ShippingOption(name: 'PAC', price: 0, days: 8, code: 'PAC'),
        ShippingOption(name: 'SEDEX', price: 12.90, days: 3, code: 'SEDEX'),
      ];
    }

    final isSP = uf.toUpperCase() == 'SP';
    final isSudeste = ['SP', 'RJ', 'MG', 'ES'].contains(uf.toUpperCase());

    if (isSP) {
      return const [
        ShippingOption(name: 'PAC', price: 12.90, days: 4, code: 'PAC'),
        ShippingOption(name: 'SEDEX', price: 19.90, days: 2, code: 'SEDEX'),
      ];
    }
    if (isSudeste) {
      return const [
        ShippingOption(name: 'PAC', price: 18.90, days: 6, code: 'PAC'),
        ShippingOption(name: 'SEDEX', price: 27.90, days: 3, code: 'SEDEX'),
      ];
    }
    return const [
      ShippingOption(name: 'PAC', price: 24.90, days: 10, code: 'PAC'),
      ShippingOption(name: 'SEDEX', price: 34.90, days: 5, code: 'SEDEX'),
    ];
  }
}
