import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';
import '../../core/network/loja_api.dart';

import '../../models/saved_address.dart';

class AddressRepository {
  static const _key = 'saved_addresses';

  Future<List<SavedAddress>> getAddresses() async {
    if (LojaBackend.isRailway) {
      final result = await LojaApi.instance.request('GET', '/v1/me/addresses', authenticated: true);
      return (result['addresses'] as List? ?? const [])
          .map((item) => SavedAddress.fromJson(Map<String, dynamic>.from(item as Map)))
          .toList();
    }
    final prefs = await SharedPreferences.getInstance();

    final data = prefs.getString(_key);

    if (data == null || data.isEmpty) {
      return [];
    }

    final decoded = jsonDecode(data) as List<dynamic>;

    return decoded
        .map(
          (item) => SavedAddress.fromJson(
            Map<String, dynamic>.from(item),
          ),
        )
        .toList();
  }

  Future<void> saveAddresses(
    List<SavedAddress> addresses,
  ) async {
    if (LojaBackend.isRailway) {
      throw StateError('No Railway, endereços são atualizados individualmente na API.');
    }
    final prefs = await SharedPreferences.getInstance();

    final encoded = jsonEncode(
      addresses.map((e) => e.toJson()).toList(),
    );

    await prefs.setString(_key, encoded);
  }
  Map<String, dynamic> _payload(SavedAddress a) => {
    'label': a.label, 'zipCode': a.zipCode.replaceAll(RegExp(r'\D'), ''),
    'street': a.street, 'number': a.number, 'complement': a.complement,
    'neighborhood': a.neighborhood, 'city': a.city,
    'state': a.state.toUpperCase(), 'isPrimary': a.isPrimary,
  };

  Future<void> addRemote(SavedAddress address) async {
    await LojaApi.instance.request('POST', '/v1/me/addresses',
      body: _payload(address), authenticated: true);
  }
  Future<void> updateRemote(SavedAddress address) async {
    await LojaApi.instance.request('PUT', '/v1/me/addresses/${address.id}',
      body: _payload(address), authenticated: true);
  }
  Future<void> deleteRemote(String id) async {
    await LojaApi.instance.request('DELETE', '/v1/me/addresses/$id', authenticated: true);
  }
  Future<void> primaryRemote(String id) async {
    await LojaApi.instance.request('POST', '/v1/me/addresses/$id/primary', authenticated: true);
  }
}
