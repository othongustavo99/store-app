import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/models/saved_address.dart';

void main() {
  test('endereço da API preserva o ID, a preferência e os campos comerciais', () {
    final address = SavedAddress.fromJson(const {
      'id': '47bcdfb3-74e6-4b78-aa9a-f42ac9dafbf0',
      'label': 'Casa', 'zipCode': '12900000', 'street': 'Rua das Flores',
      'number': '42', 'complement': 'Fundos', 'neighborhood': 'Centro',
      'city': 'Bragança Paulista', 'state': 'SP', 'isPrimary': true,
    });
    expect(address.isPrimary, true);
    expect(address.formattedAddress, contains('CEP 12900000'));
    expect(SavedAddress.fromJson(address.toJson()).id, address.id);
  });

  test('alterar nome de exibição do endereço preserva a identificação', () {
    final address = SavedAddress(
      id: 'def42b66-cf2c-49ea-af26-522b4d889de1', label: 'Casa',
      zipCode: '12900000', street: 'Rua das Flores', number: '42',
      complement: '', neighborhood: 'Centro', city: 'Bragança Paulista',
      state: 'SP', isPrimary: false,
    );
    final changed = address.copyWith(label: 'Trabalho', isPrimary: true);
    expect(changed.id, address.id);
    expect(changed.isPrimary, true);
    expect(address.isPrimary, false);
  });
}
