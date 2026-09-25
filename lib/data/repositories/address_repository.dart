import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../models/saved_address.dart';

class AddressRepository {
  static const _key = 'saved_addresses';

  Future<List<SavedAddress>> getAddresses() async {
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
    final prefs = await SharedPreferences.getInstance();

    final encoded = jsonEncode(
      addresses.map((e) => e.toJson()).toList(),
    );

    await prefs.setString(_key, encoded);
  }
}
