import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/repositories/address_repository.dart';
import '../models/saved_address.dart';

final addressRepositoryProvider = Provider<AddressRepository>((ref) {
  return AddressRepository();
});

final addressesProvider =
    StateNotifierProvider<AddressNotifier, AsyncValue<List<SavedAddress>>>(
  (ref) {
    return AddressNotifier(
      ref.watch(addressRepositoryProvider),
    );
  },
);

class AddressNotifier extends StateNotifier<AsyncValue<List<SavedAddress>>> {
  final AddressRepository _repository;

  AddressNotifier(this._repository) : super(const AsyncValue.loading()) {
    load();
  }

  Future<void> load() async {
    try {
      final addresses = await _repository.getAddresses();
      state = AsyncValue.data(addresses);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }

  Future<void> addAddress(SavedAddress address) async {
    final List<SavedAddress> current =
        List<SavedAddress>.from(state.value ?? <SavedAddress>[]);

    // Se for o primeiro ou marcado como principal, limpa os outros
    final shouldBePrimary = current.isEmpty || address.isPrimary;

    final List<SavedAddress> updated =
        current.map((item) => item.copyWith(isPrimary: false)).toList();

    updated.add(
      address.copyWith(isPrimary: shouldBePrimary),
    );

    await _repository.saveAddresses(updated);
    state = AsyncValue.data(updated);
  }

  Future<void> updateAddress(SavedAddress address) async {
    List<SavedAddress> current =
        List<SavedAddress>.from(state.value ?? <SavedAddress>[]);

    if (address.isPrimary) {
      current = current.map((item) => item.copyWith(isPrimary: false)).toList();
    }

    final index = current.indexWhere((e) => e.id == address.id);
    if (index == -1) return;

    current[index] = address;

    await _repository.saveAddresses(current);
    state = AsyncValue.data(current);
  }

  Future<void> removeAddress(String id) async {
    List<SavedAddress> current =
        List<SavedAddress>.from(state.value ?? <SavedAddress>[]);

    final index = current.indexWhere((e) => e.id == id);
    if (index == -1) return;

    final wasPrimary = current[index].isPrimary;
    current.removeAt(index);

    if (wasPrimary && current.isNotEmpty) {
      current[0] = current[0].copyWith(isPrimary: true);
    }

    await _repository.saveAddresses(current);
    state = AsyncValue.data(current);
  }

  Future<void> setPrimary(String id) async {
    List<SavedAddress> current =
        List<SavedAddress>.from(state.value ?? <SavedAddress>[]);

    current = current
        .map(
          (item) => item.copyWith(isPrimary: item.id == id),
        )
        .toList();

    await _repository.saveAddresses(current);
    state = AsyncValue.data(current);
  }
}
